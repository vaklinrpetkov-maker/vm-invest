// MIME-type → file-type tone mapping. Pure data; no React. Used by
// `<FileTypeIcon>` to pick the visual treatment for each file.
//
// Tones reuse existing Tailwind tokens (see tailwind.config.ts) so we don't
// introduce new colors. The 100/700 contrast pair matches what AvatarCircle
// and StatusBadge use elsewhere — keeps the visual system consistent.

export type FileTone = "danger" | "info" | "success" | "warning" | "neutral";

export type FileIconKind =
  | "pdf"
  | "image"
  | "office-doc"
  | "office-sheet"
  | "office-slide"
  | "archive"
  | "text"
  | "generic";

export type FileIconDescriptor = {
  kind: FileIconKind;
  tone: FileTone;
  // Two-letter abbreviation rendered inside the icon. Latin (matches
  // common Windows file-extension shorthand: PDF, JPG, DOC). Bulgarian users
  // recognize these — they see them in Excel and Outlook every day.
  glyph: string;
};

const SHEET_TYPES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]);

const SLIDE_TYPES = new Set([
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const DOC_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
]);

const ARCHIVE_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/gzip",
]);

export function getFileIcon(mimeType: string): FileIconDescriptor {
  const m = mimeType.toLowerCase();

  if (m === "application/pdf") {
    return { kind: "pdf", tone: "danger", glyph: "PDF" };
  }
  if (m.startsWith("image/")) {
    // Show concrete subtype for common image formats — JPG, PNG, SVG. Falls
    // back to "IMG" for exotic ones (heic, avif, etc).
    const subtype = m.slice("image/".length);
    if (subtype === "jpeg" || subtype === "jpg") return { kind: "image", tone: "info", glyph: "JPG" };
    if (subtype === "png") return { kind: "image", tone: "info", glyph: "PNG" };
    if (subtype === "svg+xml" || subtype === "svg") return { kind: "image", tone: "info", glyph: "SVG" };
    if (subtype === "webp") return { kind: "image", tone: "info", glyph: "WEB" };
    return { kind: "image", tone: "info", glyph: "IMG" };
  }
  if (DOC_TYPES.has(m)) return { kind: "office-doc", tone: "info", glyph: "DOC" };
  if (SHEET_TYPES.has(m)) return { kind: "office-sheet", tone: "success", glyph: "XLS" };
  if (SLIDE_TYPES.has(m)) return { kind: "office-slide", tone: "warning", glyph: "PPT" };
  if (ARCHIVE_TYPES.has(m)) return { kind: "archive", tone: "neutral", glyph: "ZIP" };
  if (m.startsWith("text/")) return { kind: "text", tone: "neutral", glyph: "TXT" };

  return { kind: "generic", tone: "neutral", glyph: "?" };
}

// Whether the modal can render this file inline (vs falling back to a
// download link). Kept here, not in the modal component, so the cell can
// decide hover affordances ahead of time if needed.
export function canPreviewInline(mimeType: string): boolean {
  const m = mimeType.toLowerCase();
  return m === "application/pdf" || m.startsWith("image/");
}
