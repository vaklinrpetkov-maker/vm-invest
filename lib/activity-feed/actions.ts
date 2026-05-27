"use server";

// Shared server actions for the activity feed. Used by every module's detail
// page via `<ActivityFeed>` and its child components.
//
// Phase 1.A scope: post / edit / delete notes for a polymorphic
// `(targetType, targetId)` record. `@mention` parsing + Resend email firing
// lands in a follow-up round; the `ActivityNoteMention` join table already
// exists but isn't written to by this round's actions.
//
// Auth + permissions:
//   - Post:   any signed-in profile that can read the parent record.
//   - Edit:   author only. Admin/manager moderate via delete, not edit.
//   - Delete: author OR admin OR manager. Soft-delete only — the row stays
//             in the DB so the audit trail is complete.
//
// Each action emits an audit row per `_foundations/audit-log.md` §11.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { mentionDeepLink, sendMentionEmail } from "@/lib/email/activity-feed";
import { prisma } from "@/lib/prisma";
import { diffMentions, parseMentions } from "./mentions";
import {
  canWriteNote,
  loadMentionCandidates,
  resolveTargetLabel,
  targetExists,
  targetRevalidatePath,
} from "./queries";
import {
  SUPPORTED_TARGET_TYPES,
  type ActivityTargetType,
  type FeedResult,
} from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 5000;

function isSupportedTarget(t: string): t is ActivityTargetType {
  return SUPPORTED_TARGET_TYPES.has(t as ActivityTargetType);
}

// Persist a set of `ActivityNoteMention` rows for a note, and fire emails to
// each new recipient. Errors during email firing are swallowed per-row so
// one bad recipient doesn't stop the others; `notifiedAt` stays null on
// failure so a future retry job can pick the row up.
//
// `selfProfileId` is the actor's profile id — self-mentions are persisted
// but never emailed (per spec §8.2). `addedIds` is the set of profile ids
// to emit a `mentions` row for; for `postNote` it's every mention, for
// `editNote` it's the diff (newly-added mentions only).
async function persistAndNotifyMentions(args: {
  noteId: string;
  noteBody: string;
  actorName: string;
  selfProfileId: string;
  addedIds: ReadonlyArray<string>;
  candidates: ReadonlyArray<{ id: string; fullName: string; email: string }>;
  targetType: ActivityTargetType;
  targetId: string;
}): Promise<void> {
  if (args.addedIds.length === 0) return;

  // Insert the join rows up-front. `createMany` with skipDuplicates so a
  // concurrent edit-rerun (same mention) doesn't double-insert.
  await prisma.activityNoteMention.createMany({
    data: args.addedIds.map((mentionedProfileId) => ({
      noteId: args.noteId,
      mentionedProfileId,
    })),
    skipDuplicates: true,
  });

  // Fire emails. Skip self-mentions. Resolve the target label for the
  // subject line; null → skip the email (notifiedAt stays null).
  const targetLabel = await resolveTargetLabel(args.targetType, args.targetId);
  const deepLink = mentionDeepLink(
    targetRevalidatePath(args.targetType, args.targetId),
    args.noteId,
  );

  for (const mentionedId of args.addedIds) {
    if (mentionedId === args.selfProfileId) continue;
    const recipient = args.candidates.find((c) => c.id === mentionedId);
    if (!recipient || !targetLabel) continue;
    try {
      await sendMentionEmail({
        recipientEmail: recipient.email,
        recipientName: recipient.fullName,
        actorName: args.actorName,
        targetLabel,
        deepLinkUrl: deepLink,
        noteBody: args.noteBody,
      });
      // Stamp `notifiedAt` so the retry job knows this one's done.
      await prisma.activityNoteMention.update({
        where: {
          noteId_mentionedProfileId: {
            noteId: args.noteId,
            mentionedProfileId: mentionedId,
          },
        },
        data: { notifiedAt: new Date() },
      });
    } catch (err) {
      // Don't block the note write on email failures. The retry job picks
      // up rows where `notifiedAt IS NULL`.
      console.error("[activity-feed] mention email failed", {
        noteId: args.noteId,
        mentionedId,
        err,
      });
    }
  }
}

async function logActivity(
  action: "activity.note.created" | "activity.note.edited" | "activity.note.deleted",
  actorId: string,
  noteId: string,
  payload: Prisma.InputJsonValue,
  before?: Prisma.InputJsonValue,
  after?: Prisma.InputJsonValue,
): Promise<void> {
  const hdrs = await headers();
  await recordAuditEvent({
    actorId,
    action,
    targetType: "activity_note",
    targetId: noteId,
    payload,
    before,
    after,
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });
}

export async function postNote(
  targetType: string,
  targetId: string,
  body: string,
  parentId?: string | null,
): Promise<FeedResult> {
  const me = await requireProfile();

  if (!isSupportedTarget(targetType)) {
    return { ok: false, error: "Този тип запис още не поддържа бележки." };
  }
  if (!UUID_RE.test(targetId)) {
    return { ok: false, error: "Невалиден запис." };
  }
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, error: "Бележката е празна." };
  if (trimmed.length > MAX_BODY) {
    return { ok: false, error: "Бележката е твърде дълга." };
  }

  if (!(await targetExists(targetType, targetId))) {
    return { ok: false, error: "Записът не съществува." };
  }

  // Per-module write gate — Invoice is admin/manager only, signed Contracts
  // reject user-role writers, others are open. See `queries.ts → canWriteNote`.
  const writeGate = await canWriteNote(me.role, targetType, targetId);
  if (!writeGate.ok) return writeGate;

  // Threading is one level deep. If `parentId` was given, look up that note
  // and collapse reply-to-reply by attaching to the top-level grandparent
  // (matches the legacy `postNote` behaviour from contacts/[id]/note-actions).
  let resolvedParentId: string | null = null;
  if (parentId && parentId.trim().length > 0) {
    if (!UUID_RE.test(parentId)) {
      return { ok: false, error: "Невалидна родителска бележка." };
    }
    const parent = await prisma.activityNote.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        parentId: true,
        targetType: true,
        targetId: true,
        deletedAt: true,
      },
    });
    if (
      !parent ||
      parent.deletedAt !== null ||
      parent.targetType !== targetType ||
      parent.targetId !== targetId
    ) {
      return { ok: false, error: "Родителската бележка не съществува." };
    }
    resolvedParentId = parent.parentId ?? parent.id;
  }

  const created = await prisma.activityNote.create({
    data: {
      targetType,
      targetId,
      authorId: me.id,
      body: trimmed,
      parentId: resolvedParentId,
    },
    select: { id: true },
  });

  // Parse @mentions against the active-profile candidate list, persist join
  // rows, fire emails. Errors are swallowed inside `persistAndNotifyMentions`
  // so a Resend hiccup doesn't bubble up to the user.
  const candidates = await loadMentionCandidates();
  const mentionedIds = parseMentions(trimmed, candidates);
  const mentionedArr = Array.from(mentionedIds);
  await persistAndNotifyMentions({
    noteId: created.id,
    noteBody: trimmed,
    actorName: me.fullName,
    selfProfileId: me.id,
    addedIds: mentionedArr,
    candidates,
    targetType,
    targetId,
  });

  await logActivity(
    "activity.note.created",
    me.id,
    created.id,
    {
      targetType,
      targetId,
      hasParent: resolvedParentId !== null,
      mentionCount: mentionedArr.length,
    },
  );

  revalidatePath(targetRevalidatePath(targetType, targetId));
  return { ok: true };
}

export async function editNote(
  noteId: string,
  body: string,
): Promise<FeedResult> {
  const me = await requireProfile();

  if (!UUID_RE.test(noteId)) {
    return { ok: false, error: "Невалидна заявка." };
  }
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, error: "Бележката е празна." };
  if (trimmed.length > MAX_BODY) {
    return { ok: false, error: "Бележката е твърде дълга." };
  }

  const existing = await prisma.activityNote.findUnique({
    where: { id: noteId },
    select: {
      id: true,
      authorId: true,
      body: true,
      targetType: true,
      targetId: true,
      deletedAt: true,
    },
  });
  if (!existing || existing.deletedAt !== null) {
    return { ok: false, error: "Бележката не съществува." };
  }
  // Per spec §7.2: author-only edit. Admin/manager moderate via delete, not
  // by rewriting other people's words.
  if (existing.authorId !== me.id) {
    return { ok: false, error: "Можете да редактирате само свои бележки." };
  }
  if (existing.body === trimmed) {
    // No-op: silent success so the UI doesn't flash an error.
    return { ok: true };
  }
  // Edit-time write gate — if the parent record's state changed since the
  // note was written (e.g. a contract got signed), don't allow further
  // edits. Delete is still allowed via `deleteNote`.
  const writeGate = await canWriteNote(
    me.role,
    existing.targetType as ActivityTargetType,
    existing.targetId,
  );
  if (!writeGate.ok) return writeGate;

  await prisma.activityNote.update({
    where: { id: noteId },
    data: { body: trimmed, editedAt: new Date() },
  });

  // Diff mentions between old body + new body. Newly-added mentions get a
  // fresh `ActivityNoteMention` row + an email; removed mentions get their
  // join rows deleted (but no "untag" email — that would be spam).
  const candidates = await loadMentionCandidates();
  const beforeMentions = parseMentions(existing.body, candidates);
  const afterMentions = parseMentions(trimmed, candidates);
  const { added, removed } = diffMentions(beforeMentions, afterMentions);

  if (removed.length > 0) {
    await prisma.activityNoteMention.deleteMany({
      where: { noteId, mentionedProfileId: { in: removed } },
    });
  }
  await persistAndNotifyMentions({
    noteId,
    noteBody: trimmed,
    actorName: me.fullName,
    selfProfileId: me.id,
    addedIds: added,
    candidates,
    targetType: existing.targetType as ActivityTargetType,
    targetId: existing.targetId,
  });

  await logActivity(
    "activity.note.edited",
    me.id,
    noteId,
    {
      targetType: existing.targetType,
      targetId: existing.targetId,
      mentionsAdded: added.length,
      mentionsRemoved: removed.length,
    },
    { body: existing.body },
    { body: trimmed },
  );

  revalidatePath(
    targetRevalidatePath(existing.targetType as ActivityTargetType, existing.targetId),
  );
  return { ok: true };
}

// Autocomplete helper for the composer. Returns active profiles whose
// `fullName` matches the typed prefix (Bulgarian-aware, case-insensitive,
// substring match). Phase 1.B caps at 8 suggestions — the popover stays
// compact and team size is ~25 so a single substring filter is plenty.
//
// `query` is the substring the user typed after `@`. Empty query returns
// the first 8 active profiles alphabetically (lets the user see who's
// available the moment they type `@`).
export async function searchMentionCandidates(
  query: string,
): Promise<Array<{ id: string; fullName: string }>> {
  await requireProfile();
  const trimmed = query.trim();
  const all = await loadMentionCandidates();
  if (trimmed.length === 0) return all.slice(0, 8).map((p) => ({ id: p.id, fullName: p.fullName }));
  const lower = trimmed.toLowerCase();
  return all
    .filter((p) => p.fullName.toLowerCase().includes(lower))
    .slice(0, 8)
    .map((p) => ({ id: p.id, fullName: p.fullName }));
}

export async function deleteNote(noteId: string): Promise<FeedResult> {
  const me = await requireProfile();

  if (!UUID_RE.test(noteId)) {
    return { ok: false, error: "Невалидна заявка." };
  }

  const existing = await prisma.activityNote.findUnique({
    where: { id: noteId },
    select: {
      id: true,
      authorId: true,
      targetType: true,
      targetId: true,
      deletedAt: true,
    },
  });
  if (!existing || existing.deletedAt !== null) {
    return { ok: false, error: "Бележката не съществува." };
  }

  const isOwner = existing.authorId === me.id;
  const canModerate = me.role === "admin" || me.role === "manager";
  if (!isOwner && !canModerate) {
    return { ok: false, error: "Нямате право да изтривате тази бележка." };
  }

  await prisma.activityNote.update({
    where: { id: noteId },
    data: { deletedAt: new Date() },
  });

  await logActivity(
    "activity.note.deleted",
    me.id,
    noteId,
    {
      targetType: existing.targetType,
      targetId: existing.targetId,
      by: isOwner ? "author" : "moderator",
    },
  );

  revalidatePath(
    targetRevalidatePath(existing.targetType as ActivityTargetType, existing.targetId),
  );
  return { ok: true };
}
