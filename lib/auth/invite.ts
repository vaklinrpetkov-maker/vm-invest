import { randomBytes } from "node:crypto";

// 72-hour invite validity per Authentication.md §4.3.
export const INVITE_TTL_HOURS = 72;

// 32 bytes → 43 url-safe chars. Plenty of entropy and short enough for an URL.
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function inviteExpiresAt(): Date {
  return new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);
}

export type InviteStatus = "active" | "redeemed" | "cancelled" | "expired";

export function inviteStatus(invite: {
  redeemedAt: Date | null;
  cancelledAt: Date | null;
  expiresAt: Date;
}): InviteStatus {
  if (invite.redeemedAt) return "redeemed";
  if (invite.cancelledAt) return "cancelled";
  if (invite.expiresAt < new Date()) return "expired";
  return "active";
}
