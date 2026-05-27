// LLM-based invoice parser. Takes a PDF buffer, returns a structured payload
// matching the Invoice + InvoiceLineItem schema, plus a confidence score.
//
// Round 2 deliberately keeps this synchronous (the user waits during upload)
// — at the volume we expect (~25/week) the 5-15s latency is acceptable and
// the infrastructure cost of a queue is not justified yet. See specs/invoices.md §10.
//
// Currency handling: Bulgarian supplier invoices are almost always in BGN
// while the rest of the app is EUR-only. We ask Claude to extract amounts
// in the document's native currency + detect the currency, then convert to
// EUR server-side at the fixed peg (1 EUR = 1.95583 BGN). The conversion is
// silent — no UI element references BGN — because the user's directive was
// "everything should be in euro." The PDF stays as the source-of-truth
// audit trail if anyone wants to verify the math.

import Anthropic from "@anthropic-ai/sdk";

// Fixed EUR-BGN peg. Bulgaria has been on this peg since 1999 and the
// formal euro adoption (expected 2026) doesn't change the rate. Once the
// changeover happens, BGN amounts simply stop appearing in new invoices
// and this conversion path becomes dead code — no rate change needed.
const BGN_PER_EUR = 1.95583;

// Model snapshot. Sonnet 4.5 handles PDF input natively (no rasterisation
// needed) and is fast enough for the sync-upload UX. If the snapshot is
// retired or quota becomes a concern, swap to `claude-3-5-sonnet-latest`
// or a smaller model — the prompt + JSON schema are model-agnostic.
const MODEL = "claude-sonnet-4-5";

// Read the API key under either casing — the user's .env.local has it as
// `Anthropic_API_KEY`, the SDK defaults to `ANTHROPIC_API_KEY`. Don't force
// them to rename.
function getApiKey(): string | null {
  return (
    process.env.ANTHROPIC_API_KEY ??
    process.env.Anthropic_API_KEY ??
    null
  );
}

export type ParsedInvoiceLineItem = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  vatRate: number;
};

export type ParsedInvoice = {
  vendorName: string;
  vendorVatNumber: string | null;
  invoiceNumber: string;
  // ISO date YYYY-MM-DD. Claude is asked to normalise from any source format.
  invoiceDate: string;
  dueDate: string | null;
  // Amounts in EUR after server-side conversion. Caller does not need to
  // know the source currency was anything else.
  subtotal: number;
  vatAmount: number;
  total: number;
  lineItems: ParsedInvoiceLineItem[];
  // 0-100 self-assessed by the model — minimum across all extracted fields.
  // Per spec §10: <80 triggers a "review carefully" banner in the preview.
  confidence: number;
};

export type ParseResult =
  | { ok: true; data: ParsedInvoice }
  | { ok: false; error: string };

// Internal shape we ask Claude to return — still in source currency. The
// server-side conversion step turns this into a `ParsedInvoice`.
type RawParsed = {
  vendor_name: string;
  vendor_vat_number: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  source_currency: "EUR" | "BGN" | "OTHER";
  subtotal: number;
  vat_amount: number;
  total: number;
  line_items: Array<{
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    line_total: number;
    vat_rate: number;
  }>;
  confidence: number;
};

// Prompt is in English — the model performs better on instruction-following
// in English even when the source document is Bulgarian. Output instructions
// are very explicit about the JSON shape because we parse the response with
// JSON.parse and accept zero deviation.
const SYSTEM_PROMPT = `You are an extraction engine for Bulgarian supplier invoices (Фактури).
You will receive a single PDF and must return ONE JSON object matching the schema below.

OUTPUT RULES (strict):
1. Return ONLY valid JSON. No prose, no markdown fences, no comments.
2. Every numeric field is a JSON number, not a string. Use a period as decimal separator.
3. Dates are ISO format YYYY-MM-DD. If a field is missing in the document, return null (NOT an empty string) — except for required fields below which must always be filled with your best extraction.
4. Preserve the source currency in \`source_currency\`. Do NOT convert. The caller converts to EUR.
5. \`confidence\` is your 0-100 self-assessment of the overall extraction quality. Be honest — return below 80 if any required field was hard to read or if the line items look incomplete.

REQUIRED FIELDS (always present):
- vendor_name: supplier company name (Доставчик / Получател of the invoice from vminvest's perspective is the SUPPLIER, not vminvest).
- invoice_number: the supplier's own invoice number (Номер на фактура / № на документ).
- invoice_date: when the invoice was issued (Дата на издаване / Дата на данъчно събитие).
- source_currency: "BGN", "EUR", or "OTHER". Almost always BGN for Bulgarian invoices.
- subtotal: net amount before VAT (Данъчна основа / Сума без ДДС).
- vat_amount: VAT amount (Стойност на ДДС / ДДС).
- total: gross total (Сума за плащане / Обща сума с ДДС).
- line_items: array of products/services. Each line must have description, quantity (default 1), unit (default "бр."), unit_price, line_total, vat_rate (default 20).

OPTIONAL FIELDS (null if missing):
- vendor_vat_number: Bulgarian ДДС номер or ЕИК (typically starts with "BG" or is a 9-13 digit number).
- due_date: payment due date (Срок на плащане / Падеж).

JSON SCHEMA:
{
  "vendor_name": string,
  "vendor_vat_number": string | null,
  "invoice_number": string,
  "invoice_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD" | null,
  "source_currency": "BGN" | "EUR" | "OTHER",
  "subtotal": number,
  "vat_amount": number,
  "total": number,
  "line_items": [
    {
      "description": string,
      "quantity": number,
      "unit": string,
      "unit_price": number,
      "line_total": number,
      "vat_rate": number
    }
  ],
  "confidence": number
}`;

export async function parseInvoicePdf(pdfBuffer: Buffer): Promise<ParseResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      ok: false,
      error: "Липсва Anthropic_API_KEY в .env.local. Свържи се с администратор.",
    };
  }

  const client = new Anthropic({ apiKey });

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBuffer.toString("base64"),
              },
            },
            {
              type: "text",
              text: "Extract this invoice. Return ONLY the JSON object as specified.",
            },
          ],
        },
      ],
    });
  } catch (err) {
    const msg = (err as Error).message ?? "Непозната грешка от Anthropic API.";
    console.error("[invoices.parser] API call failed", err);
    return { ok: false, error: `Грешка при разпознаване: ${msg}` };
  }

  // Claude returns content blocks; for our prompt only the first text block
  // matters. Defensive: walk all blocks in case ordering changes.
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return { ok: false, error: "Разпознавателят върна неочаквана структура." };
  }

  // Strip code-fence wrappers if the model defies the instruction not to.
  // Cheap belt-and-braces — costs us nothing and saves a class of failures.
  let raw = textBlock.text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }

  let parsed: RawParsed;
  try {
    parsed = JSON.parse(raw) as RawParsed;
  } catch (err) {
    console.error("[invoices.parser] JSON.parse failed", { raw, err });
    return {
      ok: false,
      error:
        "Разпознавателят върна невалиден JSON. Опитай отново или попълни ръчно.",
    };
  }

  // Convert to EUR before returning. The conversion happens silently —
  // the preview modal shows EUR amounts only and the user never sees BGN.
  const factor = parsed.source_currency === "BGN" ? 1 / BGN_PER_EUR : 1;
  const toEur = (n: number): number => Math.round(n * factor * 100) / 100;
  const toEurUnit = (n: number): number =>
    // Unit price uses 4 decimals to preserve precision on small per-piece
    // values. The Decimal(12,4) column accepts this.
    Math.round(n * factor * 10000) / 10000;

  const data: ParsedInvoice = {
    vendorName: parsed.vendor_name?.trim() ?? "",
    vendorVatNumber: parsed.vendor_vat_number?.trim() || null,
    invoiceNumber: parsed.invoice_number?.trim() ?? "",
    invoiceDate: parsed.invoice_date,
    dueDate: parsed.due_date || null,
    subtotal: toEur(parsed.subtotal ?? 0),
    vatAmount: toEur(parsed.vat_amount ?? 0),
    total: toEur(parsed.total ?? 0),
    lineItems: (parsed.line_items ?? []).map((li, idx) => ({
      description: li.description?.trim() ?? `Позиция ${idx + 1}`,
      quantity: li.quantity ?? 1,
      unit: li.unit?.trim() || "бр.",
      unitPrice: toEurUnit(li.unit_price ?? 0),
      lineTotal: toEur(li.line_total ?? 0),
      vatRate: li.vat_rate ?? 20,
    })),
    confidence: clampConfidence(parsed.confidence),
  };

  return { ok: true, data };
}

function clampConfidence(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 50;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
