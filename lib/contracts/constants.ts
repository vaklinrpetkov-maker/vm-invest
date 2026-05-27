import type { BadgeTone } from "@/components/ui/status-badge";

// Contract type reflects how payments were made (cash/bank/both/none of СМР).
// Stored as a plain string so admins can add variants later without a
// migration — validation lives in the app code against this list.

export const CONTRACT_TYPES = [
  "SMR_KESH",
  "SMR_BANKA",
  "SMR_KOMBINIRAN",
  "BEZ_SMR",
] as const;

export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  SMR_KESH: "СМР Кеш",
  SMR_BANKA: "СМР Банка",
  SMR_KOMBINIRAN: "СМР Комбиниран",
  BEZ_SMR: "Без СМР",
};

export const CONTRACT_TYPE_TONES: Record<ContractType, BadgeTone> = {
  SMR_KESH: "info",
  SMR_BANKA: "accent",
  SMR_KOMBINIRAN: "warning-soft",
  BEZ_SMR: "neutral",
};

// Lifecycle status. Mirrors specs/contracts.md §7.1.
export const CONTRACT_STATUSES = ["draft", "signed", "cancelled"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Чернова",
  signed: "Подписан",
  cancelled: "Отказан",
};

export const CONTRACT_STATUS_TONES: Record<ContractStatus, BadgeTone> = {
  draft: "neutral",
  signed: "success",
  cancelled: "danger",
};

// Payment milestones — fixed 1:1 mapping, derived from `ContractPayment.number`.
export const PAYMENT_MILESTONES = ["ПД", "Акт 14", "Акт 15", "Акт 16"] as const;

// Installment track.
export const INSTALLMENT_TRACKS = ["CASH", "BANK"] as const;
export type InstallmentTrack = (typeof INSTALLMENT_TRACKS)[number];

export const INSTALLMENT_TRACK_LABELS: Record<InstallmentTrack, string> = {
  CASH: "Кеш",
  BANK: "Банка",
};

export const CONTRACTS_PAGE_SIZE = 100;
