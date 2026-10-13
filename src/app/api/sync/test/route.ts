import { apiUser, isResponse } from '@/lib/auth';
import { isAdmin } from '@/lib/roles';
import { ocsLogin, findOrder } from '@/lib/ocs-client';
import { fetchPhaseOut } from '@/lib/doi-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/** Tes koneksi: {target:'ocs', orderId?} atau {target:'doi'}. */
export async function POST(req: Request) {
  const u = await apiUser(isAdmin);
  if (isResponse(u)) return u;
  const b = await req.json().catch(() => ({}));
  const t0 = Date.now();
  try {
    if (b.target === 'doi') {
      const r = await fetchPhaseOut();
      return Response.json({ ok: true, message: `doi-monitor OK — ${r.rows} baris phase out, ${r.entries.length} SKU (${Date.now() - t0} ms)` });
    }
    await ocsLogin();
    if (b.orderId) {
      const r = await findOrder(String(b.orderId).trim());
      return Response.json({ ok: true, message: r.found ? `OCS OK — order ${r.orderId}: ${r.statusName} (${r.statusCode}), ${r.shopName ?? ''} ${r.area ?? ''} (${Date.now() - t0} ms)` : `Login OCS OK, tapi order ${b.orderId} tidak ditemukan` });
    }
    return Response.json({ ok: true, message: `Login OCS OK (${Date.now() - t0} ms)` });
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message }, { status: 502 });
  }
}
