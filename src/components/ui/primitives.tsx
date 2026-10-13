'use client';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export type Tone = 'positive' | 'critical' | 'negative' | 'informative' | 'neutral' | 'brand';

export function Chip({ tone = 'neutral', children, className, icon, title }: { tone?: Tone; children: React.ReactNode; className?: string; icon?: React.ReactNode; title?: string }) {
  return (
    <span className={cn('chip', `chip-${tone}`, className)} title={title}>
      {icon}
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin', className)} aria-hidden />;
}

export function Field({ label, htmlFor, hint, error, children, required }: { label: string; htmlFor?: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>
        {label} {required && <span className="text-negative" aria-hidden>*</span>}
      </label>
      {children}
      {error ? <div className="error-text">{error}</div> : hint ? <div className="help">{hint}</div> : null}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="text-base font-semibold">{title}</div>
      {hint && <div className="text-sm text-label mt-1">{hint}</div>}
      {action && <div className="mt-4 inline-flex">{action}</div>}
    </div>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('');
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden>
      {ini}
    </span>
  );
}
