import { checkBgId } from "@/lib/bg-id";
import { isValidContactType } from "@/lib/contacts/constants";
import { prisma } from "@/lib/prisma";

// Shared form-data parsing + validation for create + update. Returns either
// the sanitized patch payload or a ContactFormState-shaped error object.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactPatch = {
  fullName: string;
  type: string;
  phone: string | null;
  email: string | null;
  birthDate: Date | null;
  egn: string | null;
  address: string | null;
  notes: string | null;
  ownerId: string | null;
};

type ParseErrors = Partial<
  Record<
    | "fullName"
    | "type"
    | "email"
    | "phone"
    | "egn"
    | "birthDate"
    | "form",
    string
  >
>;

type ParseWarnings = Partial<Record<"egn", string>>;

type ParseResult =
  | { ok: true; data: ContactPatch; warnings: ParseWarnings }
  | { ok: false; errors: ParseErrors; warnings: ParseWarnings };

export async function parseContactFormData(formData: FormData): Promise<ParseResult> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const birthDateRaw = String(formData.get("birthDate") ?? "").trim();
  const egn = String(formData.get("egn") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const ownerIdRaw = String(formData.get("ownerId") ?? "").trim();
  const ownerId = ownerIdRaw === "" ? null : ownerIdRaw;

  const errors: ParseErrors = {};
  const warnings: ParseWarnings = {};

  if (fullName.length < 2) errors.fullName = "Моля, въведете име.";
  if (!type || !isValidContactType(type)) errors.type = "Изберете тип.";
  if (email && !EMAIL_RE.test(email)) errors.email = "Невалиден имейл.";

  let birthDate: Date | null = null;
  if (birthDateRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDateRaw)) {
      errors.birthDate = "Невалидна дата.";
    } else {
      birthDate = new Date(`${birthDateRaw}T00:00:00Z`);
    }
  }

  if (egn) {
    const check = checkBgId(egn);
    if (!check.ok) {
      if (check.reason === "checksum") warnings.egn = "Невалидна контролна цифра на ЕГН.";
      else errors.egn = "ЕГН/ЕИК трябва да е 9 или 10 цифри.";
    }
  }

  if (ownerId) {
    const owner = await prisma.profile.findUnique({
      where: { id: ownerId },
      select: { active: true },
    });
    if (!owner?.active) errors.form = "Избраният отговорник е неактивен.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors, warnings };

  return {
    ok: true,
    data: {
      fullName,
      type,
      phone,
      email,
      birthDate,
      egn,
      address,
      notes,
      ownerId,
    },
    warnings,
  };
}
