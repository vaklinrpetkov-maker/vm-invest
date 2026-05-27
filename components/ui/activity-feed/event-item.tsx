// One-line muted entry for a system event in the activity feed. Sits between
// note cards (rendered by <NoteItem>) and presents the "what changed" beats
// in a small, deliberately-quiet style so the eye reads the conversation
// first and the metadata second.
//
// Phase 1.B has no interactions — events are not clickable, can't be
// dismissed, can't expand. Detail is captured (per `event-renderers.ts`) for
// a future "show more" affordance.

import type { FeedEvent } from "@/lib/activity-feed/types";

type Props = {
  event: FeedEvent;
};

export function EventItem({ event }: Props) {
  return (
    <div className="py-2 text-sm text-neutral-500 border-b border-neutral-150 last:border-b-0">
      <span className="text-neutral-700">{event.summary}</span>
      <span className="text-neutral-400 mx-1.5">·</span>
      <span className="text-neutral-400 tabular-nums">{event.createdAt}</span>
    </div>
  );
}
