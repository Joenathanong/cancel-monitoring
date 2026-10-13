// Tampil seketika saat pindah menu, selama data halaman dimuat di server.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Memuat">
      <div className="skel h-8 w-64" />
      <div className="skel h-4 w-full max-w-[640px]" />
      <div className="kpi-grid">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card kpi-tile"><div className="skel h-3 w-24" /><div className="skel h-7 w-16 mt-2" /></div>)}
      </div>
      <div className="card"><div className="skel h-[160px] w-full" /></div>
      <div className="card"><div className="skel h-[220px] w-full" /></div>
    </div>
  );
}
