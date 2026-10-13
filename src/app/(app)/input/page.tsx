import { requireRole } from '@/lib/auth';
import { canInput } from '@/lib/roles';
import { getSettings } from '@/lib/settings';
import { InputWorkspace } from '@/components/pending/input-workspace';

export const dynamic = 'force-dynamic';

export default async function InputPage() {
  const u = await requireRole(canInput);
  const s = await getSettings();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">Input Order Pending</h1>
        <div className="text-sm text-label mt-1">Catat Order ID, SKU OCS, dan jumlah yang pending. Status order dicek otomatis ke OCS (Find Order).</div>
      </div>
      <InputWorkspace me={{ id: u.id, role: u.role }} reasons={s.reasons} agingWarnDays={s.agingWarnDays} />
    </div>
  );
}
