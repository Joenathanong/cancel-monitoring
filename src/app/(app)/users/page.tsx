import { requireRole } from '@/lib/auth';
import { isAdmin } from '@/lib/roles';
import { UsersManager } from '@/components/settings/users-manager';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const u = await requireRole(isAdmin);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">Pengguna</h1>
        <div className="text-sm text-label mt-1">Fulfillment menginput pending · Inventory mengisi tindak lanjut · Admin mengatur semuanya · Lihat saja hanya membaca.</div>
      </div>
      <UsersManager meId={u.id} />
    </div>
  );
}
