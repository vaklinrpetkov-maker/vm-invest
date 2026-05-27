"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { markMeetingHappened } from "./actions";

export function MarkHappenedButton({ meetingId }: { meetingId: string }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("");

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Маркирай като състояла се
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-modal-backdrop bg-neutral-900/40 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-neutral-0 rounded-lg p-5 w-full max-w-md shadow-modal">
            <h2 className="text-md font-medium text-neutral-900">Срещата се състоя</h2>
            <p className="text-sm text-neutral-600 mt-1">
              Добавете резултат или кратка обобщаваща бележка (незадължително).
            </p>
            <form action={markMeetingHappened} className="mt-4 space-y-3">
              <input type="hidden" name="meetingId" value={meetingId} />
              <div>
                <label
                  htmlFor="outcome"
                  className="text-sm font-medium text-neutral-700 mb-1.5 block"
                >
                  Резултат
                </label>
                <textarea
                  id="outcome"
                  name="outcome"
                  rows={3}
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  placeholder="напр. клиентът се интересува от ап. 14, следваща стъпка подписване на ПД"
                  className="block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120 resize-y"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Затвори
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Потвърди
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
