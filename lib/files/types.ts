// Cross-module file attachment shape. Any module that has files attached to
// rows (contracts, invoices, future modules) maps its Prisma row to this
// canonical shape before feeding the table cell. See
// `specs/_foundations/ui-patterns-files.md`.
//
// `storageKey` is the path inside the Supabase Storage bucket (e.g.
// `contracts/abc-123/contract-v2.pdf`) — NEVER the signed URL. Signed URLs are
// short-lived (5 min default) and fetched on demand by the modal via
// `POST /api/files/sign`.
//
// `module` is the discriminant the signing route uses to dispatch to the
// per-module permission check. Values are stable strings, not enum members,
// because each module owns its own naming. Convention:
//   - `contracts`  — production contract attachments
//   - `invoices`   — production invoice attachments

export type FileModule = "contracts" | "invoices";

export type AttachedFile = {
  id: string;
  fileName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  uploadedBy: { id: string; fullName: string } | null;
};

// Shape returned by `POST /api/files/sign`. The client uses this to drive the
// preview iframe / image src and to schedule a silent re-fetch before expiry.
export type SignedFileUrl = {
  url: string;
  // Unix milliseconds when the URL stops working. Used to schedule a refetch.
  expiresAt: number;
  // The original AttachedFile id, echoed back so the client can match the
  // response to the request when there are multiple files in flight.
  attachmentId: string;
  // The MIME type used to pick the renderer (iframe / img / fallback).
  mimeType: string;
  fileName: string;
};
