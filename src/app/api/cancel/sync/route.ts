import { apiUser, isResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canWrite } from '@/lib/roles';
import { autoCancelSync, syncCancelDetail, syncCancelList } from '@/server/cancel-sync';
import { setInternal } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** kind: auto (saat halaman dibuka) | list | detail | all | reset (ulang dari tanggal mulai) */
export async function POST(req: Request) {
  const u = await apiUser();
  if (isResponse(u)) return u;
  const b = await req.json().catch(() => ({}));
  const kind = String(b.kind || 'auto');
  if (kind === 'auto') return Response.json(await autoCancelSync('auto'));
  if (!canWrite(u.role)) return Response.json({ error: 'Akun Anda hanya bisa melihat' }, { status: 403 });
  if (kind === 'list') return Response.json({ list: await syncCancelList({ trigger: 'manual', budgetMs: 50000 }) });
  if (kind === 'detail') return Response.json({ detail: await syncCancelDetail({ trigger: 'manual', budgetMs: 50000 }) });
  if (kind === 'reset') {
    if (u.role !== 'ADMIN') return Response.json({ error: 'Hanya Admin' }, { status: 403 });
    await setInternal('cancel_list_cursor', '');
    return Response.json({ list: await syncCancelList({ trigger: 'manual', reset: true, budgetMs: 50000 }) });
  }
  if (kind === 'all') {
    const t0 = Date.now();
    const list = await syncCancelList({ trigger: 'manual', budgetMs: 25000 });
    const detail = await syncCancelDetail({ trigger: 'manual', budgetMs: Math.max(5000, 50000 - (Date.now() - t0)) });
    return Response.json({ list, detail });
  }
  return Response.json({ error: 'kind tidak dikenal' }, { status: 400 });
}

export async function GET() {
  const u = await apiUser();
  if (isResponse(u)) return u;
  const runs = await prisma.syncRun.findMany({ where: { kind: { in: ['CANCEL_LIST', 'CANCEL_DETAIL'] } }, orderBy: { startedAt: 'desc' }, take: 10 });
  const total = await prisma.cancelOrder.count();
  return Response.json({ total, runs: runs.map((r: (typeof runs)[number]) => ({ ...r, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null })) });
}
