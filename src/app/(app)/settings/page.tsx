import { requireRole } from '@/lib/auth';
import { isAdmin } from '@/lib/roles';
import { getSettings } from '@/lib/settings';
import { SettingsForm } from '@/components/settings/settings-form';
import { ocsConfigured } from '@/lib/ocs-client';
import { doiConfigured } from '@/lib/doi-client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requireRole(isAdmin);
  const s = await getSettings();
  const env = {
    ocsUser: process.env.OCS_USERNAME || '',
    ocsDb: process.env.OCS_COMPANY_DB || 'EJI_WMS',
    ocsUrl: process.env.OCS_BASE_URL || 'https://ocs.iegsystem.id',
    doiUser: process.env.DOI_MONITOR_USERNAME || '',
    doiUrl: process.env.DOI_MONITOR_URL || 'https://doi-monitor.vercel.app',
    ocsOk: ocsConfigured(),
    doiOk: doiConfigured(),
    cron: Boolean(process.env.CRON_SECRET),
  };
  return (
    <div className="flex flex-col gap-4 max-w-[980px]">
      <h1 className="page-title">Pengaturan</h1>
      <SettingsForm initial={s} env={env} />
    </div>
  );
}
