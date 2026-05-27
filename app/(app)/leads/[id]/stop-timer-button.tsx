"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { stopLeadTimer } from "./timer-actions";

const MIN_COMMENT_LENGTH = 15;

export function StopTimerButton({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tooShort = comment.trim().length < MIN_COMMENT_LENGTH;

  const onSubmit = () => {
    const fd = new FormData();
    fd.set("leadId", leadId);
    fd.set("comment", comment);
    setError(null);
    startTransition(async () => {
      const result = await stopLeadTimer(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setComment("");
    });
  };

  return (
    <>
      <Button type="button" variant="primary" size="sm" onClick={() => setOpen(true)}>
        Спри таймера
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-modal-backdrop bg-neutral-900/40 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-neutral-0 rounded-lg p-5 w-full max-w-md shadow-modal">
            <h2 className="text-md font-medium text-neutral-900">Спиране на таймер</h2>
            <p className="text-sm text-neutral-600 mt-1">
              Опишете какво беше направено. Минимум {MIN_COMMENT_LENGTH} символа.
              Спирането на таймера също присвоява лийда на вас, ако не е бил разпределен.
            </p>
            <div className="mt-4 space-y-3">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                autoFocus
                placeholder="напр. Обадих се на клиента и изпратих ценова листа…"
                className="block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120 resize-y"
              />
              <div className="flex items-center justify-between text-sm">
                <span
                  className={
                    tooShort ? "text-neutral-500" : "text-success-700"
                  }
                >
                  {comment.trim().length} / {MIN_COMMENT_LENGTH}
                </span>
                {error && <span className="text-danger-700">{error}</span>}
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
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={pending || tooShort}
                  onClick={onSubmit}
                >
                  {pending ? "Спиране…" : "Потвърди"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
