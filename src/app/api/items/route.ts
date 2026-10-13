import { apiUser, isResponse } from '@/lib/auth';
import { canInput } from '@/lib/roles';
import { getSettings } from '@/lib/settings';
import { handleApiError, ValidationError } from '@/lib/validate';
import { createLines, type NewLine } from '@/server/items';
import { listItems } from '@/server/query';
import { syncOcs } from '@/server/sync';
import { ocsConfigured } from '@/lib/ocs-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const u = await apiUser();
  if (isResponse(u)) return u;
  const sp = new URL(req.url).searchParams;
  const settings = await getSettings();
  const rows = await listItems({
    status: sp.get('status'), from: sp.get('from'), to: sp.get('to'),
    mine: sp.get('mine') === '1' ? u.id : null, sku: sp.get('sku'), orderId: sp.get('orderId'), q: sp.get('q')?.trim() || null,
  }, settings.cancelRef);
  return Response.json({ rows });
}

/** Input pending — satu baris {orderId, sku, qty, note} atau banyak {lines:[…]}. */
export async function POST(req: Request) {
  const u = await apiUser(canInput);
  if (isResponse(u)) return u;
  try {
    const b = await req.json();
    const lines: NewLine[] = Array.isArray(b.lines) ? b.lines : [b];
    if (!lines.length) throw new ValidationError('Tidak ada baris untuk disimpan');
    if (lines.length > 500) throw new ValidationError('Maksimal 500 baris sekali simpan');
    const results = await createLines(u, lines);
    // Order baru langsung dicek ke OCS (dibatasi supaya respons tetap cepat).
    const fresh = [...new Set(results.filter((r) => r.ok).map((r) => r.orderId))];
    let sync: { checked: number; message: string } | null = null;
    if (fresh.length && ocsConfigured()) {
      const s = await syncOcs({ trigger: 'input', orderIds: fresh.slice(0, 30), budgetMs: 20000 }).catch((e) => ({ checked: 0, message: (e as Error).message }));
      sync = { checked: s.checked, message: s.message };
    }
    const saved = results.filter((r) => r.ok).length;
    return Response.json({ ok: saved > 0, saved, failed: results.length - saved, results, sync }, { status: saved ? 201 : 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
