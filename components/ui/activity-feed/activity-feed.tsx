// Server component wrapper for the activity feed. Drop into any detail page
// that needs a per-record narrative surface — the component takes care of
// fetching (notes + events merged), header, composer, empty state, and list
// rendering.
//
// Usage:
//   <ActivityFeed targetType="contact" targetId={contact.id}
//                 viewerId={me.id} viewerRole={me.role} />
//
// Permissions: the component itself resolves write access via `canWriteNote`
// (see `lib/activity-feed/queries.ts`) so detail pages don't have to
// duplicate the per-module rules. When the viewer can't post, the composer
// is replaced by a muted "Записът е заключен" line; reads continue to work.
//
// Phase 1.B: notes AND system events. Events come along automatically for
// any module whose audit emissions have `targetType + targetId` matching
// the parent record. Bulgarian summaries for each `AuditAction` live in
// `lib/activity-feed/event-renderers.ts`.

import { canWriteNote, loadFeedEntries } from "@/lib/activity-feed/queries";
import type { ActivityTargetType } from "@/lib/activity-feed/types";
import { FeedList } from "./feed-list";
import { NoteComposer } from "./note-composer";

type ViewerRole = "admin" | "manager" | "user";

type Props = {
  targetType: ActivityTargetType;
  targetId: string;
  viewerId: string;
  viewerRole: ViewerRole;
  // Optional title override — defaults to "Активност" per spec §3.
  title?: string;
};

export async function ActivityFeed({
  targetType,
  targetId,
  viewerId,
  viewerRole,
  title = "Активност",
}: Props) {
  const [{ entries, noteCount }, writeGate] = await Promise.all([
    loadFeedEntries(targetType, targetId),
    canWriteNote(viewerRole, targetType, targetId),
  ]);

  const canWrite = writeGate.ok;
  const lockedMessage = writeGate.ok ? null : writeGate.error;

  return (
    <section className="bg-neutral-0 rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-md font-medium text-neutral-900">{title}</h2>
        <span className="text-sm text-neutral-500">
          {noteCount} {noteCount === 1 ? "бележка" : "бележки"}
        </span>
      </div>

      {canWrite ? (
        <NoteComposer targetType={targetType} targetId={targetId} />
      ) : (
        <div
          className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600"
          title={lockedMessage ?? undefined}
        >
          🔒 {lockedMessage ?? "Записът е заключен — нови бележки не са възможни."}
        </div>
      )}

      <FeedList
        entries={entries}
        targetType={targetType}
        targetId={targetId}
        viewerId={viewerId}
        viewerRole={viewerRole}
      />
    </section>
  );
}
