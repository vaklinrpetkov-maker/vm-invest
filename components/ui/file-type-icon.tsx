// Small rounded square showing a 2-3 letter abbreviation in tonal colors.
// Used by `<FileCell>` for the inline icon stack and by `<FilePreviewModal>`
// in the toolbar header. See `lib/files/icons.ts` for the MIME → tone map
// and `specs/_foundations/ui-patterns-files.md` §4 for the visual spec.

import { getFileIcon, type FileTone } from "@/lib/files/icons";
import { cn } from "@/lib/cn";

const TONE_CLASSES: Record<FileTone, { bg: string; text: string }> = {
  danger: { bg: "bg-danger-100", text: "text-danger-700" },
  info: { bg: "bg-info-100", text: "text-info-700" },
  success: { bg: "bg-success-100", text: "text-success-700" },
  warning: { bg: "bg-warning-100", text: "text-warning-800" },
  neutral: { bg: "bg-neutral-150", text: "text-neutral-700" },
};

const SIZE_CLASSES = {
  sm: "w-6 h-6 text-[10px]",
  md: "w-8 h-8 text-xs",
  lg: "w-10 h-10 text-sm",
} as const;

export type FileIconSize = keyof typeof SIZE_CLASSES;

export function FileTypeIcon({
  mimeType,
  size = "sm",
  className,
}: {
  mimeType: string;
  size?: FileIconSize;
  className?: string;
}) {
  const { tone, glyph } = getFileIcon(mimeType);
  const palette = TONE_CLASSES[tone];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium tabular-nums select-none shrink-0 tracking-tight",
        SIZE_CLASSES[size],
        palette.bg,
        palette.text,
        className,
      )}
    >
      {glyph}
    </span>
  );
}
