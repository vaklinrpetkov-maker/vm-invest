"use client";

// Cross-module file preview modal. Opens with a list of files attached to a
// row (one or many), navigates between them with ←/→, fetches signed URLs
// from `/api/files/sign` on demand, refreshes them silently before expiry,
// and falls back to a download prompt for non-previewable types.
//
// See `specs/_foundations/ui-patterns-files.md` §5 for the full behavior
// spec. Mounted via `createPortal` on the body — no provider needed at the
// layout level because each `<FileCell>` owns its own modal instance and
// only one is open at a time per page.
//
// Why no provider: mounting at the cell makes the modal data-locality
// obvious (the files prop drives everything) and avoids a context dance.
// If a second cross-cutting overlay shows up later, we revisit.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileTypeIcon } from "@/components/ui/file-type-icon";
import { useToast } from "@/components/ui/toast";
import { canPreviewInline } from "@/lib/files/icons";
import { formatFileSize } from "@/lib/files/format";
import { formatDateTime } from "@/lib/format";
import type { AttachedFile, FileModule, SignedFileUrl } from "@/lib/files/types";
import { cn } from "@/lib/cn";

export type FileDeleteResult =
  | { ok: true }
  | { ok: false; error: string };

type Props = {
  module: FileModule;
  files: AttachedFile[];
  // Index of the file the user clicked on. The modal opens to this file and
  // ←/→ cycles. If null, the modal is closed.
  startIndex: number | null;
  onClose: () => void;
  // Optional: when provided, a 🗑 button appears in the toolbar with a 2-step
  // confirm flow. The page only supplies this for users authorized to delete
  // (admin-only for contracts per spec §9). On success, the modal closes
  // because the file no longer exists; the parent's revalidatePath flushes.
  onDelete?: (file: AttachedFile) => Promise<FileDeleteResult>;
};

// Time before expiry to silently re-sign. Keeps the iframe from hitting a
// 403 if the user lingers. 30s is generous enough that network latency
// doesn't cause a flicker.
const REFRESH_BUFFER_MS = 30_000;

export function FilePreviewModal({
  module,
  files,
  startIndex,
  onClose,
  onDelete,
}: Props) {
  const open = startIndex !== null;
  const [index, setIndex] = useState(startIndex ?? 0);
  const [signed, setSigned] = useState<SignedFileUrl | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Two-step confirm for delete. Click "Изтрий" → toolbar swaps to a confirm
  // row with [Изтрий завинаги] [Отказ]. Auto-resets after 5s of inactivity
  // so a stray click doesn't leave the modal in a destructive state.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const confirmResetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { error: toastError, success: toastSuccess } = useToast();
  const requestSeq = useRef(0);

  // Reset to the requested start index whenever the modal opens.
  useEffect(() => {
    if (startIndex !== null) {
      setIndex(startIndex);
      setErrorMsg(null);
    }
  }, [startIndex]);

  // Reset confirm-delete state when navigating between files, closing, or
  // when the user pauses (auto-revert after 5s).
  useEffect(() => {
    setConfirmingDelete(false);
  }, [index, open]);

  useEffect(() => {
    if (!confirmingDelete) {
      if (confirmResetTimeout.current) {
        clearTimeout(confirmResetTimeout.current);
        confirmResetTimeout.current = null;
      }
      return;
    }
    confirmResetTimeout.current = setTimeout(() => setConfirmingDelete(false), 5000);
    return () => {
      if (confirmResetTimeout.current) {
        clearTimeout(confirmResetTimeout.current);
        confirmResetTimeout.current = null;
      }
    };
  }, [confirmingDelete]);

  const current = open ? files[index] : null;

  // Fetch signed URL for the current file. Re-fetches when `current.id`
  // changes (i.e. the user navigates with ←/→). Uses a sequence number to
  // ignore stale responses if the user navigates fast.
  const fetchSigned = useCallback(
    async (target: AttachedFile) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch("/api/files/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ module, attachmentId: target.id, intent: "view" }),
        });
        if (seq !== requestSeq.current) return; // stale — user moved on
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          const msg = data?.error ?? "Файлът не може да бъде отворен.";
          setErrorMsg(msg);
          setSigned(null);
          if (res.status === 403) {
            toastError("Нямаш достъп до този файл.");
          }
          return;
        }
        const data = (await res.json()) as SignedFileUrl;
        if (seq !== requestSeq.current) return;
        setSigned(data);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        console.error("[file-preview] sign fetch failed", err);
        setErrorMsg("Грешка при свързване със сървъра.");
        setSigned(null);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [module, toastError],
  );

  // Drive the fetch on open / navigate.
  useEffect(() => {
    if (!current) return;
    fetchSigned(current);
  }, [current, fetchSigned]);

  // Schedule silent re-sign before expiry so long-open modals don't 403.
  useEffect(() => {
    if (refreshTimeout.current) {
      clearTimeout(refreshTimeout.current);
      refreshTimeout.current = null;
    }
    if (!signed || !current) return;
    const ms = signed.expiresAt - Date.now() - REFRESH_BUFFER_MS;
    if (ms <= 0) return;
    refreshTimeout.current = setTimeout(() => {
      fetchSigned(current);
    }, ms);
    return () => {
      if (refreshTimeout.current) {
        clearTimeout(refreshTimeout.current);
        refreshTimeout.current = null;
      }
    };
  }, [signed, current, fetchSigned]);

  const goNext = useCallback(() => {
    if (files.length <= 1) return;
    setIndex((i) => (i + 1) % files.length);
  }, [files.length]);

  const goPrev = useCallback(() => {
    if (files.length <= 1) return;
    setIndex((i) => (i - 1 + files.length) % files.length);
  }, [files.length]);

  // Keyboard: Esc closes, ←/→ navigates, D triggers download.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "d" || e.key === "D") {
        // Download shortcut, only when the modal has focus and not in an input.
        const tag = (document.activeElement?.tagName ?? "").toLowerCase();
        if (tag === "input" || tag === "textarea") return;
        e.preventDefault();
        if (current) onDownload(current);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, goNext, goPrev, current]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDownload = useCallback(
    async (target: AttachedFile) => {
      try {
        const res = await fetch("/api/files/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            module,
            attachmentId: target.id,
            intent: "download",
          }),
        });
        if (!res.ok) {
          toastError("Файлът не може да бъде свален.");
          return;
        }
        const data = (await res.json()) as SignedFileUrl;
        // Force download by navigating in a hidden anchor with `download` attr.
        const a = document.createElement("a");
        a.href = data.url;
        a.download = data.fileName;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        console.error("[file-preview] download failed", err);
        toastError("Грешка при свързване със сървъра.");
      }
    },
    [module, toastError],
  );

  const onConfirmDelete = useCallback(
    async (target: AttachedFile) => {
      if (!onDelete || deleting) return;
      setDeleting(true);
      try {
        const result = await onDelete(target);
        if (result.ok) {
          toastSuccess("Файлът беше изтрит.");
          // Close — the parent's revalidatePath repopulates the cell
          // without this file. If the modal stayed open it would point
          // at a stale index.
          onClose();
        } else {
          toastError(`Изтриването не успя. ${result.error}`);
          setConfirmingDelete(false);
        }
      } catch (err) {
        console.error("[file-preview] delete threw", err);
        toastError("Възникна неочаквана грешка.");
        setConfirmingDelete(false);
      } finally {
        setDeleting(false);
      }
    },
    [onDelete, onClose, deleting, toastError, toastSuccess],
  );

  // Server-render guard: don't try to portal until the document exists.
  const portalTarget = useMemo(() => {
    if (typeof document === "undefined") return null;
    return document.body;
  }, []);

  if (!open || !current || !portalTarget) return null;

  const counter = files.length > 1 ? `${index + 1} / ${files.length}` : null;
  const inlinePreviewable = canPreviewInline(current.mimeType);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="file-preview-title"
      className="fixed inset-0 z-modal flex items-center justify-center p-6 bg-neutral-900/40 backdrop-blur-sm"
      onClick={(e) => {
        // Click outside the inner frame closes. Clicks inside don't bubble here.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          // Width: fill the viewport minus the 6-unit outer padding, capped
          // at 1400px so it doesn't go edge-to-edge on huge monitors. PDFs
          // typically render fit-to-width inside the iframe — a wider modal
          // means a wider rendered page, which is the user-visible win.
          "relative w-full max-w-[1400px] bg-neutral-0 rounded-xl shadow-modal flex flex-col",
          // Height: explicit (not max-h) so flex-1 children get real space.
          // The iframe has no intrinsic height — without this it collapses
          // to ~150px and the user sees a sliver of the document.
          "h-[calc(100vh-3rem)]",
        )}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-150">
          <FileTypeIcon mimeType={current.mimeType} size="md" />
          <div className="flex-1 min-w-0">
            <div id="file-preview-title" className="text-base text-neutral-900 truncate">
              {current.fileName}
            </div>
            <div className="text-sm text-neutral-500 truncate">
              {formatFileSize(current.sizeBytes)}
              {current.uploadedBy && (
                <>
                  {" · "}
                  {current.uploadedBy.fullName}
                </>
              )}
              {" · "}
              {formatDateTime(current.uploadedAt)}
            </div>
          </div>
          {counter && !confirmingDelete && (
            <div className="text-sm text-neutral-500 font-mono shrink-0">{counter}</div>
          )}
          {confirmingDelete ? (
            <>
              <div className="text-sm text-danger-700 shrink-0">
                Сигурен ли си? Файлът ще бъде изтрит завинаги.
              </div>
              <button
                type="button"
                onClick={() => onConfirmDelete(current)}
                disabled={deleting}
                className="h-8 px-3 inline-flex items-center rounded-lg bg-danger-500 text-neutral-0 text-base hover:bg-danger-600 transition-colors duration-120 shrink-0 disabled:opacity-60 disabled:cursor-wait"
              >
                {deleting ? "Изтриване…" : "Изтрий завинаги"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="h-8 px-3 inline-flex items-center rounded-lg bg-neutral-100 text-base text-neutral-900 hover:bg-neutral-150 transition-colors duration-120 shrink-0"
              >
                Отказ
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onDownload(current)}
                className="h-8 px-3 inline-flex items-center rounded-lg bg-neutral-100 text-base text-neutral-900 hover:bg-neutral-150 transition-colors duration-120 shrink-0"
              >
                Изтегли
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  title="Изтрий файла"
                  aria-label="Изтрий файла"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-neutral-500 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-120 shrink-0"
                >
                  🗑
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Затвори"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors duration-120 shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 relative bg-neutral-50">
          {loading && !signed && (
            <div className="absolute inset-0 flex items-center justify-center text-base text-neutral-500">
              Зареждане…
            </div>
          )}
          {errorMsg && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="text-base text-neutral-700">{errorMsg}</div>
              <button
                type="button"
                onClick={() => fetchSigned(current)}
                className="h-8 px-3 inline-flex items-center rounded-lg bg-neutral-100 text-base text-neutral-900 hover:bg-neutral-150 transition-colors duration-120"
              >
                Повтори
              </button>
            </div>
          )}
          {signed && !errorMsg && inlinePreviewable && current.mimeType === "application/pdf" && (
            <iframe
              key={signed.url}
              src={signed.url}
              title={current.fileName}
              className="w-full h-full border-0"
            />
          )}
          {signed && !errorMsg && inlinePreviewable && current.mimeType.startsWith("image/") && (
            <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signed.url}
                alt={current.fileName}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          )}
          {signed && !errorMsg && !inlinePreviewable && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <FileTypeIcon mimeType={current.mimeType} size="lg" />
              <div className="text-base text-neutral-700 max-w-md">
                Файлът не може да се прегледа в браузъра.
              </div>
              <button
                type="button"
                onClick={() => onDownload(current)}
                className="h-8 px-3 inline-flex items-center rounded-lg bg-accent-500 text-neutral-0 text-base hover:bg-accent-600 transition-colors duration-120"
              >
                Изтегли
              </button>
            </div>
          )}
        </div>

        {/* Navigation arrows — only when there are multiple files */}
        {files.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Предишен файл"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-neutral-0 shadow-popover text-neutral-700 hover:text-neutral-900 hover:bg-neutral-50 transition-colors duration-120 inline-flex items-center justify-center"
            >
              ←
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Следващ файл"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-neutral-0 shadow-popover text-neutral-700 hover:text-neutral-900 hover:bg-neutral-50 transition-colors duration-120 inline-flex items-center justify-center"
            >
              →
            </button>
          </>
        )}
      </div>
    </div>,
    portalTarget,
  );
}
