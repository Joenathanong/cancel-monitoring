import { apiUser, isResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canFollowUp } from '@/lib/roles';
import { getSettings } from '@/lib/settings';
import { handleApiError, ValidationError } from '@/lib/validate';
import { applyFollowUp, parseFollowUp } from '@/server/followup';

/** Tindak lanjut massal: {ids:[…]} atau {sku} (= semua item OPEN dengan SKU itu) + {followUp:{…}}. */
export async function POST(req: Request) {
  const u = await apiUser(canFollowUp);
  if (isResponse(u)) return u;
  try {
    const b = await req.json();
    const settings = await getSettings();
    const fu = parseFollowUp(b.followUp ?? {}, settings.reasons);
    if (!Object.keys(fu).length) throw new ValidationError('Tidak ada isian tindak lanjut');
    let ids: string[] = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 2000) : [];
    if (!ids.length && b.sku) {
      const rows = await prisma.pendingItem.findMany({ where: { sku: String(b.sku), order: { resolution: 'OPEN' } }, select: { id: true } });
      ids = rows.map((r: { id: string }) => r.id);
    }
    if (!ids.length) throw new ValidationError('Tidak ada item yang dipilih');
    const n = await applyFollowUp(u, ids, fu);
    return Response.json({ ok: true, updated: n, total: ids.length });
  } catch (e) {
    return handleApiError(e);
  }
}
