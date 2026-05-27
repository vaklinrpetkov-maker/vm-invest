import { NextResponse, type NextRequest } from "next/server";
import { checkLeadsIngestAuth } from "@/lib/auth/bearer";
import { ingestRawEmail } from "@/lib/leads/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Webhook ingestion endpoint. Agnostic to source — call it from:
//   - Resend / Postmark / CloudMailin inbound webhooks
//   - A cron script that polls IMAP and POSTs each message here
//   - curl for manual testing (admin paste page)
//
// Accepts raw email either as:
//   - Content-Type: text/plain → the request body is the raw email
//   - Content-Type: application/json → one of:
//       * Resend `email.received` shape: { type, data: { email_id, ... } } —
//         body is NOT in the payload; we must fetch raw MIME from Resend's
//         API using `email_id`.
//       * CloudMailin / Mailgun / Postmark "raw" shapes: { raw | text |
//         raw_mime_message | message | RawEmail | body-mime } at the root or
//         one level deep under `data.*`.
//
// Always returns JSON describing the ingestion outcome. Idempotent: a
// duplicate Message-ID returns a `skipped_duplicate` without creating
// anything, so retry-on-error is safe.

async function fetchResendRawMime(emailId: string): Promise<
  { ok: true; raw: string } | { ok: false; status: number; detail: string }
> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 500, detail: "RESEND_API_KEY is not configured." };
  }

  // Step 1: fetch the received-email metadata. Response contains
  // `raw.download_url` — a signed CloudFront URL for the full MIME.
  const metaRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!metaRes.ok) {
    const text = await metaRes.text().catch(() => "");
    return {
      ok: false,
      status: 502,
      detail: `Resend API returned ${metaRes.status}: ${text.slice(0, 300)}`,
    };
  }

  const meta = (await metaRes.json()) as {
    raw?: { download_url?: string | null } | null;
  };
  const downloadUrl = meta.raw?.download_url;
  if (!downloadUrl) {
    return {
      ok: false,
      status: 502,
      detail: "Resend response missing raw.download_url.",
    };
  }

  // Step 2: fetch the raw MIME from the signed URL.
  const rawRes = await fetch(downloadUrl);
  if (!rawRes.ok) {
    return {
      ok: false,
      status: 502,
      detail: `Raw MIME download returned ${rawRes.status}.`,
    };
  }

  return { ok: true, raw: await rawRes.text() };
}

export async function POST(request: NextRequest) {
  const auth = checkLeadsIngestAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let raw: string;
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;

      // Resend inbound shape: metadata-only webhook. Body (raw MIME) must be
      // fetched via the API using `data.email_id`.
      const isResendShape =
        body.type === "email.received" &&
        body.data !== null &&
        typeof body.data === "object" &&
        !Array.isArray(body.data) &&
        typeof (body.data as Record<string, unknown>).email_id === "string";

      if (isResendShape) {
        const emailId = (body.data as Record<string, unknown>).email_id as string;
        const fetched = await fetchResendRawMime(emailId);
        if (!fetched.ok) {
          console.error("[api/leads/ingest] Resend fetch failed", fetched);
          return NextResponse.json(
            { error: "Resend raw-MIME fetch failed", detail: fetched.detail },
            { status: fetched.status },
          );
        }
        raw = fetched.raw;
      } else {
        // CloudMailin / Mailgun / Postmark / our paste page: look for common
        // field names at the root *and* one level deep under `data.*`.
        const candidates: unknown[] = [
          body.raw,
          body.text,
          body.raw_mime_message,
          body.message,
          body.RawEmail,
          body["body-mime"],
        ];
        const nested =
          body.data && typeof body.data === "object" && !Array.isArray(body.data)
            ? (body.data as Record<string, unknown>)
            : null;
        if (nested) {
          candidates.push(
            nested.raw,
            nested.text,
            nested.raw_mime_message,
            nested.message,
            nested.RawEmail,
            nested["body-mime"],
          );
        }
        raw = candidates.find((v): v is string => typeof v === "string" && v.length > 0) ?? "";
      }
    } else {
      // text/plain, message/rfc822, or anything else — treat the body as the
      // raw email source.
      raw = await request.text();
    }
  } catch (err) {
    return NextResponse.json(
      { error: "Bad body", detail: (err as Error).message },
      { status: 400 },
    );
  }

  if (!raw.trim()) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  try {
    const outcome = await ingestRawEmail(raw);
    return NextResponse.json({ ok: true, outcome });
  } catch (err) {
    console.error("[api/leads/ingest] ingestion error", err);
    return NextResponse.json(
      { error: "Ingestion failed", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
