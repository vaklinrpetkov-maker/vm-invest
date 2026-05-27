import { prisma } from "@/lib/prisma";

// Per Authentication.md §5: lock the account for 15 minutes after 5 failed
// login attempts. Tracking is per-email (not per-IP) — the spec is clear that
// the account itself is locked, not the source.

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function isLockedOut(email: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const recentFails = await prisma.failedLoginAttempt.count({
    where: { email, at: { gte: since } },
  });
  return recentFails >= MAX_ATTEMPTS;
}

export async function recordFailedLogin(email: string, profileId?: string | null): Promise<void> {
  await prisma.failedLoginAttempt.create({
    data: { email, profileId: profileId ?? null },
  });
}

export async function clearFailedLogins(email: string): Promise<void> {
  await prisma.failedLoginAttempt.deleteMany({ where: { email } });
}
