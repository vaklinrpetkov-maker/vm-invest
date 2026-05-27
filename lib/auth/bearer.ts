import { serverEnv } from "@/lib/env";

// Constant-time comparison for shared-secret auth on machine-to-machine
// endpoints. Using string === would leak length/timing info to an attacker
// watching response times. Not critical at our scale, but free to get right.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type BearerResult =
  | { ok: true }
  | { ok: false; status: 401 | 501; message: string };

// Check an incoming Request for a Bearer token matching LEADS_INGEST_TOKEN.
// Accepts the token either as:
//   - `Authorization: Bearer <token>` header (preferred; curl, custom scripts)
//   - `?token=<token>` query string (fallback for webhook providers like
//     Resend that don't let you set custom request headers)
//
// Returns 501 when the token isn't configured — lets dev environments run
// without machine endpoints accidentally accepting anything.
export function checkLeadsIngestAuth(request: Request): BearerResult {
  const configured = serverEnv().LEADS_INGEST_TOKEN;
  if (!configured) {
    return {
      ok: false,
      status: 501,
      message:
        "LEADS_INGEST_TOKEN is not configured on the server. Set it in .env.local to enable this endpoint.",
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (m) {
    return safeEqual(m[1], configured)
      ? { ok: true }
      : { ok: false, status: 401, message: "Invalid token." };
  }

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  if (queryToken) {
    return safeEqual(queryToken, configured)
      ? { ok: true }
      : { ok: false, status: 401, message: "Invalid token." };
  }

  return { ok: false, status: 401, message: "Missing token." };
}
