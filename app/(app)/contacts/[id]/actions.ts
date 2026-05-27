"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ContactFormState } from "@/app/(app)/contacts/contact-form";
import { parseContactFormData } from "@/lib/contacts/parse";
import { requireProfile, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function updateContact(
  contactId: string,
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  await requireProfile();

  const parsed = await parseContactFormData(formData);
  if (!parsed.ok) return { errors: parsed.errors, warnings: parsed.warnings };

  const existing = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true },
  });
  if (!existing) return { errors: { form: "Контактът не съществува." } };

  await prisma.contact.update({
    where: { id: contactId },
    data: parsed.data,
  });

  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/contacts");
  redirect(`/contacts/${contactId}`);
}

// Per specs/_foundations/roles.md §3.1, deletion is admin/manager only. Wired directly to a
// <form action={...}> so it needs Promise<void>. Throws on error — the Next
// error boundary surfaces the message.
export async function deleteContact(formData: FormData): Promise<void> {
  const actor = await requireRole("admin", "manager");
  const contactId = String(formData.get("contactId") ?? "");
  if (!contactId) throw new Error("Невалидна заявка.");

  const existing = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, fullName: true },
  });
  if (!existing) throw new Error("Контактът не съществува.");

  await prisma.contact.delete({ where: { id: contactId } });

  revalidatePath("/contacts");
  console.log(`[contacts] ${actor.email} deleted ${existing.fullName}`);
  redirect("/contacts");
}
