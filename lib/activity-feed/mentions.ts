// Server-side `@mention` parser. Pure functions — no Prisma calls — so the
// same parser runs in `postNote`, `editNote`, and (later) inbound email
// processing.
//
// Wire format per `specs/_foundations/activity-feed.md` §8:
//   - The autocomplete inserts the literal `@Иван Петров` text into the
//     body at commit time. Whitespace after the name is the terminator.
//   - On save, the parser regexes `@`-followed-by-characters spans and
//     matches each against the candidate list (active profiles) by exact
//     fullName equality (case-sensitive; the autocomplete already gave the
//     user the canonical form).
//   - Ambiguous matches (two profiles with the same fullName) resolve to
//     the first one in the candidate list — callers are responsible for
//     ordering by recency if that matters.
//
// Phase 1.B uses exact fullName matching only — no nicknames, no email
// prefixes. Adding fuzzy resolution would create false-positive mentions
// (e.g. typing `@Иван` and silently routing to the wrong Иван). Better to
// require the autocomplete commit than guess wrong.

export type MentionCandidate = {
  id: string;
  fullName: string;
};

// Regex matches `@` followed by Bulgarian-or-Latin letters, spaces, and
// hyphens up to the next punctuation or newline. The space tolerance is
// deliberate — Bulgarian full names like "Иван Петров" have a space
// between forename + surname. The regex consumes greedily; we then try
// longest-prefix matches against the candidate list so "Иван Петров" wins
// over "Иван" if both exist.
//
// Note: `\p{L}` covers all letter classes (Bulgarian Cyrillic included),
// requires the `u` flag.
const MENTION_RE = /@([\p{L}][\p{L} -]*[\p{L}]|[\p{L}])/gu;

export function parseMentions(
  body: string,
  candidates: ReadonlyArray<MentionCandidate>,
): Set<string> {
  const matched = new Set<string>();
  if (candidates.length === 0) return matched;

  // Sort by fullName length desc — longest-match-first prevents `Иван`
  // shadowing `Иван Петров` when both exist.
  const sorted = [...candidates].sort((a, b) => b.fullName.length - a.fullName.length);

  // Reset lastIndex each call (global regexes carry state).
  MENTION_RE.lastIndex = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const span = m[1].trim();
    if (span.length === 0) continue;

    // Find the longest candidate whose fullName is a prefix of the span,
    // followed by a word boundary (end of span OR a non-letter).
    for (const c of sorted) {
      if (span === c.fullName) {
        matched.add(c.id);
        break;
      }
      // Prefix match: `Иван Петров е тук` after stripping `@` is
      // `Иван Петров е тук` — we want `Иван Петров` to match. So we check
      // if `span` starts with `fullName` AND the next char is non-letter.
      if (span.startsWith(c.fullName)) {
        const nextChar = span.charAt(c.fullName.length);
        if (nextChar === "" || /\s/.test(nextChar)) {
          matched.add(c.id);
          break;
        }
      }
    }
  }

  return matched;
}

// Compute the diff between an existing mention set (from the DB) and a new
// one parsed from an edited body. Used by `editNote` to fire emails only
// for newly-added mentions and to remove no-longer-mentioned rows.
export function diffMentions(
  existing: ReadonlySet<string>,
  next: ReadonlySet<string>,
): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  for (const id of next) {
    if (!existing.has(id)) added.push(id);
  }
  for (const id of existing) {
    if (!next.has(id)) removed.push(id);
  }
  return { added, removed };
}
