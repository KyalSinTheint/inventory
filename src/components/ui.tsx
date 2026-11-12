import { X, Search, Inbox, Loader2 } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-navy-800 text-white hover:bg-navy-700 shadow-sm',
  secondary: 'bg-white text-navy-800 border border-silver-300 hover:bg-silver-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
  ghost: 'text-navy-700 hover:bg-navy-50',
};

export function Button({ variant = 'primary', size = 'md', busy, className, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        VARIANTS[variant], className,
      )}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx('rounded-xl border border-silver-200 bg-white shadow-xs', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-silver-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-navy-900">{title}</h2>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-navy-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export type Tone = 'navy' | 'green' | 'amber' | 'red' | 'grey' | 'blue' | 'purple';
const TONES: Record<Tone, string> = {
  navy: 'bg-navy-100 text-navy-800', green: 'bg-emerald-50 text-emerald-700 ring-emerald-200', amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200', grey: 'bg-silver-100 text-slate-600', blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200',
};
export function Badge({ tone = 'grey', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent', TONES[tone])}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  Held: 'blue', 'Refund Request': 'amber', Refunded: 'green', 'Forfeiture Request': 'amber', Forfeited: 'red', 'Reversal Request': 'purple',
  Pending: 'amber', Approved: 'green', Rejected: 'red', Available: 'green', 'Checked Out': 'blue', Maintenance: 'amber', Damaged: 'red',
  Lost: 'red', Retired: 'grey', Active: 'green', Planned: 'blue', Completed: 'grey',
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'grey'}>{status}</Badge>;
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <header className="flex items-center justify-between border-b border-silver-200 px-5 py-3.5">
          <h2 className="font-semibold text-navy-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-silver-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-silver-200 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, hint, required, children, className }: { label: string; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}{required && <span className="text-red-600"> *</span>}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>;
}

export function Empty({ children = 'Nothing here yet.' }: { children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-slate-500">
      <Inbox className="h-8 w-8 text-silver-300" />
      {children}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-silver-500" />
      <input className="input pl-8" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

export function StatCard({ label, value, sub, icon, tone = 'navy', onClick }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'navy' | 'red' | 'green' | 'amber'; onClick?: () => void }) {
  const ring = { navy: 'bg-navy-100 text-navy-800', red: 'bg-red-50 text-red-600', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700' }[tone];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={cx('flex w-full items-start gap-3 rounded-xl border bg-white p-4 text-left shadow-xs', tone === 'red' ? 'border-red-200' : 'border-silver-200', onClick && 'transition hover:border-navy-600')}>
      {icon && <div className={cx('rounded-lg p-2', ring)}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        <div className={cx('mt-1 truncate text-xl font-semibold tabular-nums', tone === 'red' ? 'text-red-600' : 'text-navy-900')}>{value}</div>
        {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
      </div>
    </Tag>
  );
}

/** Semicircle gauge for budget utilisation. */
export function Gauge({ value, label, sub }: { value: number; label: string; sub?: ReactNode }) {
  const v = Math.max(0, Math.min(value, 120));
  const angle = (Math.min(v, 100) / 100) * 180;
  const r = 52;
  const rad = ((180 - angle) * Math.PI) / 180;
  const x = 64 + r * Math.cos(rad);
  const y = 64 - r * Math.sin(rad);
  const color = value > 100 ? '#dc2626' : value > 85 ? '#d97706' : '#1b3f73';
  return (
    <div className="flex flex-col items-center text-center">
      <svg viewBox="0 0 128 74" className="w-full max-w-36" role="img" aria-label={`${label}: ${value.toFixed(0)}% used`}>
        <path d="M12 64 A52 52 0 0 1 116 64" fill="none" stroke="#e3e7ee" strokeWidth="12" strokeLinecap="round" />
        {angle > 0 && <path d={`M12 64 A52 52 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />}
        <text x="64" y="60" textAnchor="middle" fontSize="18" fontWeight="600" fill={color}>{value.toFixed(0)}%</text>
      </svg>
      <div className="mt-1 text-sm font-medium text-navy-900">{label}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: ReactNode }[] }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-silver-200" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', value === t.id ? 'border-navy-800 text-navy-900' : 'border-transparent text-slate-500 hover:text-navy-800')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------- toasts
const ToastCtx = createContext<(msg: string, tone?: 'ok' | 'error') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; tone: 'ok' | 'error' }[]>([]);
  const push = useCallback((msg: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('rounded-lg px-4 py-2.5 text-sm shadow-lg', t.tone === 'ok' ? 'bg-navy-900 text-white' : 'bg-red-600 text-white')}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Runs an async action, tracking busy state and an error message for the form. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
