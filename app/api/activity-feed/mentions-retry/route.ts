import { NextResponse, type NextRequest } from "next/server";
import { checkLeadsIngestAuth } from "@/lib/auth/bearer";
import { runMentionRetryScan } from "@/lib/activity-feed/retry-mentions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron-callable endpoint that re-tries `@mention` email notifications which
// failed to send at post / edit time (their `ActivityNoteMention.notifiedAt`
// is still null). Shares the same `LEADS_INGEST_TOKEN` bearer secret with
// the other machine-to-machine endpoints — the env var is misnamed but
// rotating it has no operational value; keep one cron credential.
//
// Recommended cadence: hourly. The scan is bounded by `batchSize` (default
// 50) so a large backlog drains gradually rather than overwhelming Resend
// on a single call. Mentions older than 7 days are abandoned (counted in
// `skippedTooOld` for visibility) — see `runMentionRetryScan` for the
// rationale.
//
// Both POST and GET supported so Vercel Cron (which uses GET) and curl /
// pg_cron (POST) both work.

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const auth = checkLeadsIngestAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  // Allow `?batch=N` override for ops debugging. Clamped to [1, 200] —
  // 200 lets a small backlog flush in one call, the upper bound keeps
  // Resend rate-limited under reasonable bursts.
  const url = new URL(request.url);
  const batchRaw = url.searchParams.get("batch");
  let batchSize: number | undefined;
  if (batchRaw) {
    const n = Number(batchRaw);
    if (Number.isFinite(n) && n > 0) {
      batchSize = Math.min(200, Math.max(1, Math.floor(n)));
    }
  }

  try {
    const result = await runMentionRetryScan(batchSize ? { batchSize } : undefined);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/activity-feed/mentions-retry] scan failed", err);
    return NextResponse.json(
      { error: "Scan failed", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
