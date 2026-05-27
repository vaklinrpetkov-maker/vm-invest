import Link from "next/link";
import type { Route } from "next";
import { NoteBody } from "@/components/ui/activity-feed/note-body";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import {
  loadInboxMentions,
  markInboxSeen,
} from "@/lib/activity-feed/inbox";
import { requireProfile } from "@/lib/auth/session";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

// "Споменавания" inbox — every `@mention` of the current user across every
// module, newest first.
//
// On page load: every pending mention is marked seen in one batch (see
// `markInboxSeen`). The `wasUnread` flag carried on each row drives the
// highlight styling so the user can still see what was new on this visit.
//
// Recently-read rows stay visible too — capped at 50 — so the user can
// review past mentions if they want. Anything older than 50 is "archived"
// without a UI affordance to fetch more in Phase 1; revisit when the
// backlog actually shows up as a complaint.

export default async function MentionsInboxPage() {
  const me = await requireProfile();

  // Mark all pending mentions seen BEFORE loading the inbox so the page
  // renders with the correct `seenAt` values. The `wasUnread` flag on each
  // row is the snapshot of "was this null before we updated?" — captured
  // inside `loadInboxMentions` via the not-yet-stamped seenAt value.
  // Order matters: we mark seen FIRST, then load, but the load also
  // snapshots `wasUnread` from `seenAt === null` at the moment of the
  // findMany query — which by then is non-null for the rows we just
  // updated. Fix: load FIRST, then mark seen.
  const mentions = await loadInboxMentions(me.id);
  const newlyMarkedCount = await markInboxSeen(me.id);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-xl text-neutral-900">Споменавания</h1>
          <p className="text-base text-neutral-600">
            Бележки, в които колегите ви споменават с @.
          </p>
        </div>
        {newlyMarkedCount > 0 && (
          <span className="text-sm text-neutral-500">
            {newlyMarkedCount} нови, отбелязани като прочетени
          </span>
        )}
      </div>

      <Table>
        <THead>
          <TR hover={false}>
            <TH className="w-44">Кога</TH>
            <TH className="w-48">От</TH>
            <TH className="w-64">Запис</TH>
            <TH>Бележка</TH>
          </TR>
        </THead>
        <TBody>
          {mentions.length === 0 && (
            <TableEmpty colSpan={4}>
              Нямате споменавания. Когато колега ви маркира с @, ще се появят тук.
            </TableEmpty>
          )}
          {mentions.map((m) => (
            <TR
              key={m.id}
              className={cn(
                m.wasUnread && "bg-accent-50/50",
              )}
            >
              <TD muted numeric className="text-sm tabular-nums">
                {m.wasUnread && (
                  <span
                    className="inline-block w-2 h-2 mr-2 rounded-full bg-accent-500 align-middle"
                    aria-label="Непрочетено"
                  />
                )}
                {m.createdAt}
              </TD>
              <TD muted>{m.authorName}</TD>
              <TD muted>
                <Link
                  href={m.targetHref as Route}
                  className="text-neutral-900 hover:text-accent-700 transition-colors duration-120"
                >
                  {m.targetLabel}
                </Link>
              </TD>
              <TD muted>
                <NoteBody body={m.body} className="text-sm" />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
