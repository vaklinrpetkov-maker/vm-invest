"use client";

// Detail-page Files section. Thin wrapper that closure-captures the
// contractId and feeds <FileCell> with both the existing attachments and
// an upload callback. Same pattern the contracts table uses, just rendered
// in a card-style block on the detail page.
//
// Why a separate component instead of putting this inline in page.tsx:
// the detail page is a server component, and the upload callback needs to
// be a client-side function (it constructs FormData in the browser).

import { FileCell } from "@/components/ui/file-cell";
import type { AttachedFile } from "@/lib/files/types";
import {
  deleteContractAttachment,
  uploadContractAttachment,
} from "../attachment-actions";

export function ContractFiles({
  contractId,
  files,
  canDelete,
}: {
  contractId: string;
  files: AttachedFile[];
  canDelete: boolean;
}) {
  return (
    <FileCell
      module="contracts"
      files={files}
      onUpload={async (file) => {
        const fd = new FormData();
        fd.append("contractId", contractId);
        fd.append("file", file);
        return uploadContractAttachment(fd);
      }}
      onDelete={
        canDelete ? (file) => deleteContractAttachment(file.id) : undefined
      }
    />
  );
}
