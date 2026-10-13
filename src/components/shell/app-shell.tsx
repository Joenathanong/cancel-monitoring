'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, ClipboardPlus, ListChecks, Boxes, Settings, Users, Menu, PanelLeftClose, PanelLeftOpen,
  LogOut, UserCircle, ChevronDown, Ban,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Avatar } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { ROLE_LABEL } from '@/lib/items';
import type { RoleName } from '@/lib/session';

export type ShellUser = { id: string; name: string; username: string; role: RoleName };

type NavItem = { href: string; label: string; icon: React.ReactNode; badge?: number; show?: boolean };

export function AppShell({ user, appName, needFollowUp, children }: { user: ShellUser; appName: string; needFollowUp: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [mode, setMode] = useState<'expanded' | 'rail'>('expanded');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isXl, setIsXl] = useState(false);
  const sideRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  // Mode sidebar (design-ocs §8): <768 drawer, 768–1279 rail, ≥1280 expanded (atau pilihan user)
  useEffect(() => {
    const mqXl = matchMedia('(min-width:1280px)');
    const apply = () => {
      setIsXl(mqXl.matches);
      if (mqXl.matches) {
        let saved: string | null = null;
        try { saved = localStorage.getItem('ieg-side'); } catch { /* abaikan */ }
        setMode(saved === 'rail' ? 'rail' : 'expanded');
      } else {
        setMode('rail');
      }
    };
    apply();
    mqXl.addEventListener('change', apply);
    return () => mqXl.removeEventListener('change', apply);
  }, []);

  const closeDrawer = useCallback(() => setDrawer(false), []);

  // Kewajiban drawer (design-ocs §8.4): kunci gulir, inert, fokus masuk & kembali
  useEffect(() => {
    const main = mainRef.current;
    if (main) {
      main.style.overflowY = drawer ? 'hidden' : 'auto';
      if (drawer) main.setAttribute('inert', ''); else main.removeAttribute('inert');
    }
    if (drawer) {
      lastFocus.current = document.activeElement as HTMLElement;
      sideRef.current?.querySelector<HTMLElement>('a,button')?.focus();
    } else {
      lastFocus.current?.focus?.();
      lastFocus.current = null;
    }
  }, [drawer]);

  useEffect(() => {
    const mqDesk = matchMedia('(min-width:768px)');
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setDrawer(false); };
    mqDesk.addEventListener('change', onChange);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDrawer(false); setMenuOpen(false); } };
    document.addEventListener('keydown', onKey);
    return () => { mqDesk.removeEventListener('change', onChange); document.removeEventListener('keydown', onKey); };
  }, []);

  useEffect(() => { setDrawer(false); setMenuOpen(false); }, [pathname]);

  function toggleCollapse() {
    const next = mode === 'rail' ? 'expanded' : 'rail';
    setMode(next);
    try { localStorage.setItem('ieg-side', next); } catch { /* abaikan */ }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const canIn = user.role !== 'VIEWER';
  const nav: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard KPI', icon: <LayoutDashboard /> },
    { href: '/input', label: 'Input Pending', icon: <ClipboardPlus />, show: canIn },
    { href: '/monitoring', label: 'Monitoring', icon: <ListChecks />, badge: needFollowUp || undefined },
    { href: '/rekap-sku', label: 'Rekap per SKU', icon: <Boxes /> },
    { href: '/cancel', label: 'Monitoring Cancel', icon: <Ban /> },
  ];
  const navAdmin: NavItem[] = [
    { href: '/settings', label: 'Pengaturan', icon: <Settings /> },
    { href: '/users', label: 'Pengguna', icon: <Users /> },
  ];

  const title = [...nav, ...navAdmin, { href: '/akun', label: 'Akun saya', icon: null }].find((n) => pathname.startsWith(n.href))?.label ?? appName;

  const renderItem = (n: NavItem) => {
    if (n.show === false) return null;
    const active = pathname === n.href || pathname.startsWith(n.href + '/');
    return (
      <Link key={n.href} href={n.href} className={cn('nav-item', active && 'is-active')} aria-current={active ? 'page' : undefined} title={n.badge ? `${n.label} — ${n.badge} belum ditindaklanjuti` : n.label}>
        <span className="nav-mark" />
        {n.icon}
        <span className="lbl">{n.label}</span>
        {n.badge ? <span className="nav-badge">{n.badge > 999 ? '999+' : n.badge}</span> : null}
      </Link>
    );
  };

  return (
    <div className="app-shell" id="shell" data-drawer={drawer ? 'open' : 'closed'}>
      <nav className="app-side" id="side" ref={sideRef} data-mode={mode} aria-label="Menu utama" role={drawer ? 'dialog' : undefined} aria-modal={drawer ? true : undefined}>
        <div className="side-head">
          <span className="brand-logo">PK</span>
          <span className="brand-name">{appName}</span>
        </div>
        <div className="side-nav">
          <div className="nav-group">Menu</div>
          {nav.map(renderItem)}
          {user.role === 'ADMIN' && (
            <>
              <div className="nav-group">Admin</div>
              <div className="nav-sep" />
              {navAdmin.map(renderItem)}
            </>
          )}
          <div className="nav-group">Akun</div>
          <div className="nav-sep" />
          <Link href="/akun" className={cn('nav-item', pathname.startsWith('/akun') && 'is-active')} title="Akun saya">
            <span className="nav-mark" />
            <UserCircle />
            <span className="lbl">Akun saya</span>
          </Link>
          <button type="button" className="nav-item w-full bg-transparent border-0 cursor-pointer" onClick={logout} title="Keluar">
            <span className="nav-mark" />
            <LogOut />
            <span className="lbl">Keluar</span>
          </button>
        </div>
        <div className="side-foot">
          <span className="copy text-[11px] muted flex-1 min-w-0 truncate">© 2026 IEG · v1.0</span>
          <button type="button" className="collapse-btn btn btn-ghost btn-icon btn-sm" onClick={toggleCollapse} disabled={!isXl} aria-label={mode === 'rail' ? 'Lebarkan menu' : 'Ciutkan menu'} title={mode === 'rail' ? 'Lebarkan menu' : 'Ciutkan menu'}>
            {mode === 'rail' ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
        </div>
      </nav>
      <div className="backdrop" id="backdrop" onClick={closeDrawer} hidden={!drawer} />
      <header className="app-top">
        <button id="burger" type="button" className="burger" aria-expanded={drawer} aria-controls="side" aria-label="Buka menu" onClick={() => setDrawer((d) => !d)}>
          <Menu />
        </button>
        <span className="font-semibold text-[15px] truncate flex-1 min-w-0">{title}</span>
        <ThemeToggle compact />
        <div className="relative">
          <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Menu akun">
            <Avatar name={user.name} size={28} />
            <span className="hidden md:inline max-w-[160px] truncate text-ink">{user.name}</span>
            <ChevronDown className="hidden md:block" />
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              <div className="px-3 py-2 text-xs text-label border-b border-subtle mb-1">
                <div className="font-semibold text-ink text-sm truncate">{user.name}</div>
                <div className="truncate">@{user.username} · {ROLE_LABEL[user.role]}</div>
              </div>
              <Link href="/akun" role="menuitem"><UserCircle /> Akun saya</Link>
              <button type="button" role="menuitem" onClick={logout}><LogOut /> Keluar</button>
            </div>
          )}
        </div>
      </header>
      <main className="app-main" id="main" ref={mainRef}>
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
