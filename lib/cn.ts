// Tiny classnames joiner. We don't pull in clsx for this — it's two lines.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
