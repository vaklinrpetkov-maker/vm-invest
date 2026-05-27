// "Mentions about me" inbox — reads + the mark-as-seen mutation.
//
// Per `specs/_foundations/activity-feed.md` §15. Read state lives in
// `ActivityNoteMention.seenAt`: null = unread (counted in the top-nav
// badge); non-null = the user has visited their inbox since the mention
// was posted.
//
// Visiting `/mentions` marks ALL of the current user's pending mentions as
// read in one batch — Phase 1 doesn't track per-row "I've actually opened
// this one." If that distinction matters later, swap to per-click marking
// without a schema change.

import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { resolveTargetLabel, targetRevalidatePath } from "./queries";
import type { ActivityTargetType } from "./types";

export type InboxMention = {
  id: string;
  noteId: string;
  // Pre-rendered for the row template.
  authorName: string;
  authorId: string;
  targetType: ActivityTargetType;
  targetId: string;
  targetLabel: string;
  // Path to the parent record's detail page, plus the `#note-{id}` anchor
  // so the browser scrolls to the note on click-through.
  targetHref: string;
  body: string;
  createdAt: string;
  // True if this row was unread when the page loaded (drives highlight
  // styling). The DB row's `seenAt` is updated server-side BEFORE rendering
  // by `markInboxSeen`, so the field on the row will be non-null at render
  // time — we need to capture "was unread on entry" as a separate flag.
  wasUnread: boolean;
};

// Count of currently-unread mentions for the top-nav badge. Cheap query,
// safe to call on every navigation.
export async function countUnreadMentions(profileId: string): Promise<number> {
  return prisma.activityNoteMention.count({
    where: { mentionedProfileId: profileId, seenAt: null },
  });
}

// Load the recent mentions for the inbox page. Returns the latest N rows
// regardless of read state — recently-read rows stay visible so the user
// can review what they've already seen if they want. `wasUnread` flags
// rows that were null-`seenAt` at the moment of loading.
const INBOX_PAGE_SIZE = 50;

export async function loadInboxMentions(
  profileId: string,
): Promise<InboxMention[]> {
  const rows = await prisma.activityNoteMention.findMany({
    where: { mentionedProfileId: profileId },
    orderBy: { createdAt: "desc" },
    take: INBOX_PAGE_SIZE,
    include: {
      note: {
        select: {
          id: true,
          body: true,
          targetType: true,
          targetId: true,
          deletedAt: true,
          createdAt: true,
          author: { select: { id: true, fullName: true } },
        },
      },
    },
  });

  // Resolve target labels in parallel — each call hits a different table
  // based on `targetType`. Filter out rows whose parent record was
  // hard-deleted (no point showing an orphaned mention with no link).
  const enriched = await Promise.all(
    rows.map(async (r) => {
      if (r.note.deletedAt !== null) return null;
      const targetType = r.note.targetType as ActivityTargetType;
      const label = await resolveTargetLabel(targetType, r.note.targetId);
      if (!label) return null;
      const out: InboxMention = {
        id: r.id,
        noteId: r.noteId,
        authorName: r.note.author.fullName,
        authorId: r.note.author.id,
        targetType,
        targetId: r.note.targetId,
        targetLabel: label,
        targetHref: `${targetRevalidatePath(targetType, r.note.targetId)}#note-${r.noteId}`,
        body: r.note.body,
        createdAt: formatDateTime(r.createdAt),
        wasUnread: r.seenAt === null,
      };
      return out;
    }),
  );

  return enriched.filter((x): x is InboxMention => x !== null);
}

// Mark every pending mention for this user as seen. Returns the number of
// rows updated — used by the page to flash a "X нови споменавания" toast
// without a separate count query.
export async function markInboxSeen(profileId: string): Promise<number> {
  const result = await prisma.activityNoteMention.updateMany({
    where: { mentionedProfileId: profileId, seenAt: null },
    data: { seenAt: new Date() },
  });
  return result.count;
}
