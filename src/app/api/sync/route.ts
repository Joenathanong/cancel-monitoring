import { apiUser, isResponse } from '@/lib/auth';
import { canWrite } from '@/lib/roles';
import { autoSync, syncOcs, syncPhaseOut } from '@/server/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** {kind:'auto'} dipanggil halaman saat dibuka; 'ocs' / 'phase-out' / 'all' dari tombol. */
export async function POST(req: Request) {
  const u = await apiUser();
  if (isResponse(u)) return u;
  const b = await req.json().catch(() => ({}));
  const kind = String(b.kind || 'auto');
  if (kind === 'auto') return Response.json(await autoSync('auto'));
  if (!canWrite(u.role)) return Response.json({ error: 'Akun Anda hanya bisa melihat' }, { status: 403 });
  if (kind === 'ocs') return Response.json({ ocs: await syncOcs({ trigger: 'manual', budgetMs: 50000 }) });
  if (kind === 'phase-out') return Response.json({ phaseOut: await syncPhaseOut('manual') });
  if (kind === 'all') {
    const phaseOut = await syncPhaseOut('manual');
    const ocs = await syncOcs({ trigger: 'manual', budgetMs: 40000 });
    return Response.json({ phaseOut, ocs });
  }
  return Response.json({ error: 'kind tidak dikenal' }, { status: 400 });
}
