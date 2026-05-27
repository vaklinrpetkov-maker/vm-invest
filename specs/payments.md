# Payments + Installments

A short reference for the **payment-tracking sub-module** of Contracts. There is no separate `/payments` route — the data hangs off `Contract` and renders on `/contracts/[id]`. This spec exists so the rules (especially carryover) live in one prose-readable place instead of being scattered across code comments.

## 1. What "payment" means here

Each Bulgarian construction contract in this team's workflow has up to **four milestone payments** (Вноска 1–4), each tied to a construction-completion event:

| # | Milestone | When the buyer pays |
|---|---|---|
| 1 | **ПД** (Подписване) | Contract signing — typically the deposit |
| 2 | **Акт 14** | First completion stage |
| 3 | **Акт 15** | Second completion stage |
| 4 | **Акт 16** | Final completion (Акт обр. 16) |

Each milestone has a **scheduled amount** (`dueEur`) and a running **paid total** (`paidEur`). One milestone can be paid in **multiple installments** (the buyer doesn't have to pay the whole 50 000 € all at once), and each installment is on one of two tracks: **Cash** or **Bank**.

So the data model is two levels:

```
Contract
  └─ ContractPayment (×4, one per milestone)
      └─ ContractInstallment (any number, each on Cash or Bank track)
```

## 2. Data model (current)

### 2.1 `ContractPayment`
```
id
contractId          FK → Contract (cascade delete)
number              1..4 (the milestone position; unique per contract)
dueEur              decimal(12,2) — scheduled amount
paidEur             decimal(12,2) — sum of completed installments
remainingEur        decimal(12,2) — RAW remaining = dueEur − paidEur,
                     **without** carryover logic
```

`paidEur` and `remainingEur` are stored values, updated at import time. The carryover-adjusted display values (§4) are computed on read.

### 2.2 `ContractInstallment`
```
id
paymentId           FK → ContractPayment (cascade delete)
track               "CASH" | "BANK"
amountEur           decimal(12,2)
paidAt              date (nullable)
```

**Cap**: at most 3 installments per track per milestone. So a single milestone can hold 0–6 installments total (3 cash + 3 bank).

### 2.3 What's NOT yet built

- No UI to create or edit `ContractPayment` rows from inside the app. They land only via the CSV import (§3).
- No UI to add or edit individual `ContractInstallment` rows.
- No standalone `/payments` route. Display lives inside `/contracts/[id]`.

## 3. How payments get into the DB

Source of truth right now is the CSV at `files/contracts/Contracts.csv`. `scripts/import-contracts.ts` (npm-aliased `contracts:import`) maps the spreadsheet's per-event columns onto installments:

| CSV column → | Track | Notes |
|---|---|---|
| ДГ — сума / дата | BANK | |
| ПД — сума / дата | BANK | Date also propagates to `Contract.signedAt` (takes priority over ДГ's date) |
| СМР Банка — сума / дата | BANK | |
| СМР Кеш — сума / дата | CASH | |

Deliberately dropped (not imported): `Доплащане 1`, `Доплащане 2`, `Нотариален акт`, `Договор за заем`.

`Contract.contractType` is **derived** at import from the installments:
- Both tracks populated → `SMR_KOMBINIRAN`
- BANK only with non-zero `СМР Банка` → `SMR_BANKA`
- CASH only → `SMR_KESH`
- Neither track has СМР amounts → `BEZ_SMR`

That same rule applies if/when manual creation lands — see §6.

## 4. Carryover math (the load-bearing bit)

When a buyer overpays one milestone, the excess reduces what they "still owe" on another milestone. The contract's `totalRemainingEur` already nets this out (it's `totalDueEur − totalPaidEur`, floored at 0). The per-milestone display has to agree with that contract-level number, which is what the carryover function in `lib/contracts/carryover.ts` ensures.

The algorithm is **bidirectional**:

### 4.1 Forward pass

Overpayment on milestone N reduces milestone N+1's effective due. Standard temporal carryover.

For each milestone, in order:
```
credit_in(0)        = 0
credit_used(N)      = min(credit_in(N), raw_due(N))
credit_passthrough  = credit_in(N) − credit_used(N)
adjusted_due(N)     = raw_due(N) − credit_used(N)
after_paid(N)       = adjusted_due(N) − paid(N)
overpayment(N)      = max(0, −after_paid(N))
adjusted_remaining(N) = max(0, after_paid(N))
credit_in(N+1)      = credit_passthrough + overpayment(N)
```

### 4.2 Backward pass

The forward pass leaves leftover credit after the last milestone if any milestone was overpaid by more than subsequent milestones consume. That leftover is then walked backwards through earlier milestones with non-zero `adjusted_remaining`, oldest first, to net it out.

Without the backward pass, an overpayment on milestone 4 would leave milestone 1's remaining showing the original gap — even though the contract is paid in net. The list of milestones would visually disagree with the contract total.

### 4.3 Worked example

```
Raw values:               Due       Paid       Remaining
  Milestone 1             148 590   74 177.68    74 412.32
  Milestone 2             0         74 177.18   −74 177.18
  Milestone 3             0         0            0
  Milestone 4             0         0            0

After forward pass only:  Remaining = [74 412.32, 0, 0, 0]  Σ = 74 412.32
                          Final unused credit = 74 177.18 (sits idle)

After forward + backward: Remaining = [    235.14, 0, 0, 0]  Σ = 235.14
                          Final unused credit = 0
                          Contract.totalRemainingEur = 235.14  ← matches
```

The contract net remaining (235.14 €) is what the buyer actually owes; both the per-milestone list and the contract-level value agree.

### 4.4 Where this runs

- The raw DB values are **never overwritten** by the carryover compute. It's a pure presentation-layer function.
- `computeCarryover` is called on every render of `/contracts/[id]`. Cheap — 4 milestones, two linear passes.

### 4.5 "Free credit"

`CarryoverResult.unusedCreditEur` returns leftover credit that couldn't be consumed by any milestone — i.e. the buyer has overpaid the contract net. The UI surfaces this as a "Кредит" line; the team uses it as a flag to refund or apply to other contracts manually. Not auto-resolved.

## 5. List + detail behavior today

### 5.1 `/contracts` list
The table shows `Contract.totalDueEur`, `totalPaidEur`, `totalRemainingEur` directly (DB columns, not the per-milestone carryover compute). These three are kept in sync at write time:
- `totalDueEur` — user-entered.
- `totalPaidEur` — maintained by the payments module (currently only by the CSV import; no manual edit path).
- `totalRemainingEur` — recomputed on `contract.update` from `due − paid`, floored at 0.

### 5.2 `/contracts/[id]` detail
Renders a per-milestone table:

| Column | Source |
|---|---|
| Вноска | Milestone label from §1 |
| Дължимо (нето) | `adjusted_due` after carryover |
| Платено | `raw_paid` |
| Остатък | `adjusted_remaining` after both passes |
| Инсталменти | Cash + Bank installments, each row |

Inline notes appear when:
- Sum of installment amounts disagrees with `paidEur` by >0.02 € — flagged as a data-quality issue (usually from a CSV-import edge case).
- A milestone got backward credit applied — small "↩ -X.XX €" hint so the user sees why the remaining differs from raw.

## 6. Permissions (de-facto, codified)

| Action | Admin | Manager | User |
|---|---|---|---|
| View payments + installments | ✅ | ✅ | ✅ |
| Run the CSV import | admin-only via CLI (`contracts:import`) | n/a | n/a |
| Edit payments via UI | (not built) | (not built) | (not built) |
| Edit installments via UI | (not built) | (not built) | (not built) |

When the create/edit UI ships (§7), it should follow the same role gates the rest of the Contracts module uses per `_foundations/roles.md` §3 — admin/manager free; sales-user blocked once contract is `signed`.

## 7. Future work (NOT implementation commitments)

Bundle into a single follow-up round when there's appetite:

1. **`+ Нова вноска` flow on the contract detail page.** Add a manual milestone. Form: milestone number, due amount. (Most contracts already have all 4 from the CSV; this is for any newly-created contract via the manual flow which currently lands with no payment rows.)
2. **Inline-edit on installments.** Each row gets click-to-edit cells (amount, paid date, track).
3. **Auto-create the 4 milestones on `createContract`.** When the manual create form runs, default each milestone to `dueEur = 0` (or split `totalDueEur` evenly across 4) and create the rows so the detail page isn't empty.
4. **Recompute `contractType`** on installment edits. Currently it's a one-time derivation at import.
5. **Maintain `Contract.totalPaidEur`** on installment writes. Currently the field is only updated at CSV import; manual installment edits (when the UI ships) need to recompute it.
6. **Audit log entries** for payment/installment edits. Reuse the existing `recordAuditEvent` pattern.

## 8. Edge cases worth knowing

- **Zero-due milestones**: typical for Акт 14/15/16 when the contract pays everything at ПД. The forward pass handles them naturally — `adjusted_due = 0`, any incoming credit passes through.
- **Overpayment across the whole contract**: shows up as `unusedCreditEur`. Doesn't reduce any milestone below 0.
- **Out-of-order milestone payments**: e.g. buyer pays Акт 16 before ПД. The math doesn't care about time, only the milestone number ordering. The detail page renders milestones 1→4 regardless of when each was actually paid.
- **Mid-cycle CSV re-import**: the import currently deletes + recreates payments + installments per contract. If the team ever runs `contracts:import` against a contract that's been edited manually, those edits are lost. When manual edits become possible (§7), the import path needs a "leave manually-edited contracts alone" guard.

## 9. Open questions (not blockers)

- **Should the manual create flow auto-spawn the 4 milestones?** Currently it doesn't, so the detail page shows "Все още няма вноски" until the CSV import or future manual flow adds them. Auto-spawning with `dueEur = 0` would make the page feel populated but adds noise.
- **Should `totalRemainingEur` use the carryover-adjusted value or the raw value?** Today it's the raw `due − paid` clamped to 0, which agrees with the carryover sum (because the backward pass exists). If the backward pass ever changes, we'd want a closer look.
- **Display of "unused credit"**: should we surface it on the list view? Today it only shows on the detail page.
