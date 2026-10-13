import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/shell/app-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await getSettings();
  // Badge: baris pending yang ordernya masih OPEN dan belum ditindaklanjuti Inventory.
  const needFollowUp = await prisma.pendingItem.count({ where: { followUpAt: null, order: { resolution: 'OPEN' } } });
  return (
    <AppShell user={{ id: user.id, name: user.name, username: user.username, role: user.role }} appName={settings.appName} needFollowUp={needFollowUp}>
      {children}
    </AppShell>
  );
}
