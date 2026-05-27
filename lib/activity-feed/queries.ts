// Server-side read query for the activity-feed component. Fetches top-level
// notes (parentId IS NULL) for a given `(targetType, targetId)`, with their
// replies nested under each, soft-deletes filtered out.
//
// Per `specs/_foundations/activity-feed.md` §11: pagination is "last 50, click
// to load more." Phase 1.A returns the first 50 only — the "Покажи още"
// affordance lands in a later round once enough notes exist for it to matter.

import type { Role } from "@prisma/client";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { renderEvent } from "./event-renderers";
import { isHiddenAction } from "./hidden";
import type {
  ActivityTargetType,
  FeedEntry,
  FeedEvent,
  FeedNote,
} from "./types";

const PAGE_SIZE = 50;

export async function loadFeedNotes(
  targetType: ActivityTargetType,
  targetId: string,
): Promise<FeedNote[]> {
  const rows = await prisma.activityNote.findMany({
    where: {
      targetType,
      targetId,
      deletedAt: null,
      parentId: null,
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    include: {
      author: { select: { id: true, fullName: true } },
      replies: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, fullName: true } },
        },
      },
    },
  });

  return rows.map((n) => ({
    id: n.id,
    body: n.body,
    authorId: n.authorId,
    authorName: n.author.fullName,
    createdAt: formatDateTime(n.createdAt),
    editedAt: n.editedAt ? formatDateTime(n.editedAt) : null,
    replies: n.replies.map((r) => ({
      id: r.id,
      body: r.body,
      authorId: r.authorId,
      authorName: r.author.fullName,
      createdAt: formatDateTime(r.createdAt),
      editedAt: r.editedAt ? formatDateTime(r.editedAt) : null,
    })),
  }));
}

// Combined feed query — fetches the top-level notes (with nested replies)
// AND the audit events scoped to the same record, then merges them by
// timestamp into one reverse-chronological stream.
//
// Notes carry their replies nested under each (the merge only operates on
// top-level rows). Events are filtered through `HIDDEN_ACTIONS` so noisy
// rows (file views, import batches, timer ticks) don't surface.
//
// Phase 1.B scope: events come along automatically for any module wired to
// the feed. Module-specific summaries live in `event-renderers.ts`.
export async function loadFeedEntries(
  targetType: ActivityTargetType,
  targetId: string,
): Promise<{ entries: FeedEntry[]; noteCount: number }> {
  const [noteRows, eventRows] = await Promise.all([
    prisma.activityNote.findMany({
      where: {
        targetType,
        targetId,
        deletedAt: null,
        parentId: null,
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      include: {
        author: { select: { id: true, fullName: true } },
        replies: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, fullName: true } } },
        },
      },
    }),
    prisma.auditEvent.findMany({
      where: { targetType, targetId },
      orderBy: { at: "desc" },
      take: PAGE_SIZE,
      include: { actor: { select: { id: true, fullName: true } } },
    }),
  ]);

  const noteEntries: FeedEntry[] = noteRows.map((n) => {
    const note: FeedNote = {
      id: n.id,
      body: n.body,
      authorId: n.authorId,
      authorName: n.author.fullName,
      createdAt: formatDateTime(n.createdAt),
      editedAt: n.editedAt ? formatDateTime(n.editedAt) : null,
      replies: n.replies.map((r) => ({
        id: r.id,
        body: r.body,
        authorId: r.authorId,
        authorName: r.author.fullName,
        createdAt: formatDateTime(r.createdAt),
        editedAt: r.editedAt ? formatDateTime(r.editedAt) : null,
      })),
    };
    return {
      kind: "note",
      id: n.id,
      createdAtIso: n.createdAt.toISOString(),
      note,
    };
  });

  // Total note count includes replies — used for the "N бележки" header
  // counter. Computed before filtering events so a feed with only events
  // still shows the right note count.
  const noteCount = noteRows.reduce((sum, n) => sum + 1 + n.replies.length, 0);

  const eventEntries: FeedEntry[] = eventRows
    .filter((e) => !isHiddenAction(e.action))
    .map((e) => {
      const actorName = e.actor?.fullName ?? "Система";
      const rendered = renderEvent({
        action: e.action,
        actorName,
        payload: e.payload as never,
        before: e.before as never,
        after: e.after as never,
      });
      const event: FeedEvent = {
        // BigInt id from auditEvent — stringify for the React key.
        id: String(e.id),
        action: e.action,
        actorId: e.actorId,
        actorName,
        summary: rendered.summary,
        detail: rendered.detail,
        createdAt: formatDateTime(e.at),
      };
      return {
        kind: "event",
        id: `event-${e.id}`,
        createdAtIso: e.at.toISOString(),
        event,
      };
    });

  const entries = [...noteEntries, ...eventEntries].sort((a, b) =>
    a.createdAtIso < b.createdAtIso ? 1 : -1,
  );

  return { entries, noteCount };
}

// Resolve a target record's revalidation path. Used by the server actions so
// posting / editing / deleting a note refreshes the right detail page.
//
// Profile (org member) and Task get their own routes too — added as the
// rollout reaches them.
// Permission gate for posting notes. Read access mirrors the parent
// record's read gate (assumed by the caller — the detail page only renders
// `<ActivityFeed>` when the viewer can already see the record). Write
// access has per-module rules per `activity-feed.md` §10:
//
//   - Open team-wide: contact, lead, meeting, property, task, renovation.
//   - Admin/manager only: invoice (matches existing inline-edit gate in
//     `app/(app)/invoices/[id]/field-actions.ts`).
//   - Contract: admin/manager always; user posts only on non-signed
//     contracts (per `contracts.md` §9 — user is blocked from modifying a
//     signed contract; notes follow the same gate so the "signed = frozen"
//     narrative isn't undermined by ad-hoc commentary).
//
// Returns `{ ok }` or `{ ok: false, error }` with a Bulgarian message the
// caller can pass straight to the rollback toast.
export async function canWriteNote(
  role: Role,
  targetType: ActivityTargetType,
  targetId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  switch (targetType) {
    case "contact":
    case "lead":
    case "meeting":
    case "property":
    case "task":
    case "renovation":
    case "profile":
      return { ok: true };
    case "invoice":
      if (role === "admin" || role === "manager") return { ok: true };
      return {
        ok: false,
        error: "Само администратор или мениджър може да публикува бележки по фактури.",
      };
    case "contract": {
      if (role === "admin" || role === "manager") return { ok: true };
      const contract = await prisma.contract.findUnique({
        where: { id: targetId },
        select: { status: true },
      });
      if (!contract) return { ok: false, error: "Договорът не съществува." };
      if (contract.status === "signed") {
        return {
          ok: false,
          error: "Договорът е подписан и е заключен — нови бележки не са възможни.",
        };
      }
      return { ok: true };
    }
  }
}

// All active profiles — the candidate set for `@mention` parsing AND the
// pool the client-side autocomplete queries against. Phase 1.B: simple
// query, no caching. Team size is ~25 so loading the full list per write
// is fine. Revisit if it ever shows up in trace.
export async function loadMentionCandidates(): Promise<
  Array<{ id: string; fullName: string; email: string }>
> {
  return prisma.profile.findMany({
    where: { active: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, email: true },
  });
}

// Resolve a friendly Bulgarian label for the target record. Used by the
// mention-notification email subject + body so the recipient sees what
// they were tagged on without having to click through.
//
// Returns `null` if the record doesn't exist or doesn't support the lookup
// yet. Caller falls back to a generic phrase in that case.
export async function resolveTargetLabel(
  targetType: ActivityTargetType,
  targetId: string,
): Promise<string | null> {
  switch (targetType) {
    case "contact": {
      const row = await prisma.contact.findUnique({
        where: { id: targetId },
        select: { fullName: true },
      });
      return row?.fullName ?? null;
    }
    case "lead": {
      const row = await prisma.lead.findUnique({
        where: { id: targetId },
        select: { contact: { select: { fullName: true } } },
      });
      return row ? `Лийд — ${row.contact.fullName}` : null;
    }
    case "meeting": {
      const row = await prisma.meeting.findUnique({
        where: { id: targetId },
        select: {
          startsAt: true,
          lead: { select: { contact: { select: { fullName: true } } } },
        },
      });
      if (!row) return null;
      const when = row.startsAt.toISOString().slice(0, 16).replace("T", " ");
      return `Среща — ${row.lead.contact.fullName} (${when})`;
    }
    case "task": {
      const row = await prisma.task.findUnique({
        where: { id: targetId },
        select: { title: true },
      });
      return row ? `Задача — ${row.title}` : null;
    }
    case "invoice": {
      const row = await prisma.invoice.findUnique({
        where: { id: targetId },
        select: { vendorName: true, invoiceNumber: true },
      });
      if (!row) return null;
      return `Фактура — ${row.vendorName ?? "—"}${row.invoiceNumber ? ` №${row.invoiceNumber}` : ""}`;
    }
    case "contract": {
      const row = await prisma.contract.findUnique({
        where: { id: targetId },
        select: { title: true, buyerFullName: true },
      });
      if (!row) return null;
      return `Договор — ${row.title}${row.buyerFullName ? ` (${row.buyerFullName})` : ""}`;
    }
    case "property": {
      const row = await prisma.property.findUnique({
        where: { id: targetId },
        select: {
          name: true,
          building: { select: { displayName: true } },
        },
      });
      if (!row) return null;
      return `Имот — ${row.building.displayName} · ${row.name}`;
    }
    case "renovation": {
      const row = await prisma.renovation.findUnique({
        where: { id: targetId },
        select: {
          property: {
            select: {
              name: true,
              building: { select: { displayName: true } },
            },
          },
        },
      });
      if (!row) return null;
      // Title is derived in the template-driven model (`decisions.md`
      // 20.05.2026). Same format as the detail-page header.
      return `Ремонт — ${row.property.building.displayName} · ${row.property.name}`;
    }
    case "profile":
      return null;
  }
}

export function targetRevalidatePath(
  targetType: ActivityTargetType,
  targetId: string,
): string {
  switch (targetType) {
    case "contact":
      return `/contacts/${targetId}`;
    case "lead":
      return `/leads/${targetId}`;
    case "meeting":
      return `/meetings/${targetId}`;
    case "contract":
      return `/contracts/${targetId}`;
    case "property":
      return `/properties/${targetId}`;
    case "renovation":
      return `/renovations/${targetId}`;
    case "invoice":
      return `/invoices/${targetId}`;
    case "task":
      return `/tasks/${targetId}`;
    case "profile":
      return `/team`;
  }
}

// Validate that the target record actually exists. Polymorphic associations
// don't get FK enforcement (see schema.prisma comment on `ActivityNote`) so
// the application layer checks here.
//
// Phase 1.A only wires `contact` — other branches return false until each
// module wires up its detail page + adds its branch here. Adding a branch is
// a one-line edit per module; see §13 of the spec.
export async function targetExists(
  targetType: ActivityTargetType,
  targetId: string,
): Promise<boolean> {
  switch (targetType) {
    case "contact": {
      const row = await prisma.contact.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      return row !== null;
    }
    case "lead": {
      const row = await prisma.lead.findUnique({
        where: { id: targetId },
        select: { id: true, deletedAt: true },
      });
      // Soft-deleted leads cannot receive new notes — matches the parent
      // record's edit gate.
      return row !== null && row.deletedAt === null;
    }
    case "meeting": {
      const row = await prisma.meeting.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      return row !== null;
    }
    case "task": {
      // Task uses hard-delete (no soft-delete column) — see `tasks.md` §7,
      // admin-only delete. A missing row already means the task was removed,
      // and notes on a since-deleted task would orphan anyway. No deletedAt
      // check needed.
      const row = await prisma.task.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      return row !== null;
    }
    case "invoice": {
      // Invoice uses hard-delete via admin action (no soft-delete column).
      const row = await prisma.invoice.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      return row !== null;
    }
    case "contract": {
      // Contract also uses hard-delete (see schema.prisma line 572 — no
      // `deletedAt` column). A missing row already means it was removed.
      const row = await prisma.contract.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      return row !== null;
    }
    case "property": {
      const row = await prisma.property.findUnique({
        where: { id: targetId },
        select: { id: true, deletedAt: true },
      });
      return row !== null && row.deletedAt === null;
    }
    case "renovation": {
      const row = await prisma.renovation.findUnique({
        where: { id: targetId },
        select: { id: true, deletedAt: true },
      });
      return row !== null && row.deletedAt === null;
    }
    case "profile":
      // Not wired yet — see SUPPORTED_TARGET_TYPES in types.ts. The action
      // layer rejects unsupported target types before reaching this branch,
      // so this is defence-in-depth rather than a runtime path.
      return false;
  }
}
