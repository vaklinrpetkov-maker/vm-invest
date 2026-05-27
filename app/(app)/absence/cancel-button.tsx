"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelOwnPending, requestCancelOfApproved } from "./actions";

type Mode = "pending" | "approved";

export function CancelButton({
  requestId,
  mode,
}: {
  requestId: string;
  mode: Mode;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    const fd = new FormData();
    fd.set("requestId", requestId);
    setError(null);
    startTransition(async () => {
      const action = mode === "pending" ? cancelOwnPending : requestCancelOfApproved;
      const result = await action(fd);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-sm text-danger-700">{error}</span>}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={onClick}
      >
        {mode === "pending" ? "Откажи" : "Поискай отказ"}
      </Button>
    </div>
  );
}
