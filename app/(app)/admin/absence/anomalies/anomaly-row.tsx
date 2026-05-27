"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { TR, TD } from "@/components/ui/table";
import { resolveAnomaly } from "./actions";

type Tone = "info" | "warning" | "danger";

type Props = {
  flag: {
    id: string;
    ruleLabel: string;
    severity: "info" | "warn" | "high";
    detectedAt: string;
    employeeName: string;
    categoryLabel: string;
    startDate: string;
    endDate: string;
  };
};

const SEVERITY_TONE: Record<Props["flag"]["severity"], Tone> = {
  info: "info",
  warn: "warning",
  high: "danger",
};

const SEVERITY_LABEL: Record<Props["flag"]["severity"], string> = {
  info: "Информация",
  warn: "Внимание",
  high: "Критично",
};

export function AnomalyRow({ flag }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const onResolve = () => {
    const fd = new FormData();
    fd.set("flagId", flag.id);
    fd.set("note", note);
    setError(null);
    startTransition(async () => {
      const result = await resolveAnomaly(fd);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <>
      <TR>
        <TD numeric muted className="font-mono text-sm">{flag.detectedAt}</TD>
        <TD>{flag.ruleLabel}</TD>
        <TD>
          <StatusBadge tone={SEVERITY_TONE[flag.severity]}>
            {SEVERITY_LABEL[flag.severity]}
          </StatusBadge>
        </TD>
        <TD>{flag.employeeName}</TD>
        <TD muted className="text-sm">
          {flag.categoryLabel} · {flag.startDate} – {flag.endDate}
        </TD>
        <TD align="right">
          <div className="flex items-center justify-end gap-2">
            {error && <span className="text-sm text-danger-700">{error}</span>}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => setOpen((x) => !x)}
            >
              Разреши
            </Button>
          </div>
        </TD>
      </TR>
      {open && (
        <tr className="bg-neutral-50 border-b border-neutral-150">
          <td colSpan={6} className="px-3 py-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Бележка (по избор)"
                rows={2}
                className="flex-1 px-3 py-2 rounded-lg bg-neutral-0 text-base text-neutral-900 placeholder:text-neutral-400 tracking-tight focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120 resize-y"
              />
              <div className="flex gap-2 sm:flex-col">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={onResolve}
                >
                  Потвърди
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Отказ
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
