import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="h-[100dvh] grid place-items-center p-4">
      <div className="card text-center max-w-[360px]">
        <div className="text-5xl font-bold mb-2" style={{ background: 'var(--grad-brand)', WebkitBackgroundClip: 'text', color: 'transparent' }}>404</div>
        <div className="font-semibold mb-1">Halaman tidak ditemukan</div>
        <p className="text-sm text-label mb-4">Tautan mungkin salah atau data sudah dihapus.</p>
        <Link href="/dashboard" className="btn btn-primary">Ke Dashboard</Link>
      </div>
    </div>
  );
}
