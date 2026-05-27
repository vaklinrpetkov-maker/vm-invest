"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { TR, TD } from "@/components/ui/table";
import { approveRequest, rejectRequest, type DecisionResult } from "./actions";

type Props = {
  request: {
    id: string;
    employeeName: string;
    categoryLabel: string;
    startDate: string;
    endDate: string;
    workingDays: string;
    notes: string | null;
    submittedAt: string;
    lateSubmission: boolean;
    oversizeFlag: boolean;
    isCancelPending: boolean;
  };
};

export function InboxRow({ request }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [comment, setComment] = useState("");

  const runAction = (
    action: (fd: FormData) => Promise<DecisionResult>,
    fd: FormData,
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) setError(result.error);
    });
  };

  const onApprove = () => {
    const fd = new FormData();
    fd.set("requestId", request.id);
    runAction(approveRequest, fd);
  };

  const onReject = () => {
    const fd = new FormData();
    fd.set("requestId", request.id);
    fd.set("comment", comment);
    runAction(rejectRequest, fd);
  };

  const approveLabel = request.isCancelPending ? "Потвърди отказа" : "Одобри";
  const rejectLabel = request.isCancelPending ? "Откажи отказа" : "Отхвърли";

  return (
    <>
      <TR>
        <TD>
          <div>{request.employeeName}</div>
          {request.isCancelPending && (
            <div className="mt-0.5">
              <StatusBadge tone="warning">Иска отказ</StatusBadge>
            </div>
          )}
        </TD>
        <TD muted>{request.categoryLabel}</TD>
        <TD muted numeric>{request.startDate}</TD>
        <TD muted numeric>{request.endDate}</TD>
        <TD numeric>{request.workingDays}</TD>
        <TD>
          <div className="flex flex-wrap gap-1.5">
            {request.lateSubmission && <StatusBadge tone="warning">Късно</StatusBadge>}
            {request.oversizeFlag && <StatusBadge tone="warning">Голям размер</StatusBadge>}
          </div>
        </TD>
        <TD align="right">
          <div className="flex items-center justify-end gap-2">
            {error && <span className="text-sm text-danger-700">{error}</span>}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={onApprove}
            >
              {approveLabel}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setRejectOpen((x) => !x)}
            >
              {rejectLabel}
            </Button>
          </div>
        </TD>
      </TR>
      {request.notes && !request.isCancelPending && (
        <tr className="bg-neutral-50 border-b border-neutral-150">
          <td colSpan={7} className="px-3 py-2 text-sm text-neutral-600">
            <span className="text-neutral-500">Бележки:</span> {request.notes}
          </td>
        </tr>
      )}
      {rejectOpen && (
        <tr className="bg-neutral-50 border-b border-neutral-150">
          <td colSpan={7} className="px-3 py-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  request.isCancelPending
                    ? "Незадължителна причина за отказ на отмяната"
                    : "Незадължителна причина"
                }
                rows={2}
                className="flex-1 px-3 py-2 rounded-lg bg-neutral-0 text-base text-neutral-900 placeholder:text-neutral-400 tracking-tight focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120 resize-y"
              />
              <div className="flex gap-2 sm:flex-col">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={onReject}
                >
                  Потвърди
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRejectOpen(false)}
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
