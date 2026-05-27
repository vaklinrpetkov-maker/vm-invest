import { recordAuditEvent } from "@/lib/auth/audit";
import {
  FORM_EMAIL_FROM,
  FORM_EMAIL_SUBJECT,
  parseEmail,
  type ParsedEmail,
  type ParseFailure,
} from "@/lib/leads/email-parser";
import { resolveOrCreateContactByForm } from "@/lib/leads/matcher";
import { prisma } from "@/lib/prisma";

// One-shot ingestion of a raw email. Safe to call repeatedly — dedup on
// Message-ID ensures the second call is a no-op. Used by the admin test page
// now and by the real IMAP/webhook source in LP2-B.
//
// Returns a discriminated summary that the test UI can render.

export type IngestOutcome =
  | { kind: "skipped_duplicate"; existingLeadId: string }
  | { kind: "skipped_not_form"; reason: "wrong_from" | "wrong_subject" }
  | { kind: "created_unparsed"; leadId: string; error: string }
  | { kind: "created"; leadId: string; contactId: string; matchConfidence: string | null };

export async function ingestRawEmail(raw: string): Promise<IngestOutcome> {
  const parseResult = parseEmail(raw);

  // ── Not-our-form filter ─────────────────────────────────────────────────
  // Applied before message-id dedup so we don't accidentally store spam.
  const from =
    parseResult.ok ? parseResult.parsed.from : parseResult.failure.from ?? "";
  const subject =
    parseResult.ok ? parseResult.parsed.subject : parseResult.failure.subject ?? "";

  if (!from.toLowerCase().includes(FORM_EMAIL_FROM.toLowerCase())) {
    return { kind: "skipped_not_form", reason: "wrong_from" };
  }
  if (!subject.startsWith(FORM_EMAIL_SUBJECT)) {
    return { kind: "skipped_not_form", reason: "wrong_subject" };
  }

  // ── Parse failure → create an email_unparsed lead for human triage ──────
  if (!parseResult.ok) {
    return createUnparsedLead(parseResult.failure);
  }

  // ── Dedup on Message-ID ─────────────────────────────────────────────────
  const parsed = parseResult.parsed;
  const existing = await prisma.lead.findUnique({
    where: { emailMessageId: parsed.messageId },
    select: { id: true },
  });
  if (existing) {
    return { kind: "skipped_duplicate", existingLeadId: existing.id };
  }

  return createLeadFromParsed(parsed);
}

async function createUnparsedLead(failure: ParseFailure): Promise<IngestOutcome> {
  // Still dedup even for unparsed — if we see the same Message-ID twice we
  // don't want two broken rows.
  if (failure.messageId) {
    const existing = await prisma.lead.findUnique({
      where: { emailMessageId: failure.messageId },
      select: { id: true },
    });
    if (existing) return { kind: "skipped_duplicate", existingLeadId: existing.id };
  }

  // Unparsed leads need a Contact too, but we don't have enough info to match.
  // Park them under a single placeholder "Система — Неразпознат имейл" contact
  // so the FK is satisfied. Admin fills real contact info when they triage.
  const placeholder = await prisma.contact.upsert({
    where: { id: "00000000-0000-0000-0000-000000000000" },
    create: {
      id: "00000000-0000-0000-0000-000000000000",
      fullName: "Система — Неразпознати имейли",
      type: "Електронно запитване",
      notes:
        "Автоматичен placeholder за имейл-лидове, които не можаха да се парснат. Преместете лида на реален контакт при триаж.",
    },
    update: {},
    select: { id: true },
  });

  const lead = await prisma.lead.create({
    data: {
      contactId: placeholder.id,
      source: "email_unparsed",
      status: "new",
      message: null,
      emailReceivedAt: failure.receivedAt,
      emailFrom: failure.from,
      emailSubject: failure.subject,
      emailMessageId: failure.messageId,
      rawEmailBody: failure.rawBody.slice(0, 16000), // sanity cap
      parseError: failure.error,
      timerStartedAt: failure.receivedAt ?? new Date(),
    },
    select: { id: true },
  });

  await recordAuditEvent({
    action: "leads.email.parse_failed",
    targetType: "lead",
    targetId: lead.id,
    payload: { error: failure.error, messageId: failure.messageId },
  });

  return { kind: "created_unparsed", leadId: lead.id, error: failure.error };
}

async function createLeadFromParsed(p: ParsedEmail): Promise<IngestOutcome> {
  const { fields } = p;
  // parseEmail() guarantees these are non-null when ok=true.
  const email = fields.email!;
  const phone = fields.phone;
  const name = fields.name!;

  // Match/create the Contact.
  const match = await resolveOrCreateContactByForm({ email, phone, fullName: name });

  // Compose the properties entry. Both project and property may be missing for
  // a technically-valid-but-low-info form. Format: "Проект — Имот" or just
  // "Проект" / "Имот" / "" as fallback.
  const project = fields.project?.trim();
  const property = fields.property?.trim();
  const propertyLine =
    project && property
      ? `${project} — ${property}`
      : project ?? property ?? "";
  const properties = propertyLine ? [propertyLine] : [];

  const lead = await prisma.lead.create({
    data: {
      contactId: match.contactId,
      source: "email_form",
      status: "new",
      properties,
      message: fields.message,
      emailReceivedAt: p.receivedAt,
      emailFrom: p.from,
      emailSubject: p.subject,
      emailMessageId: p.messageId,
      rawEmailBody: p.rawPlainBody.slice(0, 16000),
      matchConfidence: match.confidence,
      matchFlags: match.flags,
      timerStartedAt: p.receivedAt,
    },
    select: { id: true },
  });

  await recordAuditEvent({
    action: "leads.email.received",
    targetType: "lead",
    targetId: lead.id,
    payload: {
      messageId: p.messageId,
      from: p.from,
      matchConfidence: match.confidence,
      matchFlags: match.flags,
    },
  });

  return {
    kind: "created",
    leadId: lead.id,
    contactId: match.contactId,
    matchConfidence: match.confidence,
  };
}
