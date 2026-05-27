"use client";

// Note item for the activity feed. Renders one top-level note or one reply,
// with author / timestamp / action buttons.
//
// Replaces `app/(app)/contacts/[id]/note-item.tsx` (now retired). Same UX:
//   - Owner can edit + delete their own notes (per spec §7.2 + §7.3).
//   - Admin / manager can delete anyone's note (per spec §10).
//   - Edit mode toggles inline, save commits via `editNote`.
//   - Delete is one-click with a native confirm; soft-delete in the DB.

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteNote, editNote } from "@/lib/activity-feed/actions";
import { NoteBody } from "./note-body";
import { NoteComposer } from "./note-composer";

type ViewerRole = "admin" | "manager" | "user";

type NoteViewProps = {
  note: {
    id: string;
    body: string;
    authorId: string;
    authorName: string;
    createdAt: string;
    editedAt: string | null;
  };
  targetType: string;
  targetId: string;
  viewerId: string;
  viewerRole: ViewerRole;
  isReply?: boolean;
  allowReply?: boolean;
};

export function NoteItem({
  note,
  targetType,
  targetId,
  viewerId,
  viewerRole,
  isReply,
  allowReply = true,
}: NoteViewProps) {
  const [mode, setMode] = useState<"view" | "edit" | "reply">("view");
  const [editBody, setEditBody] = useState(note.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isOwner = note.authorId === viewerId;
  const canModerate = viewerRole === "admin" || viewerRole === "manager";

  const onEdit = () => {
    setError(null);
    startTransition(async () => {
      const result = await editNote(note.id, editBody);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode("view");
    });
  };

  const onDelete = () => {
    if (!confirm("Изтриване на бележката?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteNote(note.id);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div
      className={
        isReply
          ? "pl-6 py-2 border-l-2 border-neutral-150"
          : "py-3 border-b border-neutral-150 last:border-b-0"
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-base text-neutral-900 font-medium">{note.authorName}</span>
          <span className="text-sm text-neutral-500">{note.createdAt}</span>
          {note.editedAt && (
            <span
              className="text-xs text-neutral-400"
              title={`Редактирано: ${note.editedAt}`}
            >
              (редактирана)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {allowReply && mode === "view" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode("reply")}
            >
              Отговори
            </Button>
          )}
          {isOwner && mode === "view" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditBody(note.body);
                setMode("edit");
              }}
            >
              Редакция
            </Button>
          )}
          {(isOwner || canModerate) && mode === "view" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={onDelete}
            >
              Изтрий
            </Button>
          )}
        </div>
      </div>

      {mode === "view" && <NoteBody body={note.body} />}

      {mode === "edit" && (
        <div className="mt-2 space-y-2">
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            autoFocus
            rows={3}
            className="block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 placeholder:text-neutral-400 tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120 resize-y"
          />
          <div className="flex items-center justify-end gap-2">
            {error && <span className="text-sm text-danger-700">{error}</span>}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode("view")}
            >
              Отказ
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={pending || editBody.trim().length === 0}
              onClick={onEdit}
            >
              {pending ? "Запис…" : "Запази"}
            </Button>
          </div>
        </div>
      )}

      {mode === "reply" && (
        <div className="mt-2">
          <NoteComposer
            targetType={targetType}
            targetId={targetId}
            parentId={note.id}
            placeholder="Вашият отговор…"
            autoFocus
            compact
            onDone={() => setMode("view")}
          />
        </div>
      )}

      {mode === "view" && error && (
        <p className="mt-1 text-sm text-danger-700">{error}</p>
      )}
    </div>
  );
}
