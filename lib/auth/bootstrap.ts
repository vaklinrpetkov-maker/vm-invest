import { cache } from "react";
import { prisma } from "@/lib/prisma";

// "Bootstrap" = no profiles exist yet. The first signup auto-promotes to admin.
// We cache per-request because we'll check this in middleware-adjacent paths.
export const isBootstrap = cache(async (): Promise<boolean> => {
  const count = await prisma.profile.count();
  return count === 0;
});
