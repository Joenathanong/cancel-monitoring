'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/** Dialog di ≥768px, bottom sheet di <768px. Pakai <dialog> → ESC & jebak fokus bawaan. */
export function Modal({ open, onClose, title, children, footer, wide, size }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean; size?: 'xl' }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const main = document.getElementById('main');
    if (main) main.style.overflowY = open ? 'hidden' : 'auto';
    return () => { if (main) main.style.overflowY = 'auto'; };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dlg"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <div className={size === 'xl' ? 'dlg-panel dlg-xl' : 'dlg-panel'} style={wide ? { maxWidth: 820 } : undefined}>
        <div className="dlg-handle" />
        <div className="dlg-head">
          <span className={size === 'xl' ? 'flex-1 min-w-0' : 'flex-1 min-w-0 truncate'}>{title}</span>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Tutup">
            <X />
          </button>
        </div>
        <div className="dlg-body">{children}</div>
        {footer && <div className="dlg-foot">{footer}</div>}
      </div>
    </dialog>
  );
}
