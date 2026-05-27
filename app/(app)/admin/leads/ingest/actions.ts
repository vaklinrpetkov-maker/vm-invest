"use server";

import { requireRole } from "@/lib/auth/session";
import { ingestRawEmail, type IngestOutcome } from "@/lib/leads/ingest";

export type IngestState = {
  outcome?: IngestOutcome;
  error?: string;
};

// Admin-only hook for running a raw email through the ingestion pipeline.
// Used to validate the parser + matcher + dedup without real IMAP wiring.
// The same `ingestRawEmail` call site will be used by the real source in LP2-B.
export async function ingestForTesting(
  _prev: IngestState,
  formData: FormData,
): Promise<IngestState> {
  await requireRole("admin");
  const raw = String(formData.get("raw") ?? "");
  if (!raw.trim()) return { error: "Поставете съдържание на имейл." };
  try {
    const outcome = await ingestRawEmail(raw);
    return { outcome };
  } catch (err) {
    console.error("[admin/leads/ingest] error", err);
    return { error: (err as Error).message };
  }
}
