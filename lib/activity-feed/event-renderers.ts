// One-line Bulgarian summaries for audit events surfaced inside per-record
// activity feeds. Lookup keyed by `AuditAction`. Three rendering strategies
// per `specs/_foundations/activity-feed.md` §6.1:
//
//   - Label-only: AUDIT_LABELS[action].label is enough (coarse actions).
//   - Payload context: pull `{ from, to }` / `{ reason }` / etc from payload.
//   - Before/after diff: render `field: prev → next` for inline-edit events.
//
// Sensitive fields (ЕГН per audit-log.md §4.4) render with masked sentinels.
// The summary string already includes the actor name; the caller (component)
// only adds the relative timestamp.

import { AUDIT_LABELS } from "@/lib/auth/audit-labels";
import type { AuditAction } from "@/lib/auth/audit";

export type RenderedEvent = {
  summary: string;
  // Optional secondary line. Phase 1.B doesn't render it on screen but keeps
  // the data so a future "expand" affordance can show it.
  detail?: string;
};

type AnyJson = Record<string, unknown> | unknown[] | string | number | boolean | null | undefined;

function asObject(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.trim().length === 0 ? "—" : v;
  if (typeof v === "number") return v.toString();
  if (typeof v === "boolean") return v ? "да" : "не";
  return JSON.stringify(v);
}

// Field-label map per module. Adding a module to the feed means adding its
// field labels here so `*.field.updated` events render with proper Bulgarian
// column names instead of raw identifiers. Same labels the inline-edit cells
// use on the table — keep in sync when fields are renamed.
const FIELD_LABELS: Record<string, Record<string, string>> = {
  contact: {
    fullName: "Име",
    phone: "Телефон",
    email: "Имейл",
    egn: "ЕГН / ЕИК",
    address: "Адрес",
    birthDate: "Рождена дата",
    type: "Тип",
    building: "Сграда",
    properties: "Имоти",
    notes: "Бележки",
    owner: "Отговорник",
  },
  lead: {
    status: "Статус",
    source: "Източник",
    owner: "Отговорник",
  },
  meeting: {
    location: "Локация",
    status: "Статус",
    type: "Тип",
    duration: "Продължителност",
    startsAt: "Кога",
  },
  task: {
    title: "Заглавие",
    status: "Статус",
    dueDate: "Краен срок",
    owner: "Отговорник",
  },
  // Invoice header fields touched by inline cells on `/invoices/[id]`.
  invoice: {
    vendorName: "Доставчик",
    vendorVatNumber: "ДДС №",
    invoiceNumber: "№ на фактура",
    invoiceDate: "Дата на фактура",
    dueDate: "Падеж",
    subtotal: "Сума без ДДС",
    vatAmount: "ДДС",
    total: "Общо",
    notes: "Бележки",
    status: "Статус",
  },
  // Contract fields editable via the full-form edit or inline status cell.
  contract: {
    title: "Заглавие",
    buyerFullName: "Купувач",
    status: "Статус",
    contractType: "Тип договор",
    compositionStatus: "Състав",
    totalDueEur: "Обща сума",
    signedAt: "Подписан на",
    reminderDate: "Напомняне",
    usesCredit: "Кредит",
    building: "Сграда",
  },
  // Property fields touched by the inline-edit migration (status, type,
  // description, sellers, prices).
  property: {
    name: "Име",
    status: "Статус",
    type: "Тип",
    description: "Описание",
    sellers: "Продавач",
    priceEur: "Цена (EUR)",
    expectedPriceEur: "Очаквана цена",
    ownerId: "Собственик",
  },
  // Renovation fields touched by the full-form edit + inline status cell.
  renovation: {
    title: "Заглавие",
    type: "Тип",
    status: "Статус",
    description: "Описание",
    managerId: "Отговорник",
    requestedByContactId: "Заявител",
    plannedStartDate: "Планирано начало",
    plannedEndDate: "Планиран край",
    actualStartDate: "Реално начало",
    actualEndDate: "Реално завършване",
  },
  // Renovation task fields — emitted with targetType "renovation_task" by
  // the per-field setters in app/(app)/renovations/actions.ts.
  renovation_task: {
    title: "Заглавие",
    description: "Описание",
    status: "Статус",
    assigneeId: "Изпълнител",
    startDate: "Начало",
    endDate: "Край",
  },
};

// Fields whose plain values must never appear in the feed (or anywhere
// outside the strict-redaction audit row). Per audit-log.md §4.4, ЕГН is the
// canonical case. The renderer masks the diff and shows only that the field
// changed.
const REDACTED_FIELDS: ReadonlySet<string> = new Set(["egn"]);

function fieldLabel(targetType: string, fieldKey: string): string {
  return FIELD_LABELS[targetType]?.[fieldKey] ?? fieldKey;
}

// Generic *.field.updated renderer used by every module's inline-edit cells.
function renderFieldUpdated(
  targetType: string,
  actorName: string,
  payload: Record<string, unknown> | null,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): RenderedEvent {
  const field =
    payload && typeof payload.field === "string"
      ? payload.field
      : // Fallback — if no explicit field, infer from the first key in `after`.
        (after && Object.keys(after)[0]) ?? null;

  if (!field) {
    return { summary: `${actorName} промени запис` };
  }

  const label = fieldLabel(targetType, field);

  if (REDACTED_FIELDS.has(field)) {
    return {
      summary: `${actorName} промени ${label} (стойностите са скрити)`,
    };
  }

  const prev = before ? fmt(before[field]) : "—";
  const next = after ? fmt(after[field]) : "—";

  return {
    summary: `${actorName} промени ${label}: ${prev} → ${next}`,
  };
}

// Owner / status / source — the standard "changed" actions. Most modules
// encode the transition as `payload: { from, to }`, but some use `{ old, new }`
// or `before/after: { fieldName }`. The renderer accepts both.
function renderTransition(
  actorName: string,
  label: string,
  payload: Record<string, unknown> | null,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  fieldHint?: string,
): RenderedEvent {
  const fromKeyP = payload && "from" in payload ? payload.from : null;
  const toKeyP = payload && "to" in payload ? payload.to : null;
  if (fromKeyP !== null || toKeyP !== null) {
    return { summary: `${actorName} промени ${label}: ${fmt(fromKeyP)} → ${fmt(toKeyP)}` };
  }
  if (before && after && fieldHint && fieldHint in before && fieldHint in after) {
    return {
      summary: `${actorName} промени ${label}: ${fmt(before[fieldHint])} → ${fmt(after[fieldHint])}`,
    };
  }
  return { summary: `${actorName} ${AUDIT_LABELS[label as AuditAction]?.label ?? "промени запис"}` };
}

type Renderer = (args: {
  actorName: string;
  payload: Record<string, unknown> | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) => RenderedEvent;

const RENDERERS: Partial<Record<AuditAction, Renderer>> = {
  // ─── Contact ───
  "contact.field.updated": ({ actorName, payload, before, after }) =>
    renderFieldUpdated("contact", actorName, payload, before, after),
  "contact.owner.changed": ({ actorName, payload, before, after }) =>
    renderTransition(actorName, "Отговорник", payload, before, after, "ownerId"),
  "contact.building_migrated": ({ actorName }) => ({
    summary: `${actorName} мигрира сграда на контакта`,
  }),

  // ─── Lead ───
  "leads.create": ({ actorName }) => ({ summary: `${actorName} създаде лийд` }),
  "leads.update": ({ actorName }) => ({ summary: `${actorName} редактира лийда` }),
  "leads.delete": ({ actorName }) => ({ summary: `${actorName} изтри лийда` }),
  "leads.restore": ({ actorName }) => ({ summary: `${actorName} възстанови лийда` }),
  "leads.owner.changed": ({ actorName, payload, before, after }) =>
    renderTransition(actorName, "Отговорник", payload, before, after, "ownerId"),
  "leads.status.changed": ({ actorName, payload, before, after }) =>
    renderTransition(actorName, "Статус", payload, before, after, "status"),
  "leads.source.changed": ({ actorName, payload, before, after }) =>
    renderTransition(actorName, "Източник", payload, before, after, "source"),
  "leads.converted": ({ actorName }) => ({
    summary: `${actorName} преобразува лийда в договор`,
  }),
  "leads.timer.stopped": ({ actorName }) => ({
    summary: `${actorName} спря таймера на лийда`,
  }),
  "leads.email.received": () => ({ summary: "Получен имейл-лийд" }),
  "leads.email.parse_failed": () => ({ summary: "Грешка при парсване на имейл" }),

  // ─── Meeting ───
  "meetings.create": ({ actorName }) => ({ summary: `${actorName} създаде среща` }),
  "meetings.update": ({ actorName }) => ({ summary: `${actorName} редактира срещата` }),
  "meetings.cancel": ({ actorName, payload }) => {
    const reason = payload && typeof payload.reason === "string" ? payload.reason : null;
    return {
      summary: reason
        ? `${actorName} отмени срещата (${reason})`
        : `${actorName} отмени срещата`,
    };
  },
  "meetings.restore": ({ actorName }) => ({ summary: `${actorName} възстанови срещата` }),
  "meetings.happened": ({ actorName }) => ({
    summary: `${actorName} отбеляза срещата като състояла се`,
  }),
  "meetings.field.updated": ({ actorName, payload, before, after }) =>
    renderFieldUpdated("meeting", actorName, payload, before, after),

  // ─── Task ───
  "tasks.create": ({ actorName }) => ({ summary: `${actorName} създаде задачата` }),
  "tasks.update": ({ actorName }) => ({ summary: `${actorName} редактира задачата` }),
  "tasks.status_changed": ({ actorName, payload, before, after }) =>
    renderTransition(actorName, "Статус", payload, before, after, "status"),
  "tasks.owner_changed": ({ actorName, payload, before, after }) =>
    renderTransition(actorName, "Отговорник", payload, before, after, "ownerId"),
  "tasks.field.updated": ({ actorName, payload, before, after }) =>
    renderFieldUpdated("task", actorName, payload, before, after),
  "tasks.deleted": ({ actorName }) => ({ summary: `${actorName} изтри задачата` }),

  // ─── Invoice ───
  "invoices.uploaded": ({ actorName }) => ({ summary: `${actorName} качи фактурата` }),
  "invoices.metadata.edited": ({ actorName, payload, before, after }) =>
    renderFieldUpdated("invoice", actorName, payload, before, after),
  "invoices.status.changed": ({ actorName, payload, before, after }) =>
    renderTransition(actorName, "Статус", payload, before, after, "status"),
  "invoices.deleted": ({ actorName }) => ({ summary: `${actorName} изтри фактурата` }),
  // Invoice file events: `invoices.attachment.viewed` and `.downloaded` are
  // in HIDDEN_ACTIONS so they don't surface here. Upload is captured by
  // `invoices.uploaded` itself (the invoice IS the PDF).

  // ─── Contract ───
  "contract.created": ({ actorName }) => ({ summary: `${actorName} създаде договор` }),
  "contract.updated": ({ actorName, payload, before, after }) => {
    // Contract uses the form-level `contract.updated` action but the
    // before/after carry the set of fields that actually changed. Pick a
    // field to render — preferring `status` if present (it's the high-signal
    // change), else fall back to a generic summary.
    if (before && "status" in before && after && "status" in after) {
      return renderTransition(actorName, "Статус", payload, before, after, "status");
    }
    return { summary: `${actorName} редактира договора` };
  },
  "contract.deleted": ({ actorName }) => ({ summary: `${actorName} изтри договора` }),
  "contracts.attachment.uploaded": ({ actorName }) => ({
    summary: `${actorName} качи файл към договора`,
  }),
  "contracts.attachment.downloaded": ({ actorName }) => ({
    summary: `${actorName} свали файл от договора`,
  }),
  "contracts.attachment.deleted": ({ actorName }) => ({
    summary: `${actorName} изтри файл от договора`,
  }),

  // ─── Property ───
  "property.created": ({ actorName }) => ({ summary: `${actorName} създаде имот` }),
  "property.updated": ({ actorName, payload, before, after }) =>
    renderFieldUpdated("property", actorName, payload, before, after),
  "property.deleted": ({ actorName, payload }) => {
    const reason = payload && typeof payload.reason === "string" ? payload.reason : null;
    return {
      summary: reason
        ? `${actorName} изтри имота (${reason})`
        : `${actorName} изтри имота`,
    };
  },
  "property.status_changed": ({ actorName, payload, before, after }) =>
    renderTransition(actorName, "Статус", payload, before, after, "status"),
  "property.seller_normalized": ({ actorName }) => ({
    summary: `${actorName} нормализира Продавач`,
  }),

  // ─── Renovation ───
  "renovation.created": ({ actorName }) => ({ summary: `${actorName} създаде ремонта` }),
  "renovation.updated": ({ actorName }) => ({ summary: `${actorName} редактира ремонта` }),
  "renovation.deleted": ({ actorName }) => ({ summary: `${actorName} изтри ремонта` }),
  "renovation.field.updated": ({ actorName, payload, before, after }) =>
    renderFieldUpdated("renovation", actorName, payload, before, after),
  "renovation.status_changed": ({ actorName, payload, before, after }) =>
    renderTransition(actorName, "Статус", payload, before, after, "status"),
  "renovation.task.created": ({ actorName, payload }) => {
    const title = payload && typeof payload.title === "string" ? payload.title : null;
    return {
      summary: title ? `${actorName} добави задача „${title}"` : `${actorName} добави задача`,
    };
  },
  "renovation.task.updated": ({ actorName, payload, before, after }) => {
    // Per-field inline edit — `payload.field` carries the field name and
    // `before/after` carry the diff. Falls back to a generic summary when
    // no field is present (legacy form-edit emissions).
    if (payload && typeof payload.field === "string") {
      return renderFieldUpdated("renovation_task", actorName, payload, before, after);
    }
    return { summary: `${actorName} редактира задача` };
  },
  "renovation.task.status_changed": ({ actorName, payload }) => {
    const from = payload && "from" in payload ? payload.from : null;
    const to = payload && "to" in payload ? payload.to : null;
    return {
      summary:
        from !== null && to !== null
          ? `${actorName} промени статус на задача: ${from} → ${to}`
          : `${actorName} промени статус на задача`,
    };
  },
  "renovation.task.deleted": ({ actorName, payload }) => {
    const title = payload && typeof payload.title === "string" ? payload.title : null;
    return {
      summary: title ? `${actorName} изтри задача „${title}"` : `${actorName} изтри задача`,
    };
  },
};

// Public entry point. Returns the rendered event for display.
// `actorName` is the resolved profile fullName, or `"Система"` for
// system-emitted events with no actor.
export function renderEvent(args: {
  action: string;
  actorName: string;
  payload: AnyJson;
  before: AnyJson;
  after: AnyJson;
}): RenderedEvent {
  const renderer = RENDERERS[args.action as AuditAction];
  if (renderer) {
    return renderer({
      actorName: args.actorName,
      payload: asObject(args.payload),
      before: asObject(args.before),
      after: asObject(args.after),
    });
  }
  // Fallback: use AUDIT_LABELS for the verb; prefix with actor.
  const labelEntry = AUDIT_LABELS[args.action as AuditAction];
  if (labelEntry) {
    return { summary: `${args.actorName} — ${labelEntry.label}` };
  }
  // Unmapped action (shouldn't happen at typecheck time, but defence-in-depth).
  return { summary: `${args.actorName} — ${args.action}` };
}
