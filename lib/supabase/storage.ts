// First Supabase Storage usage in the codebase. Thin wrapper around the
// service-role client's `.storage` API so callers don't need to know which
// bucket convention each module uses.
//
// Bucket conventions (per `specs/_foundations/ui-patterns-files.md` §5 and
// each module's spec):
//   - contracts/{contract_id}/{filename}
//   - invoices/{invoice_id}/{filename}
//
// We deliberately use the **service-role** client here, not the cookie-bound
// server client. Reason: per-user RLS on storage objects is awkward to wire
// up correctly (every module's permission rules are different), and our
// authorization is enforced at the API-route layer (`/api/files/sign`)
// before we ever ask Storage to sign. By the time we reach storage, the
// access check has already passed.
//
// See `app/api/files/sign/route.ts` for the access-check dispatch.

import { getSupabaseServiceClient } from "@/lib/supabase/server";

const DEFAULT_TTL_SECONDS = 5 * 60; // 5 minutes

export type SignedUrlResult = {
  url: string;
  expiresAt: number; // Unix milliseconds
};

// Idempotently make sure a bucket exists. Returns true on success / already
// exists, false on hard failure. Buckets are created **private by default**
// — file access flows through `getSignedUrl` only. Never make a module
// bucket public; that bypasses the per-route permission gate.
export async function ensureBucketExists(bucketName: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient();
  // getBucket returns 404 (not 200/400) when missing — so we trust the error
  // discriminant rather than checking by listBuckets() which is more I/O.
  const { data, error } = await supabase.storage.getBucket(bucketName);
  if (data && !error) return true;

  const created = await supabase.storage.createBucket(bucketName, {
    public: false,
    // 25 MB cap matches the per-upload validation in the action layer.
    fileSizeLimit: 25 * 1024 * 1024,
  });
  if (created.error) {
    // "Bucket already exists" → race with another request; treat as success.
    if (created.error.message?.toLowerCase().includes("already exists")) return true;
    console.error("[storage] createBucket failed", { bucketName, error: created.error });
    return false;
  }
  return true;
}

export type UploadOutcome =
  | { ok: true }
  | { ok: false; error: string };

// Upload a file to Supabase Storage. `bucketKey` is the full path including
// bucket, e.g. `contracts/abc-123/foo.pdf`. Body can be a Blob, Buffer, or
// any of the types the JS SDK accepts. Returns the Supabase error message on
// failure so the caller can surface it instead of a generic toast.
export async function uploadFile(
  bucketKey: string,
  body: Blob | Buffer | ArrayBuffer | Uint8Array,
  options?: { contentType?: string; upsert?: boolean },
): Promise<UploadOutcome> {
  const [bucket, ...rest] = bucketKey.split("/");
  if (!bucket || rest.length === 0) {
    console.error("[storage] invalid bucketKey for upload", { bucketKey });
    return { ok: false, error: "Невалиден път към файла." };
  }
  const objectPath = rest.join("/");
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.storage.from(bucket).upload(objectPath, body, {
    contentType: options?.contentType,
    upsert: options?.upsert ?? false,
  });
  if (error) {
    console.error("[storage] upload failed", { bucketKey, error });
    return { ok: false, error: error.message ?? "Непозната грешка от Supabase." };
  }
  return { ok: true };
}

// Remove an object from Storage. Used by the delete action; failure is
// logged but the caller decides whether to abort (we don't want a stray
// orphan in Storage if the DB row was already deleted, and vice versa).
export async function deleteFile(bucketKey: string): Promise<boolean> {
  const [bucket, ...rest] = bucketKey.split("/");
  if (!bucket || rest.length === 0) {
    console.error("[storage] invalid bucketKey for delete", { bucketKey });
    return false;
  }
  const objectPath = rest.join("/");
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.storage.from(bucket).remove([objectPath]);
  if (error) {
    console.error("[storage] delete failed", { bucketKey, error });
    return false;
  }
  return true;
}

// Generate a short-lived signed URL for a stored object. `bucketKey` is the
// full path including the bucket name as the first segment, e.g.
// `contracts/abc-123/contract-v2.pdf`. Returns null if the object doesn't
// exist or signing fails — caller decides how to surface that.
export async function getSignedUrl(
  bucketKey: string,
  options?: {
    expiresInSeconds?: number;
    download?: boolean | string; // true = generic download; string = filename
  },
): Promise<SignedUrlResult | null> {
  const ttl = options?.expiresInSeconds ?? DEFAULT_TTL_SECONDS;
  const [bucket, ...rest] = bucketKey.split("/");
  if (!bucket || rest.length === 0) {
    console.error("[storage] invalid bucketKey", { bucketKey });
    return null;
  }
  const objectPath = rest.join("/");

  const supabase = getSupabaseServiceClient();
  const signOptions = options?.download !== undefined
    ? { download: options.download }
    : undefined;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, ttl, signOptions);

  if (error || !data?.signedUrl) {
    console.error("[storage] sign failed", { bucketKey, error });
    return null;
  }

  return {
    url: data.signedUrl,
    expiresAt: Date.now() + ttl * 1000,
  };
}
