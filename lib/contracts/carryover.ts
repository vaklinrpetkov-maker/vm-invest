import { Prisma } from "@prisma/client";

// When a Вноска is overpaid, the excess reduces another Вноска's expected
// amount. The carryover is **bidirectional** in display:
//
//   1. Forward pass — overpayment from Вноска N reduces the effective due of
//      Вноска N+1. Standard temporal carryover.
//   2. Backward pass — any final unused credit (overpayment that arrives after
//      all subsequent dues are already 0) is applied to earlier Вноски with
//      outstanding `adjustedRemaining`, oldest first. Without this, an
//      overpayment on a later milestone leaves an earlier-still-owed milestone
//      visually owed even though the customer has, in net, paid the contract
//      total. The contract-level totalRemainingEur and the sum-of-per-payment
//      view would disagree.
//
// Example (from the seed data):
//   Raw:                      Due=148590  Paid=74177.68  Remaining=74412.32
//                             Due=0       Paid=74177.18  Remaining=-74177.18
//                             Due=0       Paid=0         Remaining=0
//                             Due=0       Paid=0         Remaining=0
//   After forward only:       Remaining=[74412.32, 0, 0, 0]  Σ=74412.32
//                             Final unused credit = 74177.18 (sits unused)
//   After forward + backward: Remaining=[235.14,   0, 0, 0]  Σ=235.14   ← contract net
//                             Final unused credit = 0
//
// Forward pass algorithm (per Вноска):
//   credit_in(0) = 0
//   credit_used(N)      = min(credit_in(N), rawDue(N))
//   credit_passthrough  = credit_in(N) - credit_used(N)
//   adjustedDue(N)      = rawDue(N) - credit_used(N)
//   afterPaid(N)        = adjustedDue(N) - paid(N)
//   overpayment(N)      = max(0, -afterPaid(N))
//   adjustedRemaining(N)= max(0, afterPaid(N))
//   credit_in(N+1)      = credit_passthrough + overpayment(N)
//
// Backward pass (after the forward loop):
//   leftover = credit_in(after last)
//   walk i = 0..N-1: consume = min(leftover, adjustedRemaining(i))
//                    adjustedRemaining(i) -= consume
//                    backwardCreditApplied(i) = consume
//                    leftover -= consume
//   unusedCreditEur = leftover  // truly excess; the customer has overpaid the
//                                 contract net.
//
// The DB still keeps the raw CSV values — this whole function is a pure
// presentation-layer compute. Same data, smarter view.

export type RawPayment = {
  dueEur: Prisma.Decimal;
  paidEur: Prisma.Decimal;
};

export type AdjustedPayment = {
  rawDueEur: Prisma.Decimal;
  rawPaidEur: Prisma.Decimal;
  rawRemainingEur: Prisma.Decimal;
  /** Credit received from earlier overpayments (forward pass). */
  creditInEur: Prisma.Decimal;
  /** Credit applied from future overpayments (backward pass). */
  backwardCreditAppliedEur: Prisma.Decimal;
  /** Due after subtracting credit_in; clamped to 0. */
  adjustedDueEur: Prisma.Decimal;
  /** Final remaining after both forward and backward passes. */
  adjustedRemainingEur: Prisma.Decimal;
  /** Overpayment created in this step (forward pass; flows to later Вноски). */
  overpaymentEur: Prisma.Decimal;
};

export type CarryoverResult = {
  adjusted: AdjustedPayment[];
  /** Excess credit that couldn't be consumed by any Вноска — represents
   * a net overpayment of the contract total. UI may render as "free credit". */
  unusedCreditEur: Prisma.Decimal;
};

const ZERO = new Prisma.Decimal(0);

export function applyCarryover(payments: readonly RawPayment[]): AdjustedPayment[] {
  return computeCarryover(payments).adjusted;
}

export function computeCarryover(
  payments: readonly RawPayment[],
): CarryoverResult {
  const result: AdjustedPayment[] = [];
  let creditIn = ZERO;

  // Forward pass
  for (const p of payments) {
    const raw = new Prisma.Decimal(p.dueEur);
    const paid = new Prisma.Decimal(p.paidEur);
    const rawRemaining = raw.minus(paid);

    const creditUsed = Prisma.Decimal.min(creditIn, raw);
    const creditPassthrough = creditIn.minus(creditUsed);
    let adjustedDue = raw.minus(creditUsed);
    if (adjustedDue.lt(0)) adjustedDue = ZERO; // defensive, shouldn't hit

    const afterPaid = adjustedDue.minus(paid);
    const overpayment = afterPaid.lt(0) ? afterPaid.neg() : ZERO;
    const adjustedRemaining = afterPaid.lt(0) ? ZERO : afterPaid;

    result.push({
      rawDueEur: raw,
      rawPaidEur: paid,
      rawRemainingEur: rawRemaining,
      creditInEur: creditIn,
      backwardCreditAppliedEur: ZERO, // filled in by backward pass
      adjustedDueEur: adjustedDue,
      adjustedRemainingEur: adjustedRemaining,
      overpaymentEur: overpayment,
    });

    creditIn = creditPassthrough.plus(overpayment);
  }

  // Backward pass: consume any leftover credit against earlier remainings.
  let leftover = creditIn;
  for (let i = 0; i < result.length && leftover.gt(0); i++) {
    const row = result[i];
    if (row.adjustedRemainingEur.lte(0)) continue;
    const consume = Prisma.Decimal.min(leftover, row.adjustedRemainingEur);
    row.adjustedRemainingEur = row.adjustedRemainingEur.minus(consume);
    row.backwardCreditAppliedEur = row.backwardCreditAppliedEur.plus(consume);
    leftover = leftover.minus(consume);
  }

  return { adjusted: result, unusedCreditEur: leftover };
}
