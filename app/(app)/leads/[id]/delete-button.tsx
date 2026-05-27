"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteLead } from "./actions";

// Delete-with-reason: opens a simple inline confirmation panel with an optional
// reason textarea, then submits via a form to the server action.

export function DeleteLeadButton({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Изтрий
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-modal-backdrop bg-neutral-900/40 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-neutral-0 rounded-lg p-5 w-full max-w-md shadow-modal">
            <h2 className="text-md font-medium text-neutral-900">Изтриване на лийд</h2>
            <p className="text-sm text-neutral-600 mt-1">
              Лийдът ще бъде маркиран като изтрит. Администратор може да го възстанови.
            </p>
            <form action={deleteLead} className="mt-4 space-y-3">
              <input type="hidden" name="leadId" value={leadId} />
              <div>
                <label htmlFor="reason" className="text-sm font-medium text-neutral-700 mb-1.5 block">
                  Причина (незадължително)
                </label>
                <textarea
                  id="reason"
                  name="reason"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="напр. дубликат, тест, спам…"
                  className="block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120 resize-y"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Отказ
                </Button>
                <Button type="submit" variant="destructive" size="sm">
                  Изтрий лийда
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
