import { NextResponse, type NextRequest } from "next/server";
import { checkLeadsIngestAuth } from "@/lib/auth/bearer";
import { notifyEscalated, runEscalationScan } from "@/lib/leads/timer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron-callable endpoint that flags any open timer >24h as escalated and
// emails managers + admins a digest of the newly-escalated ones. Same shared
// secret as the ingestion endpoint.
//
// Safe to call arbitrarily often — the scan is idempotent. Recommended
// cadence: every 5–15 min via pg_cron, Vercel Cron, or any external scheduler.

export async function POST(request: NextRequest) {
  return handle(request);
}

// Allow GET too for easier cron setup (Vercel Cron uses GET).
export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const auth = checkLeadsIngestAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const newlyEscalated = await runEscalationScan();
    if (newlyEscalated.length > 0) {
      await notifyEscalated(newlyEscalated);
    }
    return NextResponse.json({
      ok: true,
      newlyEscalatedCount: newlyEscalated.length,
      newlyEscalatedIds: newlyEscalated,
    });
  } catch (err) {
    console.error("[api/leads/escalation-scan] error", err);
    return NextResponse.json(
      { error: "Scan failed", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
