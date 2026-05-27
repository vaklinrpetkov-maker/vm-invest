// Minimal MIME email parser tailored to the vminvest form email described in
// specs/leads.md §7.2. Not a general-purpose RFC 2822 parser — we accept only
// the exact shape we expect and reject everything else as unparseable.
//
// Handles:
//   - Header folding (continuation lines)
//   - Q-encoded Subject
//   - multipart/alternative with a text/plain part
//   - text/plain with 8bit or quoted-printable transfer encoding
//   - Label-newline-value-blank-line body structure per the form template
//
// Tested against the provided sample .eml. If Бланка's HTML changes its plain
// part, the label regex is the only knob to turn.

export type ParsedForm = {
  project: string | null;
  property: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  // Marketing consent is parsed out for completeness but deliberately dropped
  // before we persist — per the user spec, we don't store it anywhere.
  marketingConsent: string | null;
};

export type ParsedEmail = {
  messageId: string;
  from: string;
  subject: string;
  receivedAt: Date;
  rawPlainBody: string;
  fields: ParsedForm;
};

export type ParseFailure = {
  error: ParseErrorCode;
  messageId: string | null;
  from: string | null;
  subject: string | null;
  receivedAt: Date | null;
  rawBody: string;
};

export type ParseErrorCode =
  | "no_header_body_split"
  | "missing_message_id"
  | "missing_date"
  | "no_plaintext_part"
  | "missing_field:name"
  | "missing_field:email"
  | "missing_field:phone"
  | "missing_field:message"
  | "bad_date";

export type ParseResult = { ok: true; parsed: ParsedEmail } | { ok: false; failure: ParseFailure };

// Expected sender/subject constants — the parser still returns data for
// mismatches, but the ingestion layer uses these to decide "is this even our
// form?" and can skip non-matching emails entirely.
export const FORM_EMAIL_FROM = "noreply@vminvest.bg";
export const FORM_EMAIL_SUBJECT = "[vminvest.bg] Форма за интерес към имот";

// ── low-level helpers ──────────────────────────────────────────────────────

// Unfold header continuation lines: RFC 5322 says a line starting with
// whitespace continues the previous header.
function unfoldHeaders(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\n[ \t]+/g, " ");
}

function findHeader(unfolded: string, name: string): string | null {
  const lines = unfolded.split("\n");
  const lower = name.toLowerCase();
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    if (line.slice(0, colon).toLowerCase() === lower) {
      return line.slice(colon + 1).trim();
    }
  }
  return null;
}

// Decode a =?UTF-8?Q?...?= sequence (the Subject header in our sample).
// Supports Q (quoted-printable) and B (base64) encodings. Per RFC 2047,
// linear whitespace between two adjacent encoded-words is elided — without
// this collapse we'd split a single Bulgarian word across chunk boundaries
// (e.g. "към" becomes "къ" + "м имот").
function decodeMimeWord(raw: string): string {
  const collapsed = raw.replace(/\?=\s+=\?/g, "?==?");
  return collapsed.replace(
    /=\?([^?]+)\?([QqBb])\?([^?]*)\?=/g,
    (_, charset, enc, payload) => {
      try {
        if (enc.toUpperCase() === "Q") {
          const bytes: number[] = [];
          for (let i = 0; i < payload.length; i++) {
            const ch = payload[i];
            if (ch === "_") {
              bytes.push(0x20);
            } else if (ch === "=" && i + 2 < payload.length) {
              bytes.push(parseInt(payload.slice(i + 1, i + 3), 16));
              i += 2;
            } else {
              bytes.push(ch.charCodeAt(0));
            }
          }
          return new TextDecoder((charset as string).toLowerCase()).decode(
            Uint8Array.from(bytes),
          );
        }
        if (enc.toUpperCase() === "B") {
          const bin = Buffer.from(payload, "base64");
          return new TextDecoder((charset as string).toLowerCase()).decode(bin);
        }
      } catch {
        /* fall through */
      }
      return raw;
    },
  );
}

// Decode quoted-printable body (when Content-Transfer-Encoding: quoted-printable).
function decodeQuotedPrintable(body: string): string {
  // Remove soft line breaks
  const joined = body.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    const ch = joined[i];
    if (ch === "=" && i + 2 < joined.length) {
      const hex = joined.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(ch.charCodeAt(0));
  }
  return new TextDecoder("utf-8").decode(Uint8Array.from(bytes));
}

// Extract the text/plain part from a multipart body. Returns null if none found.
function extractTextPlain(
  body: string,
  boundary: string,
): { text: string; encoding: string; charset: string } | null {
  const marker = `--${boundary}`;
  const parts = body
    .split(marker)
    .map((p) => p.replace(/^\r?\n/, "").replace(/\r?\n\s*$/, ""))
    .filter((p) => p.length > 0 && !p.startsWith("--"));

  for (const part of parts) {
    const hEnd = part.search(/\r?\n\r?\n/);
    if (hEnd === -1) continue;
    const hdrs = unfoldHeaders(part.slice(0, hEnd));
    const partContentType = findHeader(hdrs, "Content-Type") ?? "";
    if (!/text\/plain/i.test(partContentType)) continue;

    const charsetMatch = partContentType.match(/charset="?([^";\s]+)"?/i);
    const charset = charsetMatch?.[1]?.toLowerCase() ?? "utf-8";
    const enc = (findHeader(hdrs, "Content-Transfer-Encoding") ?? "8bit").toLowerCase();
    const raw = part.slice(hEnd).replace(/^\r?\n\r?\n/, "");
    return { text: raw, encoding: enc, charset };
  }
  return null;
}

// Parse the label-newline-value-blank-line body structure.
function parseFormFields(body: string): ParsedForm {
  const out: ParsedForm = {
    project: null,
    property: null,
    name: null,
    email: null,
    phone: null,
    message: null,
    marketingConsent: null,
  };

  // Normalize newlines, trim, split on blank lines (one or more consecutive).
  const normalized = body.replace(/\r\n/g, "\n").trim();
  const chunks = normalized.split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean);

  for (const chunk of chunks) {
    const firstNl = chunk.indexOf("\n");
    if (firstNl === -1) continue;
    const label = chunk.slice(0, firstNl).trim().toLowerCase();
    const value = chunk.slice(firstNl + 1).trim();
    if (!value) continue;

    // Match the Bulgarian labels (with trailing colon optional).
    if (/^проект:?$/i.test(label)) out.project = value;
    else if (/^имот:?$/i.test(label)) out.property = value;
    else if (/^име\s+и\s+фамилия:?$/i.test(label)) out.name = value;
    else if (/^имейл:?$/i.test(label)) out.email = value.toLowerCase();
    else if (/^телефон:?$/i.test(label)) out.phone = value;
    else if (/^съобщение:?$/i.test(label)) out.message = value;
    else if (/^съгласие\s+за\s+маркетинг:?$/i.test(label))
      out.marketingConsent = value;
  }

  return out;
}

// ── public API ─────────────────────────────────────────────────────────────

export function parseEmail(raw: string): ParseResult {
  // Split headers from body on the first blank line.
  const headerEndMatch = raw.match(/\r?\n\r?\n/);
  if (!headerEndMatch || headerEndMatch.index === undefined) {
    return baseFailure("no_header_body_split", null, null, null, null, raw);
  }
  const headerEnd = headerEndMatch.index;
  const headerBlock = raw.slice(0, headerEnd);
  const body = raw.slice(headerEnd + headerEndMatch[0].length);
  const headers = unfoldHeaders(headerBlock);

  const messageId = findHeader(headers, "Message-ID")?.replace(/^<|>$/g, "") ?? null;
  const from = findHeader(headers, "From");
  const subjectRaw = findHeader(headers, "Subject");
  const dateRaw = findHeader(headers, "Date");
  const contentType = findHeader(headers, "Content-Type") ?? "";

  const subject = subjectRaw ? decodeMimeWord(subjectRaw) : "";

  if (!messageId) {
    return baseFailure("missing_message_id", null, from, subject, parseDate(dateRaw), body);
  }
  if (!dateRaw) {
    return baseFailure("missing_date", messageId, from, subject, null, body);
  }
  const receivedAt = parseDate(dateRaw);
  if (!receivedAt) {
    return baseFailure("bad_date", messageId, from, subject, null, body);
  }

  let plainText = body;
  const boundaryMatch = contentType.match(/boundary="?([^";\r\n]+)"?/i);
  if (boundaryMatch) {
    const extracted = extractTextPlain(body, boundaryMatch[1]);
    if (!extracted) {
      return baseFailure("no_plaintext_part", messageId, from, subject, receivedAt, body);
    }
    plainText =
      extracted.encoding === "quoted-printable"
        ? decodeQuotedPrintable(extracted.text)
        : extracted.text;
  } else {
    // Single-part message. Honor CTE on the root.
    const rootEnc = (findHeader(headers, "Content-Transfer-Encoding") ?? "8bit").toLowerCase();
    if (rootEnc === "quoted-printable") plainText = decodeQuotedPrintable(body);
  }

  const fields = parseFormFields(plainText);

  if (!fields.name) return baseFailure("missing_field:name", messageId, from, subject, receivedAt, plainText);
  if (!fields.email) return baseFailure("missing_field:email", messageId, from, subject, receivedAt, plainText);
  if (!fields.phone) return baseFailure("missing_field:phone", messageId, from, subject, receivedAt, plainText);
  if (!fields.message) return baseFailure("missing_field:message", messageId, from, subject, receivedAt, plainText);

  return {
    ok: true,
    parsed: {
      messageId,
      from: from ?? "",
      subject,
      receivedAt,
      rawPlainBody: plainText,
      fields,
    },
  };
}

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function baseFailure(
  error: ParseErrorCode,
  messageId: string | null,
  from: string | null,
  subject: string | null,
  receivedAt: Date | null,
  rawBody: string,
): ParseResult {
  return {
    ok: false,
    failure: { error, messageId, from, subject, receivedAt, rawBody },
  };
}
