"use server";

import { redirect } from "next/navigation";
import { parseContactFormData } from "@/lib/contacts/parse";
import type { ContactFormState } from "@/app/(app)/contacts/contact-form";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function createContact(
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const actor = await requireProfile();
  const parsed = await parseContactFormData(formData);
  if (!parsed.ok) return { errors: parsed.errors, warnings: parsed.warnings };

  const contact = await prisma.contact.create({
    data: { ...parsed.data, createdById: actor.id },
  });

  redirect(`/contacts/${contact.id}`);
}
