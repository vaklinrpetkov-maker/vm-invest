"use client";

// Client wrapper that holds the "Само ръчни" filter state + renders each
// feed entry through the right component (NoteItem for notes, EventItem for
// events). Split out of <ActivityFeed> because the filter chip needs client
// state but the data fetching stays server-side.

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { FeedEntry } from "@/lib/activity-feed/types";
import { EventItem } from "./event-item";
import { NoteItem } from "./note-item";

type ViewerRole = "admin" | "manager" | "user";

type Props = {
  entries: FeedEntry[];
  targetType: string;
  targetId: string;
  viewerId: string;
  viewerRole: ViewerRole;
};

export function FeedList({
  entries,
  targetType,
  targetId,
  viewerId,
  viewerRole,
}: Props) {
  const [notesOnly, setNotesOnly] = useState(false);

  const hasEvents = entries.some((e) => e.kind === "event");
  const visible = notesOnly ? entries.filter((e) => e.kind === "note") : entries;

  return (
    <div>
      {hasEvents && (
        <div className="flex items-center justify-end pb-2">
          <button
            type="button"
            onClick={() => setNotesOnly((v) => !v)}
            className={cn(
              "text-sm px-2 py-1 rounded-md transition-colors duration-120",
              notesOnly
                ? "bg-accent-100 text-accent-700 hover:bg-accent-150"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-150",
            )}
            aria-pressed={notesOnly}
          >
            Само ръчни
          </button>
        </div>
      )}

      {visible.length === 0 && (
        <p className="text-sm text-neutral-500 pt-2">
          {notesOnly
            ? "Няма ръчни бележки за този запис."
            : "Няма активност за този запис. Напишете първата бележка."}
        </p>
      )}

      {visible.map((entry) =>
        entry.kind === "note" ? (
          <div key={entry.id}>
            <NoteItem
              note={{
                id: entry.note.id,
                body: entry.note.body,
                authorId: entry.note.authorId,
                authorName: entry.note.authorName,
                createdAt: entry.note.createdAt,
                editedAt: entry.note.editedAt,
              }}
              targetType={targetType}
              targetId={targetId}
              viewerId={viewerId}
              viewerRole={viewerRole}
            />
            {entry.note.replies.length > 0 && (
              <div className="ml-4 mt-1">
                {entry.note.replies.map((r) => (
                  <NoteItem
                    key={r.id}
                    note={r}
                    targetType={targetType}
                    targetId={targetId}
                    viewerId={viewerId}
                    viewerRole={viewerRole}
                    isReply
                    allowReply={false}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <EventItem key={entry.id} event={entry.event} />
        ),
      )}
    </div>
  );
}
