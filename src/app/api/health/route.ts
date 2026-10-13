import { prisma } from '@/lib/prisma';
import { ocsConfigured } from '@/lib/ocs-client';
import { doiConfigured } from '@/lib/doi-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: 'up', ocs: ocsConfigured() ? 'configured' : 'missing', doiMonitor: doiConfigured() ? 'configured' : 'missing', time: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, db: 'down', error: (e as Error).message }, { status: 503 });
  }
}
