import { useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Boxes, CheckCircle2, CheckSquare, FileBarChart, Lock, Monitor, PackageX, Wallet } from 'lucide-react';
import { useData } from '../lib/store';
import { approvalCounts, lowStockItems, retentionAlerts } from '../lib/alerts';
import { batchActual, depositTotals, isLowStock, utilizationPct, yearActual } from '../lib/logic';
import { date, mmk, num, today } from '../lib/format';
import { Badge, Button, Card, Empty, Gauge, PageHeader, StatusBadge } from '../components/ui';
import { CATEGORIES, ROLE_LABELS, type Role } from '../lib/types';
import { cx } from '../components/ui';
import { Coffee, GraduationCap, Package, Paperclip as Clip } from 'lucide-react';
import type { ReactNode } from 'react';

export default function Dashboard() {
  const { data, user, settings, can, db } = useData();
  const nav = useNavigate();
  const loc = useLocation();
  const alertsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if ((loc.state as { focus?: string } | null)?.focus === 'alerts') alertsRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [loc.state]);

  const activeItems = data.items.filter((i) => i.active);
  const low = useMemo(() => lowStockItems(data), [data]);
  const valuation = activeItems.reduce((s, i) => s + i.qty_on_hand * i.unit_cost, 0);
  const dep = useMemo(() => depositTotals(data.deposits), [data.deposits]);
  const expiring = useMemo(() => retentionAlerts(data, settings, today()), [data, settings]);
  const counts = approvalCounts(data, user);
  const year = new Date().getFullYear();
  const budget = data.budgets.find((b) => b.fiscal_year === year && (b.category ?? 'Overall') === 'Overall')?.amount ?? 0;
  const spent = yearActual(year, data.stock_txns, data.expenses).total;
  const activeBatches = data.batches.filter((b) => b.status !== 'Planned' && b.budget > 0).slice(-4).reverse();
  const batchName = (id: string) => data.batches.find((b) => b.id === id)?.code ?? '';
  const assetsLive = data.assets.filter((a) => a.status !== 'Retired' && a.status !== 'Lost').length;
  const assetsOut = data.assets.filter((a) => a.status === 'Checked Out').length;
  const assetsAvail = data.assets.filter((a) => a.status === 'Available').length;
  const activeBatchCount = data.batches.filter((b) => b.status !== 'Completed').length;
  const pending = useMemo(() => {
    const refunds = data.deposits.filter((d) => d.status === 'Refund Request').length;
    const forfeits = data.deposits.filter((d) => d.status === 'Forfeiture Request' || d.status === 'Reversal Request').length;
    const stock = data.material_requests.filter((r) => r.status === 'Pending').length + data.stock_txns.filter((t) => t.status === 'Pending').length;
    return { refunds, forfeits, stock, total: refunds + forfeits + stock };
  }, [data]);
  const last = [...data.audit_logs].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const latestAudit = last ? `${last.action}: ${last.details}` : '—';

  return (
    <>
      <PageHeader title="Executive Dashboard" subtitle={`Welcome, ${user.name} · ${ROLE_LABELS[user.role]} · ${date(today())}`} />

      {/* Summary strip & quick actions */}
      <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-5 xl:flex-row xl:items-center">
        <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
          <Strip label="Held deposits" value={mmk(dep.held)} border="border-kbz-navy" color="text-kbz-dark" onClick={() => nav('/deposits?status=open')} />
          <Strip label="Stock valuation" value={mmk(valuation)} border="border-emerald-600" color="text-emerald-700" onClick={() => nav('/inventory')} />
          <Strip label="Pending approvals" value={`${pending.total} Items`} border="border-amber-500" color="text-amber-600" onClick={() => nav(user.role === 'hod' || user.role === 'finance' ? '/approvals' : '/requests')} />
          <Strip label="Low stock alerts" value={`${low.length} SKUs`} border="border-kbz-red" color="text-kbz-red" onClick={() => nav('/inventory?low=1')} />
        </div>
        {(can('deposit.create') || can('stock.create') || can('request.create')) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 xl:border-t-0 xl:pt-0">
            {can('deposit.create') && <Button size="sm" onClick={() => nav('/deposits?new=1')}>+ Register Deposit</Button>}
            {can('stock.create') && <Button size="sm" variant="success" onClick={() => nav('/inventory?stockin=1')}>+ Stock In</Button>}
            {can('request.create') && <Button size="sm" variant="secondary" onClick={() => nav('/requests?new=1')}>+ Material Request</Button>}
          </div>
        )}
      </div>

      {counts.total > 0 && (
        <Link to="/approvals" className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:border-amber-400">
          <CheckSquare className="h-5 w-5" />
          <span className="flex-1"><b>{counts.total}</b> item{counts.total > 1 ? 's' : ''} waiting for your approval</span>
          <span className="font-semibold">Review →</span>
        </Link>
      )}

      <CategoriesBar />

      {/* Modules directory */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">Portal Modules Directory</h2>
          <p className="mt-0.5 text-xs text-slate-500">{ROLE_BANNER[user.role]}</p>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 sm:inline-flex">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />{db.mode === 'demo' ? 'Demo data (this browser)' : 'Live synchronized data'}
        </span>
      </div>
      <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <ModuleCard to="/deposits" accent="navy" icon={<Wallet className="h-5 w-5" />} track="Track B • Financial Ledger" title="License Class Deposits"
          pill={`${data.deposits.length} Records`} footer="Manage Held, Refunds & Forfeitures">
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Held" value={num(dep.held)} sub={`${dep.heldCount} active`} tone="slate" />
            <Tile label="Refunded" value={num(dep.refunded)} sub={`${dep.refundedCount} passed`} tone="green" />
            <Tile label="Forfeited" value={num(dep.forfeited)} sub={`${dep.forfeitedCount} closed`} tone="red" />
          </div>
        </ModuleCard>
        <ModuleCard to="/inventory" accent="green" icon={<Boxes className="h-5 w-5" />} track="Track A • Consumables & Kits" title="Inventory Stock Control"
          pill={low.length ? `${low.length} Low Stock` : 'Stock OK'} pillTone={low.length ? 'red' : 'green'} footer="Refreshments, Materials & YCP Stock">
          <div className="grid grid-cols-2 gap-2.5">
            <Tile label="Total warehouse value" value={mmk(valuation)} tone="slate" />
            <Tile label="Active catalog SKUs" value={`${activeItems.length} Items`} tone="slate" />
          </div>
        </ModuleCard>
        <ModuleCard to="/assets" accent="blue" icon={<Monitor className="h-5 w-5" />} track="Track A • Fixed Equipment" title="Reusable Assets & Serials"
          pill={`${assetsOut} / ${assetsLive} Out`} footer="Check-In / Out & Condition Log">
          <div className="grid grid-cols-2 gap-2.5">
            <Tile label="Checked out to class" value={`${assetsOut} Units`} tone="amber" />
            <Tile label="Available in store" value={`${assetsAvail} Units`} tone="green" />
          </div>
        </ModuleCard>
        <ModuleCard to={user.role === 'hod' || user.role === 'finance' ? '/approvals' : '/requests'} accent="amber" icon={<CheckCircle2 className="h-5 w-5" />}
          track="Maker-Checker Governance" title="HOD Approval Queue" pill={`${pending.total} Pending`} pillTone="amber" footer="Sign-off Refunds, Forfeitures & Stock">
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Refunds" value={String(pending.refunds)} tone="slate" />
            <Tile label="Forfeitures" value={String(pending.forfeits)} tone="slate" valueTone="text-kbz-red" />
            <Tile label="Materials & stock" value={String(pending.stock)} tone="slate" />
          </div>
        </ModuleCard>
        <ModuleCard to="/budget" accent="violet" icon={<FileBarChart className="h-5 w-5" />} track={`FY ${year} Variance & Export`} title="Budget & Audit Reports"
          pill={budget ? `${utilizationPct(budget, spent).toFixed(0)}% Used` : 'No budget'} pillTone="violet" footer="Monthly preview, categories & Excel export">
          <div className="flex justify-between text-xs text-slate-600">
            <span>Spent: <b className="font-mono text-slate-900">{mmk(spent)}</b></span>
            <span>Cap: <b className="font-mono text-slate-900">{budget ? mmk(budget) : '—'}</b></span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className={cx('h-full rounded-full', utilizationPct(budget, spent) > 100 ? 'bg-kbz-red' : 'bg-violet-600')} style={{ width: `${Math.min(100, utilizationPct(budget, spent))}%` }} />
          </div>
        </ModuleCard>
        {can('export') ? (
          <ModuleCard to="/audit" accent="dark" icon={<Lock className="h-5 w-5" />} track="Compliance & Security" title="Immutable Audit Trail"
            pill={`${data.audit_logs.length} Logs`} footer="User, timestamp & IP logs">
            <div className="text-xs text-slate-500">Latest event:</div>
            <div className="mt-1.5 truncate rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">{latestAudit}</div>
          </ModuleCard>
        ) : (
          <ModuleCard to="/batches" accent="dark" icon={<GraduationCap className="h-5 w-5" />} track="Corporate • Agency • YCP • License" title="Training Batches"
            pill={`${activeBatchCount} Active`} footer="Batch budgets & branches">
            <div className="grid grid-cols-2 gap-2.5">
              <Tile label="Active / planned" value={`${activeBatchCount} Batches`} tone="slate" />
              <Tile label="Completed" value={`${data.batches.filter((b) => b.status === 'Completed').length} Batches`} tone="slate" />
            </div>
          </ModuleCard>
        )}
      </div>

      <div ref={alertsRef} className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />Deposit expiry alerts</span>}
          actions={<Badge tone={expiring.length ? 'amber' : 'green'}>{expiring.length}</Badge>} padded={false}>
          {expiring.length === 0 ? <Empty>No held deposits are near the {settings.service_term_months}-month service term.</Empty> : (
            <ul className="max-h-80 divide-y divide-silver-100 overflow-y-auto">
              {expiring.map(({ d, r }) => (
                <li key={d.id}>
                  <Link to={`/deposits/${d.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-navy-50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-navy-900">{d.trainee_name} <span className="font-normal text-slate-500">· {d.nrc}</span></div>
                      <div className="text-xs text-slate-500">{d.ref} · {batchName(d.batch_id)} · paid {date(d.payment_date)} · {mmk(d.amount)}</div>
                    </div>
                    <Badge tone={r.level === 'expired' ? 'red' : 'amber'}>{r.level === 'expired' ? `Term ended ${date(r.dueDate)}` : `${r.daysLeft} days left`}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-2"><PackageX className="h-4 w-4 text-kbz-red" />Low stock</span>}
          actions={<Badge tone={low.length ? 'red' : 'green'}>{low.length}</Badge>} padded={false}>
          {low.length === 0 ? <Empty>All items are above their minimum level.</Empty> : (
            <ul className="max-h-80 divide-y divide-silver-100 overflow-y-auto">
              {low.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-navy-900">{i.name}</div>
                    <div className="text-xs text-slate-500">{i.code} · {i.category}</div>
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    <span className="font-mono font-bold text-kbz-red">{num(i.qty_on_hand)}</span>
                    <span className="text-slate-500"> / min {num(i.min_level)} {i.unit}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Expense & budget utilisation" actions={<Link className="text-xs font-semibold text-kbz-navy hover:underline" to="/budget">Details →</Link>}>
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-5">
          <Gauge value={utilizationPct(budget, spent)} label={`Overall FY${year}`} sub={budget ? `${mmk(spent)} of ${mmk(budget)}` : 'No budget set'} />
          {activeBatches.map((b) => {
            const a = batchActual(b.id, data.stock_txns, data.expenses).total;
            return <Gauge key={b.id} value={utilizationPct(b.budget, a)} label={b.code} sub={`${mmk(a)} of ${mmk(b.budget)}`} />;
          })}
        </div>
      </Card>

      <div className="mt-6">
        <Card title="Recent deposit activity" padded={false}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Deposit</th><th>Trainee</th><th>Status</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {[...data.deposits].sort((a, b) => (b.requested_at ?? b.created_at).localeCompare(a.requested_at ?? a.created_at)).slice(0, 6).map((d) => (
                  <tr key={d.id} className="cursor-pointer" onClick={() => nav(`/deposits/${d.id}`)}>
                    <td className="font-medium text-navy-800">{d.ref}</td><td>{d.trainee_name}</td><td><StatusBadge status={d.status} /></td><td className="num">{mmk(d.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

const CAT_ICON: Record<string, React.ReactNode> = {
  Refreshments: <Coffee className="h-4 w-4" />, 'Training Materials': <Package className="h-4 w-4" />,
  'YCP Program': <GraduationCap className="h-4 w-4" />, 'Office Supplies': <Clip className="h-4 w-4" />,
};

/** One tile per inventory category: item count, stock value (bar = share of total value) and low-stock count. */
function CategoriesBar() {
  const { data } = useData();
  const nav = useNavigate();
  const rows = CATEGORIES.map((c) => {
    const items = data.items.filter((i) => i.active && i.category === c);
    return { c, count: items.length, value: items.reduce((s, i) => s + i.qty_on_hand * i.unit_cost, 0), low: items.filter(isLowStock).length };
  });
  const total = Math.max(1, rows.reduce((s, r) => s + r.value, 0));
  return (
    <nav aria-label="Inventory categories" className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-3 sm:grid sm:min-w-0 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => (
          <button key={r.c} onClick={() => nav(`/inventory?cat=${encodeURIComponent(r.c)}`)}
            className="w-56 rounded-2xl border-2 border-slate-200 bg-white p-3.5 text-left shadow-2xs transition hover:border-kbz-navy hover:shadow-md sm:w-auto">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-kbz-navy p-1.5 text-white">{CAT_ICON[r.c]}</span>
              <span className="flex-1 truncate text-sm font-semibold text-navy-900">{r.c}</span>
              {r.low > 0 && <span className="rounded-full bg-red-50 px-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200">{r.low} low</span>}
            </div>
            <div className="mt-2 flex items-baseline justify-between text-xs text-slate-500">
              <span>{num(r.count)} items</span><span className="font-mono font-bold text-kbz-dark">{mmk(r.value)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-silver-200" title={`${((r.value / total) * 100).toFixed(0)}% of stock value`}>
              <div className={cx('h-full rounded-full', r.low ? 'bg-kbz-red' : 'bg-kbz-navy')} style={{ width: `${(r.value / total) * 100}%` }} />
            </div>
          </button>
        ))}
      </div>
    </nav>
  );
}

const ROLE_BANNER: Record<Role, string> = {
  staff: 'L&D Staff: register deposits, record stock movements and submit refund, forfeiture and material requests for HOD approval.',
  hod: 'L&D HOD: approve or reject material requests, stock adjustments, deposit refunds and forfeitures; manage budgets.',
  finance: 'Finance / Auditor: read-only inspection of inventory valuation, deposit ledgers and the audit trail; confirm refund payments.',
  admin: 'System Administrator: users and roles, master data, rules and full operational oversight.',
};

function Strip({ label, value, border, color, onClick }: { label: string; value: string; border: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx('min-w-0 border-l-4 pl-3 text-left', border)}>
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={cx('mt-0.5 truncate font-mono text-base font-extrabold sm:text-lg', color)}>{value}</div>
    </button>
  );
}

const ACCENT = {
  navy: { icon: 'bg-kbz-navy', track: 'text-kbz-blue', hover: 'hover:border-kbz-navy', title: 'group-hover:text-kbz-blue', foot: 'text-kbz-navy', pill: 'bg-blue-50 text-kbz-navy' },
  green: { icon: 'bg-emerald-600', track: 'text-emerald-700', hover: 'hover:border-emerald-600', title: 'group-hover:text-emerald-700', foot: 'text-emerald-700', pill: 'bg-emerald-50 text-emerald-700' },
  blue: { icon: 'bg-sky-600', track: 'text-sky-700', hover: 'hover:border-sky-600', title: 'group-hover:text-sky-700', foot: 'text-sky-700', pill: 'bg-sky-50 text-sky-800' },
  amber: { icon: 'bg-amber-500', track: 'text-amber-700', hover: 'hover:border-amber-500', title: 'group-hover:text-amber-700', foot: 'text-amber-700', pill: 'bg-amber-100 text-amber-800' },
  violet: { icon: 'bg-violet-600', track: 'text-violet-700', hover: 'hover:border-violet-600', title: 'group-hover:text-violet-700', foot: 'text-violet-700', pill: 'bg-violet-50 text-violet-700' },
  dark: { icon: 'bg-slate-900', track: 'text-slate-600', hover: 'hover:border-slate-900', title: 'group-hover:text-slate-700', foot: 'text-slate-800', pill: 'bg-slate-100 text-slate-700' },
} as const;
const PILL = { red: 'bg-rose-100 text-kbz-red', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-100 text-amber-800', violet: 'bg-violet-50 text-violet-700' } as const;

function ModuleCard({ to, accent, icon, track, title, pill, pillTone, footer, children }: {
  to: string; accent: keyof typeof ACCENT; icon: ReactNode; track: string; title: string; pill: string; pillTone?: keyof typeof PILL; footer: string; children: ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <Link to={to} className={cx('group flex flex-col justify-between rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-2xs transition-all duration-200 hover:shadow-md', a.hover)}>
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-xs', a.icon)}>{icon}</div>
            <div className="min-w-0">
              <span className={cx('block truncate text-[10px] font-bold uppercase tracking-wider', a.track)}>{track}</span>
              <h3 className={cx('text-base font-bold text-kbz-dark transition-colors', a.title)}>{title}</h3>
            </div>
          </div>
          <span className={cx('shrink-0 rounded-lg px-2.5 py-1 font-mono text-xs font-bold', pillTone ? PILL[pillTone] : a.pill)}>{pill}</span>
        </div>
        <div className="mt-4 border-t border-slate-100 pt-3 text-xs">{children}</div>
      </div>
      <div className={cx('mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold', a.foot)}>
        <span className="truncate">{footer}</span>
        <span className="shrink-0 transition-transform group-hover:translate-x-1">Open Module →</span>
      </div>
    </Link>
  );
}

const TILE = { slate: 'bg-slate-50 text-slate-500', green: 'bg-emerald-50/70 text-emerald-700', red: 'bg-rose-50/70 text-kbz-red', amber: 'bg-amber-50 text-amber-700' } as const;
const TILE_VAL = { slate: 'text-kbz-navy', green: 'text-emerald-700', red: 'text-kbz-red', amber: 'text-amber-700' } as const;

function Tile({ label, value, sub, tone, valueTone }: { label: string; value: string; sub?: string; tone: keyof typeof TILE; valueTone?: string }) {
  return (
    <div className={cx('min-w-0 rounded-xl p-2.5', TILE[tone])}>
      <div className="truncate text-[10px] font-semibold uppercase">{label}</div>
      <div className={cx('mt-0.5 truncate font-mono text-sm font-bold', valueTone ?? TILE_VAL[tone])}>{value}</div>
      {sub && <div className="text-[10px] opacity-80">{sub}</div>}
    </div>
  );
}
