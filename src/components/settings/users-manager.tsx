'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, Save } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/modal';
import { Field, Spinner, Chip } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api-client';
import { fmtDateTime } from '@/lib/utils';
import { ROLE_LABEL } from '@/lib/items';

type Role = keyof typeof ROLE_LABEL;
type U = { id: string; username: string; name: string; role: Role; isLead: boolean; active: boolean; mustChangePassword: boolean; lastLoginAt: string | null; createdAt: string };
const ROLES = Object.keys(ROLE_LABEL) as Role[];

export function UsersManager({ meId }: { meId: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<U[] | null>(null);
  const [edit, setEdit] = useState<U | 'new' | null>(null);
  const [f, setF] = useState({ username: '', name: '', role: 'FULFILLMENT' as Role, password: '', active: true, isLead: false });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setRows((await api<{ rows: U[] }>('/api/users')).rows); }, []);
  useEffect(() => { void load(); }, [load]);

  function open(u: U | 'new') {
    setEdit(u);
    setF(u === 'new' ? { username: '', name: '', role: 'FULFILLMENT', password: '', active: true, isLead: false } : { username: u.username, name: u.name, role: u.role, password: '', active: u.active, isLead: u.isLead });
  }

  async function save() {
    setBusy(true);
    try {
      if (edit === 'new') {
        await api('/api/users', { method: 'POST', json: f });
        toast('Pengguna dibuat — wajib ganti password saat login pertama', 'positive');
      } else if (edit) {
        await api(`/api/users/${edit.id}`, { method: 'PATCH', json: { username: f.username, name: f.name, role: f.role, active: f.active, isLead: f.isLead, ...(f.password ? { password: f.password } : {}) } });
        toast('Pengguna diperbarui', 'positive');
      }
      setEdit(null);
      void load();
    } catch (e) { toast((e as Error).message, 'negative'); } finally { setBusy(false); }
  }

  const columns = useMemo<ColumnDef<U>[]>(() => [
    { key: 'name', label: 'Nama', width: 180, title: true, value: (r) => r.name },
    { key: 'username', label: 'Username', width: 140, mono: true, value: (r) => r.username },
    { key: 'role', label: 'Peran', width: 120, value: (r) => ROLE_LABEL[r.role], render: (r) => <Chip tone={r.role === 'ADMIN' ? 'brand' : r.role === 'INVENTORY' ? 'informative' : r.role === 'FULFILLMENT' ? 'positive' : 'neutral'}>{ROLE_LABEL[r.role]}</Chip> },
    { key: 'lead', label: 'Lead', width: 80, value: (r) => (r.isLead ? 'Lead' : ''), render: (r) => (r.isLead ? <Chip tone="brand">Lead</Chip> : <span className="muted">—</span>) },
    { key: 'active', label: 'Status', width: 100, value: (r) => (r.active ? 'Aktif' : 'Nonaktif'), render: (r) => (r.active ? <Chip tone="positive">Aktif</Chip> : <Chip tone="neutral">Nonaktif</Chip>) },
    { key: 'last', label: 'Login terakhir', width: 150, type: 'date', priority: 2, value: (r) => r.lastLoginAt, render: (r) => fmtDateTime(r.lastLoginAt) },
  ], []);

  return (
    <>
      {rows === null ? <div className="py-10 grid place-items-center"><Spinner /></div> : (
        <DataTable id="users" columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={open} compactToolbar
          toolbarExtra={<button type="button" className="btn btn-primary btn-sm" onClick={() => open('new')}><UserPlus /> Tambah</button>} />
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit === 'new' ? 'Tambah pengguna' : 'Ubah pengguna'}
        footer={<button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? <Spinner /> : <Save />} Simpan</button>}>
        <div className="flex flex-col gap-3">
          <Field label="Nama" htmlFor="u-name" required><input id="u-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Username" htmlFor="u-user" required hint="Huruf kecil/angka, dipakai untuk login"><input id="u-user" className="input mono" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} /></Field>
          <Field label="Peran" htmlFor="u-role">
            <select id="u-role" className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })} disabled={edit !== 'new' && edit?.id === meId}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </Field>
          <Field label={edit === 'new' ? 'Password awal' : 'Reset password'} htmlFor="u-pw" required={edit === 'new'} hint="Min. 8 karakter huruf + angka. Pengguna wajib menggantinya saat login.">
            <input id="u-pw" className="input" type="text" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder={edit === 'new' ? '' : 'kosongkan bila tidak diubah'} />
          </Field>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.isLead} onChange={(e) => setF({ ...f, isLead: e.target.checked })} /> <span><b>Lead</b> — boleh mereview kesalahan di Monitoring Cancel (menandai benar kesalahan gudang / bukan, dan mengubah tim)</span></label>
          {edit !== 'new' && edit?.id !== meId && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Aktif</label>
          )}
        </div>
      </Modal>
    </>
  );
}
