// Diagnostic — counts how many properties have non-empty `sellers` arrays
// vs. empty/null, plus the top 20 canonical seller values. Run with:
//   npm run sellers:check

import { prisma } from "@/lib/prisma";

async function main() {
  const total = await prisma.property.count({ where: { deletedAt: null } });

  const withSellers = await prisma.property.count({
    where: {
      deletedAt: null,
      NOT: { sellers: { isEmpty: true } },
    },
  });

  type Row = { seller: string; count: bigint };
  const top = await prisma.$queryRaw<Row[]>`
    SELECT UNNEST(sellers) AS seller, COUNT(*)::bigint AS count
    FROM public.properties
    WHERE deleted_at IS NULL
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 20
  `;

  console.log(`Total non-deleted properties:     ${total}`);
  console.log(`With non-empty sellers array:     ${withSellers}`);
  console.log(`Empty sellers array:              ${total - withSellers}`);
  console.log("\nTop 20 canonical seller values:");
  for (const r of top) {
    console.log(`  ${String(r.count).padStart(4, " ")}  ${r.seller}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[check] failed", err);
  process.exit(1);
});
