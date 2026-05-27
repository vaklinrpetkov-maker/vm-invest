import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { ContractForm, type ContractFormInitial } from "../contract-form";
import { createContract } from "../actions";

export const dynamic = "force-dynamic";

// Create-contract page. The +Нов договор button on /contracts links here.
// The team prepares contract documents externally (Word) and uploads them
// to the resulting record via the file cell on /contracts/[id]. There is
// no template-driven generation inside the app — see specs/contracts.md §11.

const EMPTY_INITIAL: ContractFormInitial = {
  title: "",
  buyerFullName: "",
  contact: null,
  salesperson: null,
  building: "",
  contractType: "BEZ_SMR",
  compositionStatus: "",
  usesCredit: false,
  totalDueEur: "",
  status: "draft",
  signedAtIso: "",
  reminderDateIso: "",
  properties: [],
  paymentPercents: ["", "", "", ""],
};

export default async function NewContractPage() {
  const me = await requireProfile();
  // All three roles can create per specs/contracts.md §9; sales-users
  // included.
  if (me.role !== "admin" && me.role !== "manager" && me.role !== "user") {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={"/contracts" as Route}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          ← Назад към Договори
        </Link>
        <h1 className="text-xl text-neutral-900 mt-1">Нов договор</h1>
        <p className="text-base text-neutral-600">
          Попълни ръчно основните данни и свържи имотите по договора.
          Прикачването на готов файл (PDF или .docx) става от страницата на
          договора, след създаване.
        </p>
      </div>

      <ContractForm
        action={createContract}
        initial={EMPTY_INITIAL}
        submitLabel="Създай договор"
        pendingLabel="Създаване…"
        mode="create"
      />
    </div>
  );
}
