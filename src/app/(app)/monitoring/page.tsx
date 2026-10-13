import { Suspense } from 'react';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { MonitoringWorkspace } from '@/components/pending/monitoring-workspace';

export const dynamic = 'force-dynamic';

export default async function MonitoringPage() {
  const u = await requireUser();
  const s = await getSettings();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">Monitoring Pending</h1>
        <div className="text-sm text-label mt-1">Setiap baris input Fulfillment beserta alasan pending, status PO ke PT Eka Jaya, golongan Phase Out / Clearance, dan penyelesaian ordernya di OCS.</div>
      </div>
      <Suspense fallback={null}>
        <MonitoringWorkspace me={{ id: u.id, role: u.role }} reasons={s.reasons} agingWarnDays={s.agingWarnDays} />
      </Suspense>
    </div>
  );
}
