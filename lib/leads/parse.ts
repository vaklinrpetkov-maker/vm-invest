import type { LeadSource, LeadStatus } from "@prisma/client";
import { LEAD_SOURCE_USER_SELECTABLE, LEAD_STATUS_USER_SELECTABLE } from "@/lib/leads/constants";
import { prisma } from "@/lib/prisma";

// Shared form-data parsing for lead create + update. Phase 1 scope: fields a
// user actually types. Email/timer/match fields are system-populated only.

export type LeadPatch = {
  contactId: string;
  source: LeadSource;
  status: LeadStatus;
  ownerId: string | null;
  properties: string[];
  message: string | null;
};

type ParseErrors = Partial<
  Record<"contactId" | "source" | "status" | "ownerId" | "form", string>
>;

type ParseResult =
  | { ok: true; data: LeadPatch }
  | { ok: false; errors: ParseErrors };

const VALID_SOURCES = new Set<string>(LEAD_SOURCE_USER_SELECTABLE);
const VALID_STATUSES = new Set<string>(LEAD_STATUS_USER_SELECTABLE);

export async function parseLeadFormData(formData: FormData): Promise<ParseResult> {
  const contactId = String(formData.get("contactId") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "new").trim() || "new";
  const ownerIdRaw = String(formData.get("ownerId") ?? "").trim();
  const ownerId = ownerIdRaw === "" ? null : ownerIdRaw;
  const propertiesRaw = formData.getAll("properties").map(String);
  const message = String(formData.get("message") ?? "").trim() || null;

  const errors: ParseErrors = {};

  if (!contactId) errors.contactId = "Изберете контакт.";
  if (!VALID_SOURCES.has(source)) errors.source = "Невалиден източник.";
  if (!VALID_STATUSES.has(statusRaw)) errors.status = "Невалиден статус.";

  if (contactId) {
    const exists = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true },
    });
    if (!exists) errors.contactId = "Контактът не съществува.";
  }

  if (ownerId) {
    const owner = await prisma.profile.findUnique({
      where: { id: ownerId },
      select: { active: true },
    });
    if (!owner?.active) errors.form = "Избраният отговорник е неактивен.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const properties = propertiesRaw
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .slice(0, 20); // soft cap, see Leads.md §15

  return {
    ok: true,
    data: {
      contactId,
      source: source as LeadSource,
      status: statusRaw as LeadStatus,
      ownerId,
      properties,
      message,
    },
  };
}
