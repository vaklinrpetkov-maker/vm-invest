// Initial-letter avatar — rendered as a small colored circle with two-letter
// initials drawn from the person's full name. Color is deterministic from the
// name (same person → same color across the app).
//
// Used by inline person pickers, tables, and detail-page headers. Avoids
// requiring an avatar-image upload pipeline in Phase 1 while still giving each
// person a recognizable visual handle.
//
// Palette is hand-picked from existing design tokens — no new colors. The
// 100/700 pairing matches the contrast ratio used by status badges.

import { cn } from "@/lib/cn";

const PALETTE = [
  { bg: "bg-accent-100", text: "text-accent-700" },
  { bg: "bg-info-100", text: "text-info-700" },
  { bg: "bg-success-100", text: "text-success-700" },
  { bg: "bg-warning-100", text: "text-warning-800" },
  { bg: "bg-danger-100", text: "text-danger-700" },
  { bg: "bg-neutral-150", text: "text-neutral-700" },
] as const;

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase("bg-BG");
  const first = parts[0][0];
  const last = parts[parts.length - 1][0];
  return (first + last).toLocaleUpperCase("bg-BG");
}

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

function getPalette(fullName: string) {
  return PALETTE[hashName(fullName) % PALETTE.length];
}

const SIZE_CLASSES = {
  sm: "w-5 h-5 text-[10px]",
  md: "w-6 h-6 text-xs",
  lg: "w-8 h-8 text-sm",
} as const;

export type AvatarSize = keyof typeof SIZE_CLASSES;

export function AvatarCircle({
  name,
  size = "md",
  muted = false,
  className,
}: {
  name: string;
  size?: AvatarSize;
  muted?: boolean;
  className?: string;
}) {
  const initials = getInitials(name);
  const palette = getPalette(name);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium tabular-nums select-none shrink-0",
        SIZE_CLASSES[size],
        muted ? "bg-neutral-100 text-neutral-500" : `${palette.bg} ${palette.text}`,
        className,
      )}
      title={name}
    >
      {initials}
    </span>
  );
}
