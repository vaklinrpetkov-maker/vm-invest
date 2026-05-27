"use client";

// Inline file-attachment cell for tables. Shows a stack of small file-type
// icons (one per attached file). Clicking any icon opens the preview modal
// focused on that file. Empty cell renders a muted dash.
//
// Display rules (per `specs/_foundations/ui-patterns-files.md` §3):
//   - 0 files  → muted "—" (or "+" alone if upload is enabled)
//   - 1-3 files → row of icons, each clickable
//   - 4+ files → first 3 icons + `+N` pill that opens the modal at file 3
//                so ←/→ navigation reaches the rest.
//
// Upload affordance (when `onUpload` is provided): a "+" button trails the
// icon stack. Click → opens a native file picker (multiple files allowed).
// Each file is uploaded sequentially via the supplied callback; the parent
// page's revalidatePath repopulates `files` with the new attachments.

import {
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  FilePreviewModal,
  type FileDeleteResult,
} from "@/components/ui/file-preview-modal";
import { FileTypeIcon } from "@/components/ui/file-type-icon";
import { useToast } from "@/components/ui/toast";
import { formatFileSize } from "@/lib/files/format";
import type { AttachedFile, FileModule } from "@/lib/files/types";
import { cn } from "@/lib/cn";

const MAX_INLINE_ICONS = 3;

export type FileUploadResult =
  | { ok: true }
  | { ok: false; error: string };

type Props = {
  module: FileModule;
  files: AttachedFile[];
  // If provided, the cell renders a "+" upload button. Each selected file
  // is passed to the callback in turn. The cell shows a pending state
  // during the upload(s) and a toast on any failure.
  onUpload?: (file: File) => Promise<FileUploadResult>;
  // If provided, the modal toolbar renders a delete button (with confirm).
  // The page should only supply this for users authorized to delete (e.g.
  // admin-only for contracts per spec §9). Cells where it's absent are
  // upload+view only.
  onDelete?: (file: AttachedFile) => Promise<FileDeleteResult>;
  // Optional: classname forwarded to the cell wrapper.
  className?: string;
};

export function FileCell({ module, files, onUpload, onDelete, className }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [, startUpload] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { error: toastError, success: toastSuccess } = useToast();

  const visible = files.slice(0, MAX_INLINE_ICONS);
  const hiddenCount = Math.max(0, files.length - MAX_INLINE_ICONS);
  const showUpload = !!onUpload;

  const openAt = (idx: number) => (e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpenIndex(idx);
  };

  const triggerFilePicker = (e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (uploading) return;
    fileInputRef.current?.click();
  };

  const onFilesPicked = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    // Reset the input so picking the same file twice still triggers change.
    e.target.value = "";
    if (picked.length === 0 || !onUpload) return;

    setUploading(true);
    startUpload(async () => {
      let okCount = 0;
      const failures: string[] = [];
      for (const file of picked) {
        try {
          const result = await onUpload(file);
          if (result.ok) {
            okCount += 1;
          } else {
            failures.push(`${file.name}: ${result.error}`);
          }
        } catch (err) {
          console.error("[file-cell] upload threw", err);
          failures.push(`${file.name}: неочаквана грешка.`);
        }
      }
      setUploading(false);
      if (okCount > 0 && failures.length === 0) {
        toastSuccess(
          okCount === 1
            ? "Файлът беше качен."
            : `Качени са ${okCount} файла.`,
        );
      } else if (failures.length > 0) {
        toastError(
          failures.length === 1
            ? `Неуспешно качване — ${failures[0]}`
            : `Неуспешни качвания (${failures.length}): ${failures[0]}`,
        );
      }
    });
  };

  // Empty cell: show "+" alone if upload is enabled, otherwise muted dash.
  if (files.length === 0 && !showUpload) {
    return <span className={cn("text-neutral-400", className)}>—</span>;
  }

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {visible.map((file, i) => (
        <button
          key={file.id}
          type="button"
          onClick={openAt(i)}
          title={`${file.fileName} · ${formatFileSize(file.sizeBytes)}`}
          className="rounded-md transition-all duration-120 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
        >
          <FileTypeIcon mimeType={file.mimeType} size="sm" />
        </button>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={openAt(MAX_INLINE_ICONS)}
          title={`Още ${hiddenCount} ${hiddenCount === 1 ? "файл" : "файла"}`}
          className={cn(
            "h-6 min-w-6 px-1.5 inline-flex items-center justify-center",
            "rounded-md bg-neutral-100 text-neutral-700 text-[10px] font-medium tabular-nums",
            "hover:bg-neutral-150 transition-colors duration-120",
            "focus:outline-none focus:ring-2 focus:ring-accent-500/40",
          )}
        >
          +{hiddenCount}
        </button>
      )}
      {showUpload && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onFilesPicked}
          />
          <button
            type="button"
            onClick={triggerFilePicker}
            disabled={uploading}
            title={uploading ? "Качване…" : "Качи файл"}
            className={cn(
              "h-6 w-6 inline-flex items-center justify-center",
              "rounded-md text-base font-medium leading-none",
              uploading
                ? "bg-neutral-100 text-neutral-400 cursor-wait"
                : "bg-neutral-100 text-neutral-500 hover:bg-neutral-150 hover:text-neutral-900",
              "transition-colors duration-120",
              "focus:outline-none focus:ring-2 focus:ring-accent-500/40",
            )}
          >
            {uploading ? (
              <span
                aria-hidden="true"
                className="block h-2.5 w-2.5 rounded-full bg-neutral-400 animate-pulse"
              />
            ) : (
              "+"
            )}
          </button>
        </>
      )}

      <FilePreviewModal
        module={module}
        files={files}
        startIndex={openIndex}
        onClose={() => setOpenIndex(null)}
        onDelete={onDelete}
      />
    </span>
  );
}
