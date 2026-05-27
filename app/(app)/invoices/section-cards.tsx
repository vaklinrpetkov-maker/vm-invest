"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UploadInvoiceModal } from "./upload-modal";

export type SectionCard = {
  id: string;
  labelBg: string;
  slug: string;
  pendingCount: number;
  paidThisMonthCount: number;
};

// Top-of-page cards — one per active InvoiceSection. Each card carries:
//   - "Качи фактура"   → opens the upload modal pre-bound to this section.
//   - "Виж фактурите"  → Filters the table below to this section.
//   - Compact counts   → "X чакащи · Y платени за този месец" per spec §6.1.
//
// One <UploadInvoiceModal> instance per card (lazy-mounted via the `open`
// flag) keeps the section pre-selected without prop-drilling through a
// shared modal at the page level.
export function SectionCards({ cards }: { cards: SectionCard[] }) {
  // Which section's modal is currently open (or null). Only one open at a
  // time — the modal is a focus trap.
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);

  if (cards.length === 0) {
    return (
      <div className="bg-neutral-0 rounded-lg p-6 text-base text-neutral-600">
        Няма активни секции. Администраторът може да добави такива от{" "}
        <Link href="/admin/invoice-sections" className="underline hover:text-neutral-900">
          /admin/invoice-sections
        </Link>
        .
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.id} className="bg-neutral-0 rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-md font-medium text-neutral-900">{c.labelBg}</h2>
            </div>
            <p className="text-sm text-neutral-600 tabular-nums">
              {c.pendingCount} чакащи · {c.paidThisMonthCount} платени за този месец
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Button type="button" onClick={() => setOpenSectionId(c.id)}>
                Качи фактура
              </Button>
              <Link href={`/invoices?section=${c.id}` as Route}>
                <Button type="button" variant="ghost">
                  Виж фактурите
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {cards.map((c) => (
        <UploadInvoiceModal
          key={c.id}
          open={openSectionId === c.id}
          sectionId={c.id}
          sectionLabel={c.labelBg}
          onClose={() => setOpenSectionId(null)}
        />
      ))}
    </>
  );
}
