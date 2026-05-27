"use client";

// Minimal toast system. Built specifically to support the inline-edit rollback
// flow described in `specs/_foundations/ui-patterns-inline-edit.md` §7.2:
// when an optimistic save fails, the cell rolls back and a toast appears with
// an optional `Повтори` retry button. Kept dependency-free on purpose — the
// codebase already avoids ad-hoc libs (see CLAUDE.md "Don't install new
// dependencies without asking").
//
// Usage:
//   const { error } = useToast();
//   error("Промяната не беше запазена.", { retryLabel: "Повтори", onRetry });
//
// Mount <Toaster /> once at the (app) layout root.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

type Tone = "error" | "info" | "success";

type ToastInput = {
  message: string;
  tone?: Tone;
  durationMs?: number; // null/0 → sticky until dismissed
  retryLabel?: string;
  onRetry?: () => void;
};

type ToastInstance = ToastInput & {
  id: number;
  tone: Tone;
};

type ToastContextValue = {
  push: (t: ToastInput) => void;
  dismiss: (id: number) => void;
  error: (message: string, opts?: Omit<ToastInput, "message" | "tone">) => void;
  success: (message: string, opts?: Omit<ToastInput, "message" | "tone">) => void;
  info: (message: string, opts?: Omit<ToastInput, "message" | "tone">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastInstance[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = nextId++;
      const tone: Tone = t.tone ?? "info";
      const duration = t.durationMs ?? 5000;
      setToasts((list) => [...list, { ...t, id, tone }]);
      if (duration > 0) {
        const handle = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, handle);
      }
    },
    [dismiss],
  );

  const error = useCallback(
    (message: string, opts?: Omit<ToastInput, "message" | "tone">) =>
      push({ ...opts, message, tone: "error" }),
    [push],
  );
  const success = useCallback(
    (message: string, opts?: Omit<ToastInput, "message" | "tone">) =>
      push({ ...opts, message, tone: "success" }),
    [push],
  );
  const info = useCallback(
    (message: string, opts?: Omit<ToastInput, "message" | "tone">) =>
      push({ ...opts, message, tone: "info" }),
    [push],
  );

  // Cleanup timers on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const handle of map.values()) clearTimeout(handle);
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ push, dismiss, error, success, info }}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() must be used inside <ToastProvider>");
  }
  return ctx;
}

function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: ToastInstance[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      role="region"
      aria-label="Известия"
      className="fixed top-4 right-4 z-toast flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastInstance;
  onDismiss: (id: number) => void;
}) {
  const toneClasses: Record<Tone, string> = {
    error: "bg-danger-50 text-danger-700 ring-1 ring-danger-100",
    success: "bg-success-50 text-success-700 ring-1 ring-success-100",
    info: "bg-neutral-0 text-neutral-900 ring-1 ring-neutral-150",
  };

  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto min-w-[280px] max-w-[420px] rounded-lg shadow-popover px-4 py-3",
        "flex items-start gap-3",
        toneClasses[toast.tone],
      )}
    >
      <div className="flex-1 text-base leading-snug">{toast.message}</div>
      {toast.retryLabel && toast.onRetry && (
        <button
          type="button"
          onClick={() => {
            toast.onRetry?.();
            onDismiss(toast.id);
          }}
          className={cn(
            "shrink-0 text-base font-medium underline-offset-2 hover:underline transition-colors duration-120",
            toast.tone === "error" ? "text-danger-700" : "text-neutral-900",
          )}
        >
          {toast.retryLabel}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Затвори"
        className="shrink-0 text-neutral-500 hover:text-neutral-900 transition-colors duration-120"
      >
        ✕
      </button>
    </div>
  );
}
