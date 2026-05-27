// Centralized signing endpoint for file attachments. Every module's file
// cell + preview modal funnels through here. The route owns three things:
//   1. Authentication (must be a logged-in active profile)
//   2. Per-module authorization (dispatch on `module` discriminant)
//   3. Audit logging (every view + download is recorded)
//
// Why one route instead of per-module endpoints? See
// `specs/_foundations/ui-patterns-files.md` §6 — keeps the cell component
// truly module-agnostic and means the audit-logging convention is enforced
// in one place. Adding a new module = one switch case here, not a new route.

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { recordAuditEvent, type AuditAction } from "@/lib/auth/audit";
import { getCurrentProfile } from "@/lib/auth/session";
import type { FileModule, SignedFileUrl } from "@/lib/files/types";
import { prisma } from "@/lib/prisma";
import { getSignedUrl } from "@/lib/supabase/storage";

type SignRequestBody = {
  module: FileModule;
  attachmentId: string;
  // intent: "view" (default) records *.viewed; "download" records *.downloaded
  // and asks Supabase to send Content-Disposition: attachment.
  intent?: "view" | "download";
};

const VIEW_ACTION: Record<FileModule, AuditAction | null> = {
  contracts: "contracts.attachment.viewed",
  invoices: "invoices.attachment.viewed",
};

const DOWNLOAD_ACTION: Record<FileModule, AuditAction | null> = {
  contracts: "contracts.attachment.downloaded",
  invoices: "invoices.attachment.downloaded",
};

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Не сте влезли в системата." }, { status: 401 });
  }

  let body: SignRequestBody;
  try {
    body = (await request.json()) as SignRequestBody;
  } catch {
    return NextResponse.json({ error: "Невалидно тяло на заявката." }, { status: 400 });
  }

  const { module, attachmentId, intent = "view" } = body ?? {};
  if (!module || !attachmentId || typeof attachmentId !== "string") {
    return NextResponse.json({ error: "Липсват задължителни полета." }, { status: 400 });
  }

  // --- Per-module dispatch -------------------------------------------------
  // Each module is responsible for: (a) loading its attachment row, (b)
  // checking that this profile is allowed to see it, and (c) returning the
  // bucket key + display metadata. New modules slot in as additional cases.

  let resolved: { url: string; mimeType: string; fileName: string; expiresAt: number } | null;

  switch (module) {
    case "contracts": {
      const attachment = await prisma.contractAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          storageKey: true,
          contract: { select: { id: true } },
        },
      });
      if (!attachment) {
        return NextResponse.json(
          { error: "Файлът не е намерен." },
          { status: 404 },
        );
      }
      // Phase 1 read-permission rule: any signed-in profile that can see
      // contracts can see their attachments. The contracts list itself is
      // role-gated upstream; if a row is in the table the user is allowed
      // to see its attachments. Per-attachment ACLs ship with versioning.
      const signed = await getSignedUrl(attachment.storageKey, {
        expiresInSeconds: 5 * 60,
        download: intent === "download" ? attachment.fileName : false,
      });
      if (!signed) {
        return NextResponse.json(
          { error: "Подписаната връзка не може да бъде генерирана." },
          { status: 502 },
        );
      }
      resolved = {
        url: signed.url,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
        expiresAt: signed.expiresAt,
      };
      break;
    }

    case "invoices": {
      // Invoices don't have a separate attachment table — the PDF lives
      // directly on the Invoice row (single file per invoice). We reuse
      // `attachmentId` as the invoice id from the client's perspective.
      const invoice = await prisma.invoice.findUnique({
        where: { id: attachmentId },
        select: { id: true, storagePath: true, fileName: true },
      });
      if (!invoice) {
        return NextResponse.json(
          { error: "Фактурата не е намерена." },
          { status: 404 },
        );
      }
      // Permission rule per specs/invoices.md §11: admin + manager only.
      // Users with role=user can't see the module at all and shouldn't be
      // able to fetch attachments either, even by guessing an id.
      if (profile.role !== "admin" && profile.role !== "manager") {
        return NextResponse.json({ error: "Нямате достъп." }, { status: 403 });
      }
      const signed = await getSignedUrl(invoice.storagePath, {
        expiresInSeconds: 5 * 60,
        download: intent === "download" ? invoice.fileName : false,
      });
      if (!signed) {
        return NextResponse.json(
          { error: "Подписаната връзка не може да бъде генерирана." },
          { status: 502 },
        );
      }
      resolved = {
        url: signed.url,
        mimeType: "application/pdf",
        fileName: invoice.fileName,
        expiresAt: signed.expiresAt,
      };
      break;
    }

    default: {
      // Exhaustiveness check — TypeScript widens `module` to never here, so
      // adding a new FileModule member without a case will fail typecheck.
      const _exhaustive: never = module;
      void _exhaustive;
      return NextResponse.json({ error: "Непознат модул." }, { status: 400 });
    }
  }

  // --- Audit log ----------------------------------------------------------
  const action = intent === "download" ? DOWNLOAD_ACTION[module] : VIEW_ACTION[module];
  if (action) {
    const hdrs = await headers();
    await recordAuditEvent({
      actorId: profile.id,
      action,
      targetType: "attachment",
      targetId: attachmentId,
      payload: { module, fileName: resolved.fileName },
      ip: hdrs.get("x-forwarded-for") ?? null,
      userAgent: hdrs.get("user-agent") ?? null,
    });
  }

  const response: SignedFileUrl = {
    url: resolved.url,
    expiresAt: resolved.expiresAt,
    attachmentId,
    mimeType: resolved.mimeType,
    fileName: resolved.fileName,
  };
  return NextResponse.json(response);
}
