import { requireUser } from '@/lib/auth';
import { PasswordForm } from '@/components/settings/password-form';
import { Avatar, Chip } from '@/components/ui/primitives';
import { ROLE_LABEL } from '@/lib/items';

export const dynamic = 'force-dynamic';

export default async function AkunPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const u = await requireUser();
  const { first } = await searchParams;
  return (
    <div className="flex flex-col gap-4 max-w-[560px]">
      <h1 className="page-title">Akun saya</h1>
      {(first || u.mustChangePassword) && <div className="alert alert-critical">Untuk keamanan, ganti password awal Anda sebelum melanjutkan.</div>}
      <div className="card flex items-center gap-3">
        <Avatar name={u.name} size={44} />
        <div className="min-w-0">
          <div className="font-semibold">{u.name}</div>
          <div className="text-sm text-label truncate">@{u.username}</div>
          <div className="flex gap-2 mt-1 flex-wrap"><Chip tone="brand">{ROLE_LABEL[u.role]}</Chip></div>
        </div>
      </div>
      <PasswordForm mustChange={u.mustChangePassword} />
    </div>
  );
}
