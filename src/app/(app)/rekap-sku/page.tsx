import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { SkuWorkspace } from '@/components/pending/sku-workspace';

export const dynamic = 'force-dynamic';

export default async function RekapSkuPage() {
  const u = await requireUser();
  const s = await getSettings();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">Rekap per SKU</h1>
        <div className="text-sm text-label mt-1">SKU yang masih pending (order belum terproses / batal) — dasar Inventory membuka PO ke PT Eka Jaya. Tindak lanjut di sini berlaku ke semua baris SKU tersebut.</div>
      </div>
      <SkuWorkspace canFollowUp={u.role === 'ADMIN' || u.role === 'INVENTORY'} reasons={s.reasons} />
    </div>
  );
}
