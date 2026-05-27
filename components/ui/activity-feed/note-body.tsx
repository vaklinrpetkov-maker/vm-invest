// Render a note body with `@mention` pills styled in accent tone.
//
// Phase 1.B-mentions: purely cosmetic — any `@Name` token in the body is
// rendered as a pill, regardless of whether the name matches an active
// profile at render time. The authoritative parser lives server-side in
// `lib/activity-feed/mentions.ts`; emails fire only for real matches.
// Cosmetic pills for non-matches are harmless and avoid round-tripping the
// candidate list on every note render.
//
// Token shape mirrors the autocomplete: `@` + (letters / space / hyphen)
// up to the next non-mention character. The space tolerance is what lets
// `@Иван Петров` render as one pill instead of two.

import { cn } from "@/lib/cn";

const MENTION_RE = /@([\p{L}][\p{L} \-]*[\p{L}]|[\p{L}])/gu;

type Token =
  | { kind: "text"; value: string }
  | { kind: "mention"; value: string };

function tokenize(body: string): Token[] {
  const out: Token[] = [];
  let cursor = 0;
  // Walk the global regex manually so we can capture the inter-match text.
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(body)) !== null) {
    const matchStart = m.index;
    const matchEnd = matchStart + m[0].length;
    // Validate the `@` boundary — same rule the autocomplete enforces:
    // either at start-of-string or preceded by whitespace. Otherwise
    // `email@example.com` would render weirdly.
    const prev = matchStart === 0 ? "" : body.charAt(matchStart - 1);
    if (matchStart !== 0 && !/\s/.test(prev)) {
      // Not a real mention — skip and continue.
      continue;
    }
    if (cursor < matchStart) {
      out.push({ kind: "text", value: body.slice(cursor, matchStart) });
    }
    out.push({ kind: "mention", value: m[0] });
    cursor = matchEnd;
  }
  if (cursor < body.length) {
    out.push({ kind: "text", value: body.slice(cursor) });
  }
  return out;
}

type Props = {
  body: string;
  className?: string;
};

export function NoteBody({ body, className }: Props) {
  const tokens = tokenize(body);
  return (
    <p
      className={cn(
        "mt-1 text-base text-neutral-800 whitespace-pre-wrap",
        className,
      )}
    >
      {tokens.map((t, i) =>
        t.kind === "text" ? (
          <span key={i}>{t.value}</span>
        ) : (
          <span
            key={i}
            className="inline-block px-1 rounded bg-accent-50 text-accent-700"
          >
            {t.value}
          </span>
        ),
      )}
    </p>
  );
}
