import { apiUser, isResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ocsConfigured } from '@/lib/ocs-client';
import { doiConfigured } from '@/lib/doi-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const u = await apiUser();
  if (isResponse(u)) return u;
  const [runs, phaseOutCount, openOrders, notFound, errored] = await Promise.all([
    prisma.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 30 }),
    prisma.phaseOutSku.count(),
    prisma.pendingOrder.count({ where: { resolution: 'OPEN' } }),
    prisma.pendingOrder.count({ where: { ocsFound: false } }),
    prisma.pendingOrder.count({ where: { lastCheckError: { not: null } } }),
  ]);
  return Response.json({
    ocsConfigured: ocsConfigured(),
    doiConfigured: doiConfigured(),
    phaseOutCount, openOrders, notFound, errored,
    runs: runs.map((r: (typeof runs)[number]) => ({ ...r, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null })),
  });
}
