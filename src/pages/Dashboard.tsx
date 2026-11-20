import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useData } from '../lib/store';
import { approvalCounts, lowStockItems, retentionAlerts } from '../lib/alerts';
import { actsAsHod, depositTotals, fmtQty, utilizationPct, yearActual } from '../lib/logic';
import { date, mmk, num, today } from '../lib/format';
import { ROLE_LABELS } from '../lib/types';
import { PageHeader, cx } from '../components/ui';
import { CaseArt, LayersArt, OrbArt, PanesArt, WaveOrbArt, WindowArt } from '../components/Illustrations';
import { categoriesOf } from '../lib/choices';

export default function Dashboard() {
  const { data, user, settings, can } = useData();
  const loc = useLocation();
  const alertsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if ((loc.state as { focus?: string } | null)?.focus === 'alerts') alertsRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [loc.state]);

  const low = useMemo(() => lowStockItems(data), [data]);
  const expiring = useMemo(() => retentionAlerts(data, settings, today()), [data, settings]);
  const dep = useMemo(() => depositTotals(data.deposits), [data.deposits]);
  const valuation = data.items.filter((i) => i.active).reduce((s, i) => s + i.qty_on_hand * i.unit_cost, 0);
  const assetsLive = data.assets.filter((a) => a.status !== 'Retired' && a.status !== 'Lost').length;
  const assetsOut = data.assets.filter((a) => a.status === 'Checked Out').length;
  const counts = approvalCounts(data, user);
  const pendingAll = data.deposits.filter((d) => ['Refund Request', 'Forfeiture Request', 'Reversal Request'].includes(d.status)).length
    + data.material_requests.filter((r) => r.status === 'Pending').length + data.stock_txns.filter((t) => t.status === 'Pending').length;
  const year = new Date().getFullYear();
  const budget = data.budgets.find((b) => b.fiscal_year === year && (b.category ?? 'Overall') === 'Overall')?.amount ?? 0;
  const spent = yearActual(year, data.stock_txns, data.expenses).total;
  const isApprover = actsAsHod(user.role) || user.role === 'finance';
  const batchName = (id: string) => data.batches.find((b) => b.id === id)?.name ?? '';

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${ROLE_LABELS[user.role]} · ${date(today())}`} />

      {/* Hero */}
      <div className="mb-8 flex flex-col justify-between gap-6 pt-2 lg:flex-row lg:items-end">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-kbz-red">L&amp;D Portal</div>
          <h1 className="mt-2 text-4xl font-semibold leading-[1.05] tracking-tight text-kbz-dark sm:text-5xl">
            Training &amp; Deposits
          </h1>
        </div>
        <div className="max-w-sm text-sm leading-relaxed text-neutral-500">
          <p>Welcome, {user.name}. Choose a module below to register deposits, move stock, sign off requests or check budgets.</p>
          {(can('deposit.create') || can('stock.create') || can('request.create')) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {can('deposit.create') && <QuickLink to="/deposits?new=1">Register deposit</QuickLink>}
              {can('stock.create') && <QuickLink to="/inventory?stockin=1">Stock in</QuickLink>}
              {can('request.create') && <QuickLink to="/requests?new=1">Material request</QuickLink>}
            </div>
          )}
        </div>
      </div>

      {/* Six module cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ModuleCard no="01" to="/deposits" title={<>License<br />deposits</>} tone="navy"
          text="Register, refund and forfeit license class deposits."
          stat={`${mmk(dep.held)} held · ${dep.heldCount} trainees`}
          flag={expiring.length ? { text: `${expiring.length} near term end`, tone: 'amber' } : undefined}
          art={<PanesArt />} />
        <ModuleCard no="02" to="/inventory" title={<>Inventory<br />stock control</>} tone="logo"
          text="Refreshments, training materials, YCP and office supplies."
          stat={`${mmk(valuation)} in stock`}
          flag={low.length ? { text: `${low.length} low stock`, tone: 'red' } : undefined}
          art={<OrbArt />} />
        <ModuleCard no="03" to="/assets" title={<>Reusable<br />assets</>} tone="sky"
          text="Check-in, check-out, maintenance and condition log."
          stat={`${assetsOut} of ${assetsLive} checked out`}
          art={<CaseArt />} />
        <ModuleCard no="04" to={isApprover ? '/approvals' : '/requests'} title={<>Approvals &amp;<br />requests</>} tone="teal"
          text="Refunds, forfeitures, material requests and stock sign-off."
          stat={isApprover ? `${counts.total} waiting for you` : `${pendingAll} pending in total`}
          flag={isApprover && counts.total ? { text: 'Action needed', tone: 'amber' } : undefined}
          art={<WindowArt />} />
        <ModuleCard no="05" to="/budget" title={<>Budget &amp;<br />reports</>} tone="dark"
          text="Monthly spend, category budgets and Excel export."
          stat={budget ? `${utilizationPct(budget, spent).toFixed(0)}% of FY${year} budget used` : `${mmk(spent)} spent in FY${year}`}
          art={<LayersArt />} />
        {can('export') ? (
          <ModuleCard no="06" to="/audit" title={<>Audit trail<br />&amp; security</>} tone="graphite"
            text="Every change recorded with user, time and IP address."
            stat={`${num(data.audit_logs.length)} log ${data.audit_logs.length === 1 ? 'entry' : 'entries'}`}
            art={<WaveOrbArt />} />
        ) : (
          <ModuleCard no="06" to="/batches" title={<>Training<br />batches</>} tone="graphite"
            text="Corporate, Agency, YCP, License and Product & Soft Skills classes."
            stat={`${data.batches.filter((b) => !b.archived && b.status !== 'Completed').length} active or planned`}
            art={<WaveOrbArt />} />
        )}
      </div>

      {/* Needs attention: kept small and quiet */}
      <div ref={alertsRef} className="mt-10 grid gap-4 lg:grid-cols-2">
        <Attention title="Deposits near the service term" empty={`No held deposits are near the ${settings.service_term_months}-month term.`} more={expiring.length > 5 ? '/deposits?status=open' : undefined}>
          {expiring.slice(0, 5).map(({ d, r }) => (
            <Row key={d.id} to={`/deposits/${d.id}`} title={d.trainee_name} sub={`${batchName(d.batch_id)} · ${mmk(d.amount)}`}
              right={r.level === 'expired' ? `Ended ${date(r.dueDate)}` : `${r.daysLeft} days left`} tone={r.level === 'expired' ? 'red' : 'amber'} />
          ))}
        </Attention>
        <Attention title="Low stock" empty="All items are above their minimum level." more={low.length > 5 ? '/inventory?low=1' : undefined}>
          {low.slice(0, 5).map((i) => (
            <Row key={i.id} to={`/inventory?cat=${encodeURIComponent(i.category)}`} title={i.name} sub={i.category}
              right={`${fmtQty(i, i.qty_on_hand)} / min ${num(i.min_level)}`} tone="red" />
          ))}
        </Attention>
      </div>

      {/* Inventory categories as quiet chips */}
      <nav aria-label="Inventory categories" className="mt-6 flex flex-wrap gap-2">
        {categoriesOf(data).map((c) => {
          const items = data.items.filter((i) => i.active && i.category === c);
          const lowN = items.filter((i) => i.qty_on_hand <= i.min_level).length;
          return (
            <Link key={c} to={`/inventory?cat=${encodeURIComponent(c)}`}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-xs text-neutral-700 transition hover:border-neutral-400">
              <span className="font-medium">{c}</span>
              <span className="text-neutral-400">{items.length} items</span>
              {lowN > 0 && <span className="rounded-full bg-rose-50 px-1.5 text-[10px] font-semibold text-kbz-red">{lowN} low</span>}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function QuickLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 rounded-full bg-kbz-navy px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-kbz-blue">
      + {children}
    </Link>
  );
}

/** Deep KBZ brand colours (navy, logo blues, red, graphite) with white text. */
const TONE = {
  navy: 'from-[#002d72] to-[#0047ab]',
  logo: 'from-[#0c4f7a] to-[#12669e]',
  sky: 'from-[#0a6a9e] to-[#1590cc]',
  teal: 'from-[#0a5459] to-[#0f7c80]',
  dark: 'from-[#071a33] to-[#13315c]',
  graphite: 'from-[#3a3f46] to-[#5f656d]',
} as const;

function ModuleCard({ no, to, title, text, stat, flag, art, tone }: {
  no: string; to: string; title: ReactNode; text: string; stat: string; flag?: { text: string; tone: 'red' | 'amber' }; art: ReactNode; tone: keyof typeof TONE;
}) {
  return (
    <Link to={to}
      className={cx('group relative flex min-h-[15rem] flex-col overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white shadow-[0_14px_34px_-18px_rgba(0,45,114,0.6)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-18px_rgba(0,45,114,0.7)]', TONE[tone])}>
      {/* small picture tucked in the top-right corner; the words carry the card */}
      <div className="pointer-events-none absolute right-4 top-4 h-20 w-24 opacity-90 transition duration-500 group-hover:scale-[1.06]" aria-hidden>{art}</div>
      <div className="relative z-10 flex flex-1 flex-col">
        <div className="text-sm font-semibold text-white/60">{no}</div>
        <h2 className="mt-2 max-w-[calc(100%-6.5rem)] text-[1.75rem] font-semibold leading-[1.12] tracking-tight">{title}</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-white/85">{text}</p>
        <p className="mt-2 text-base font-semibold tabular-nums text-white">{stat}</p>
        {flag && (
          <span className={cx('mt-2 inline-flex w-fit rounded-full bg-white px-2.5 py-0.5 text-xs font-bold', flag.tone === 'red' ? 'text-kbz-red' : 'text-amber-700')}>{flag.text}</span>
        )}
        <span className="mt-auto pt-5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-kbz-dark transition group-hover:bg-[#20a0d8] group-hover:text-white">
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </span>
      </div>
    </Link>
  );
}

function Attention({ title, empty, more, children }: { title: string; empty: string; more?: string; children: ReactNode[] }) {
  return (
    <section className="rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {more && <Link to={more} className="text-xs font-medium text-neutral-500 hover:text-neutral-900">View all →</Link>}
      </div>
      {children.length ? <ul className="divide-y divide-neutral-100">{children}</ul> : <p className="py-4 text-sm text-neutral-400">{empty}</p>}
    </section>
  );
}

function Row({ to, title, sub, right, tone }: { to: string; title: string; sub: string; right: string; tone: 'red' | 'amber' }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 py-2.5 hover:opacity-80">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-neutral-900">{title}</div>
          <div className="truncate text-xs text-neutral-400">{sub}</div>
        </div>
        <span className={cx('shrink-0 text-xs font-semibold tabular-nums', tone === 'red' ? 'text-kbz-red' : 'text-amber-700')}>{right}</span>
      </Link>
    </li>
  );
}
