// Shared types for the activity-feed module. See
// `specs/_foundations/activity-feed.md` for the design overview.
//
// Phase 1.A: only `contact` is wired; other target types are accepted by the
// schema and will be wired per the §13 rollout order. Server actions reject
// unsupported target types with a Bulgarian error message so the UI can fall
// back gracefully if a future caller jumps the gun.

export type ActivityTargetType =
  | "contact"
  | "lead"
  | "meeting"
  | "contract"
  | "property"
  | "renovation"
  | "invoice"
  | "task"
  | "profile";

export const SUPPORTED_TARGET_TYPES: ReadonlySet<ActivityTargetType> = new Set([
  "contact",
  // Phase 1.C wirings:
  "lead",
  "meeting",
  "task",
  "invoice",
  // Phase 1.D wirings:
  "contract",
  "property",
  // Phase 2.A wiring (lands with Renovations Phase 2 implementation):
  "renovation",
  // Remaining: profile (no module needs it yet).
]);

export type FeedResult = { ok: true } | { ok: false; error: string };

// Shape returned by `loadFeedNotes`. Renders top-level notes plus their
// nested replies. Timestamps come pre-formatted so the client component
// doesn't repeat formatting logic.
export type FeedNoteView = {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  editedAt: string | null;
};

export type FeedNote = FeedNoteView & {
  replies: FeedNoteView[];
};

// One rendered system-event entry — already formatted for display.
export type FeedEvent = {
  id: string;
  // The action string, kept for client-side classification / future filtering.
  action: string;
  actorId: string | null;
  actorName: string;
  // One-line Bulgarian summary, ready to render.
  summary: string;
  // Optional secondary line for future "expand" affordances.
  detail?: string;
  createdAt: string;
};

// Discriminated union over the two entry kinds. Merged in reverse-chronological
// order by `createdAtIso` (kept separately because `createdAt` is pre-formatted
// for display and not suitable for sort).
export type FeedEntry =
  | { kind: "note"; id: string; createdAtIso: string; note: FeedNote }
  | { kind: "event"; id: string; createdAtIso: string; event: FeedEvent };
