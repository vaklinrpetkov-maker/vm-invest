# UI Pattern: File Attachments in Tables

## 1. Purpose

Canonical specification for displaying and opening file attachments directly from list-view tables. Modules that have files attached to rows (`Contract`, `Invoice`, future modules) reference this document for the cell behavior, the preview modal, and the signed-URL flow. Module specs only own their own storage shape and permission rules.

This is the table-side pattern. **Upload UX is explicitly out of scope** — each module designs its own (contracts has a "Генерирай PDF" server-side flow, invoices has channel-specific upload buttons in §5 of `invoices.md`).

## 2. Scope

In scope:
- The table cell that shows attached files inline.
- The "+" upload affordance trailing the icon stack — same cell, same UX everywhere.
- The modal that previews them.
- The signed-URL contract between client and server.
- Permission gating, audit logging, and accessibility.

Out of scope (deliberately):
- Module-specific upload flows that go beyond a generic "pick file(s) → upload to record" — e.g. invoices' channel-specific upload buttons (§5 of `invoices.md`) or contracts' "Генерирай PDF" server-side document generation. Those live in module specs.
- Deletion (admin-only, module-local UX). The cell does not surface delete; admins delete from the module's detail page or via Supabase dashboard.
- Versioning history (module-local).
- Bulk operations across rows (per `ui-patterns-inline-edit.md` §9 — out of Phase 1).
- Inline preview for `.docx` / `.xlsx` / similar Office files. The modal falls back to a download button.

## 3. Cell behavior

A row's file column renders as a **horizontal stack of small file-type icons**, one per attached file. Each icon is clickable.

### 3.1 Display by file count

| Count | Visual |
|---|---|
| 0 | Muted em-dash (`—`). No interactivity. |
| 1–3 | The icons inline, in attachment order. |
| 4+ | First 3 icons + a `+N` overflow pill. The pill opens the modal at index 3, where ←/→ navigation makes the rest reachable. |

### 3.2 Per-icon interaction

- **Hover** — native `title` tooltip with `<filename> · <size>`.
- **Click** — opens the preview modal focused on that file.
- **Click bubble** — the cell calls `e.stopPropagation()` so clicking an icon never triggers a parent row's link or navigation. Cell content lives inside table cells that are otherwise clickable.

### 3.3 Empty state

If the cell has no upload affordance: muted em-dash (`—`), not a click target.

If the cell has upload enabled (most production modules): the "+" button alone, sitting where the icon stack would otherwise be. Clicking it opens the file picker.

### 3.4 The upload "+" button

Trails the icon stack and the `+N` overflow pill (when present). 24px square neutral button, matches the `+N` pill visually so the row reads as a coherent control. Click → opens a native `<input type="file" multiple>` picker. Multiple files selected → uploaded sequentially via the cell's `onUpload` callback; the page revalidates so new icons appear in place.

States:
- **Idle** — `+` glyph, `bg-neutral-100`, hover `bg-neutral-150`.
- **Pending** — small neutral pulse dot replaces the `+`, button disabled, `cursor-wait`.
- **Toast on success** — single file → `Файлът беше качен.`; multiple → `Качени са N файла.`.
- **Toast on failure** — `Неуспешно качване — {filename}: {reason}.` Mixed success+failure surfaces only the first failure with `(N)` count.

The cell remains module-agnostic — `onUpload` is supplied by the table layer, which closure-captures the parent record id and dispatches to a module-specific server action.

### 3.5 Propagation

Two views of the same record (the table cell and the module's detail page) both render `<FileCell>` reading from the same database table. Uploading from either view propagates to the other automatically — there is no separate "table-uploaded" vs "detail-uploaded" store. This is a structural guarantee of the pattern; do not break it by routing one view through a different action.

## 4. File-type icon mapping

Icons are small rounded squares (24px in the cell, 32px in the modal toolbar) with a 2–3 letter glyph in tonal colors. Reuses existing `tailwind.config.ts` tokens — no new colors.

| MIME (or family) | Glyph | Tone | Token pair |
|---|---|---|---|
| `application/pdf` | `PDF` | danger | `bg-danger-100` / `text-danger-700` |
| `image/jpeg` | `JPG` | info | `bg-info-100` / `text-info-700` |
| `image/png` | `PNG` | info | same |
| `image/svg+xml` | `SVG` | info | same |
| `image/webp` | `WEB` | info | same |
| `image/*` (other) | `IMG` | info | same |
| `application/msword` / `…wordprocessingml…` | `DOC` | info | `bg-info-100` / `text-info-700` |
| `application/vnd.ms-excel` / `…spreadsheetml…` / `text/csv` | `XLS` | success | `bg-success-100` / `text-success-700` |
| `application/vnd.ms-powerpoint` / `…presentationml…` | `PPT` | warning | `bg-warning-100` / `text-warning-800` |
| `application/zip` / `application/x-7z…` / `application/gzip` | `ZIP` | neutral | `bg-neutral-150` / `text-neutral-700` |
| `text/*` | `TXT` | neutral | same |
| anything else | `?` | neutral | same |

Mapping lives in `lib/files/icons.ts`. Adding a new MIME = one switch case.

## 5. The `AttachedFile` interface

The shared shape every module's attachment record maps to before it reaches the cell. Lives in `lib/files/types.ts`.

```ts
type AttachedFile = {
  id: string;
  fileName: string;          // shown in tooltips and modal toolbar
  storageKey: string;        // path inside the bucket — e.g. `contracts/abc/v2.pdf`
  mimeType: string;          // drives the icon and renderer choice
  sizeBytes: number;
  uploadedAt: Date;
  uploadedBy: { id: string; fullName: string } | null;
};
```

Modules cast their Prisma rows to this shape at the **page** layer (server components), so the cell stays module-agnostic. `storageKey` is the path inside the bucket — never the signed URL. Signed URLs are generated on demand and never live in row data.

### 5.1 Bucket conventions

Each module owns its own bucket. Conventions per module spec:

- `contracts/{contract_id}/{filename}` — see `contracts.md` §7.3.
- `invoices/{invoice_id}/{filename}` — see `invoices.md` §3.

## 6. The signed-URL contract

### 6.1 The signing endpoint

`POST /api/files/sign` is the **single** endpoint for all file access. Body:

```ts
{
  module: "contracts" | "invoices" | …;  // discriminant for permission dispatch
  attachmentId: string;
  intent?: "view" | "download";          // default "view"
}
```

Response:

```ts
{
  url: string;
  expiresAt: number;     // Unix milliseconds
  attachmentId: string;  // echoed back so the client can match concurrent requests
  mimeType: string;
  fileName: string;
}
```

### 6.2 Why one endpoint instead of per-module routes

- Authentication is enforced once.
- The audit-logging convention is enforced once.
- Adding a new module = one switch case in the route, not a new endpoint.
- The `<FileCell>` component stays truly module-agnostic — it doesn't know which URL to call.

### 6.3 URL lifetime

Default 5 minutes. Long enough that a user can flip through several files without re-fetching, short enough that a leaked URL expires before it matters. The modal silently re-signs the current file 30 seconds before expiry so a user who left the modal open doesn't hit a 403.

### 6.4 Error responses

The route returns standard HTTP codes and a Bulgarian `error` field:

| Status | Meaning | Bulgarian |
|---|---|---|
| 400 | Bad request body | `Невалидно тяло на заявката.` / `Липсват задължителни полета.` |
| 401 | Not signed in | `Не сте влезли в системата.` |
| 403 | Authorized but no access to this file | (route returns 403; cell shows `Нямаш достъп до този файл.`) |
| 404 | Attachment not found | `Файлът не е намерен.` |
| 501 | Module not yet wired up | `Този модул все още няма прикачени файлове.` |

The modal renders the `error` field inside its body and offers a "Повтори" button (canonical retry label per `bg-copy.md` §3).

## 7. The preview modal

### 7.1 Layout

Centered overlay, `z-modal` (1000), backdrop at `bg-neutral-900/40` with `backdrop-blur-sm`. Inner panel `max-w-5xl`, `max-h-[calc(100vh-3rem)]`, `bg-neutral-0`, `rounded-xl`, `shadow-modal`.

```
┌─────────────────────────────────────────────────────┐
│  [icon]  filename.pdf                  Изтегли  ✕  │
│          245 КБ · Мария Петрова · 23.04.2026 14:30 │
├─────────────────────────────────────────────────────┤
│                                                     │
│              [renderer body]                        │
│                                                     │
│    ←                                          →     │  (only when files.length > 1)
│                                                     │
└─────────────────────────────────────────────────────┘
```

When files > 1, a counter `2 / 5` appears in the toolbar before the Изтегли button.

### 7.2 Renderers

| MIME family | Renderer |
|---|---|
| `application/pdf` | Native browser `<iframe src={signedUrl}>`. No PDF.js dependency in Phase 1. |
| `image/*` | `<img>` inside a centered container; `object-contain`, `max-w-full max-h-full`. |
| anything else | Fallback panel with the file-type icon (large), the message `Файлът не може да се прегледа в браузъра.`, and an Изтегли button. |

### 7.3 Keyboard

| Key | Action |
|---|---|
| `Esc` | Close. |
| `←` | Previous file (when 2+). |
| `→` | Next file (wraps). |
| `D` | Trigger download (when not in an input/textarea). |

### 7.4 Click semantics

- Click on the dimmed backdrop → close.
- Click inside the panel → no-op (doesn't close).
- Click `✕` → close.

### 7.5 Mounting

Each `<FileCell>` owns its own modal instance via `createPortal(modal, document.body)`. No app-wide provider — the modal's data locality (its `files` prop) makes the cell the natural owner. If a future feature needs cross-cell modal navigation we revisit.

## 8. Permission gating

### 8.1 Cell visibility

The cell inherits the parent record's read permission. If the user can read the contract, they can see the cell and its icons. If they can't read the contract, the row shouldn't be in the list at all — column hiding is a row-list concern, not a cell concern.

### 8.2 Modal access

The signing route is the gate. Each module's case statement loads the attachment row, walks up to the parent record, and checks read permission against the calling profile's role per `_foundations/roles.md`. Failed checks return 403; the modal closes and surfaces a toast.

### 8.3 Download permission

Phase 1: identical to view permission. If you can preview, you can download. Phase 2 may distinguish (e.g. signed-contract attachments are view-only for users) — that's a module-spec call, not a foundation call.

## 9. Audit logging

Every modal open writes one audit entry. Every download writes one. Action names follow the canonical taxonomy in `lib/auth/audit.ts`:

- `contracts.attachment.viewed` / `contracts.attachment.downloaded`
- `invoices.attachment.viewed` / `invoices.attachment.downloaded`
- (new modules add their own pair when wiring up)

`payload` includes `{ module, fileName }`. `targetType` is `"attachment"`, `targetId` is the attachment's id. IP and user-agent come from request headers.

Demo wiring (`module === "<…>.demo"`) does not write audit entries — it would clutter the log with throwaway data.

## 10. Accessibility

- The modal has `role="dialog"` and `aria-modal="true"`.
- The toolbar's filename has `id="file-preview-title"` and the dialog references it via `aria-labelledby`.
- All buttons have a visible focus ring (`focus:ring-2 focus:ring-accent-500/40`).
- Navigation arrows have `aria-label` (`Предишен файл` / `Следващ файл`).
- The close button has `aria-label="Затвори"`.
- File-type icons are `aria-hidden="true"` — they're decorative; the filename is the accessible label.
- Click targets meet the 32px-tall minimum from `ui-patterns-inline-edit.md` §8.

## 11. Out of scope (Phase 1)

- **PDF.js renderer**: Browser-native iframe is enough for view-only PDFs. Upgrade to PDF.js only if a module needs annotations, page-by-page navigation, or text search inside the PDF.
- **Hover thumbnail tile**: Spec leaves room for icons to expand into a thumbnail on hover (PDF first page, image as-is). Not built in Phase 1.
- **Right-click "Изтегли" / "Копирай линк"**: Could be useful for power users. Not built; the modal toolbar is the canonical download path.
- **Cross-row navigation in the modal**: ←/→ stays inside the current row's files. No "next file in the next row" — that pattern blurs the row boundary.
- **Drag-to-upload in the table**: Out per the inline-edit spec's drag rules.

## 12. Reference implementation

When this document was written, the pattern was instantiated by:

| File | Purpose |
|---|---|
| `lib/files/types.ts` | `AttachedFile`, `SignedFileUrl`, `FileModule` types |
| `lib/files/icons.ts` | MIME → tone mapping + `canPreviewInline()` |
| `lib/files/format.ts` | `formatFileSize()` |
| `lib/supabase/storage.ts` | `getSignedUrl(bucketKey)` |
| `app/api/files/sign/route.ts` | The signing endpoint with per-module dispatch |
| `components/ui/file-type-icon.tsx` | The icon primitive |
| `components/ui/file-cell.tsx` | The table cell |
| `components/ui/file-preview-modal.tsx` | The modal |

First production consumer: contracts. `ContractAttachment` (Prisma) + `app/(app)/contracts/attachment-actions.ts` (`uploadContractAttachment`, `deleteContractAttachment`) + the `case "contracts"` branch in the signing route. Bucket: `contracts/{contractId}/{attachmentId}-{filename}` (private). The detail page renders the same `<FileCell>` via `app/(app)/contracts/[id]/contract-files.tsx`.
