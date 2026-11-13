import { useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Boxes, CheckSquare, Coins, PackageX, Undo2, Wallet, Ban } from 'lucide-react';
import { useData } from '../lib/store';
import { approvalCounts, lowStockItems, retentionAlerts } from '../lib/alerts';
import { batchActual, depositTotals, isLowStock, utilizationPct, yearActual } from '../lib/logic';
import { date, mmk, num, today } from '../lib/format';
import { Badge, Card, Empty, Gauge, PageHeader, StatCard, StatusBadge } from '../components/ui';
import { CATEGORIES, ROLE_LABELS } from '../lib/types';
import { cx } from '../components/ui';
import { Coffee, GraduationCap, Package, Paperclip as Clip } from 'lucide-react';

export default function Dashboard() {
  const { data, user, settings } = useData();
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

  return (
    <>
      <PageHeader title={`Welcome, ${user.name}`} subtitle={`${ROLE_LABELS[user.role]} · ${date(today())}`} />

      {counts.total > 0 && (
        <Link to="/approvals" className="mb-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:border-amber-400">
          <CheckSquare className="h-5 w-5" />
          <span className="flex-1"><b>{counts.total}</b> item{counts.total > 1 ? 's' : ''} waiting for your approval</span>
          <span className="font-medium">Review →</span>
        </Link>
      )}

      <CategoriesBar />

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Inventory</h2>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Active items" value={num(activeItems.length)} sub={`${data.assets.filter((a) => a.status !== 'Retired').length} tracked assets`} icon={<Boxes className="h-5 w-5" />} onClick={() => nav('/inventory')} />
        <StatCard label="Low stock warnings" value={num(low.length)} sub="At or below minimum level" tone={low.length ? 'red' : 'green'} icon={<PackageX className="h-5 w-5" />} onClick={() => nav('/inventory?low=1')} />
        <StatCard label="Total stock valuation" value={mmk(valuation)} sub="Quantity on hand × unit cost" icon={<Coins className="h-5 w-5" />} />
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">License class deposits</h2>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Active deposits held" value={mmk(dep.held)} sub={`${dep.heldCount} trainees · ${mmk(dep.pending)} in pending requests`} icon={<Wallet className="h-5 w-5" />} onClick={() => nav('/deposits?status=open')} />
        <StatCard label="Total refunded" value={mmk(dep.refunded)} sub={`${dep.refundedCount} refunds (exam passed)`} tone="green" icon={<Undo2 className="h-5 w-5" />} onClick={() => nav('/deposits?status=Refunded')} />
        <StatCard label="Total forfeited" value={mmk(dep.forfeited)} sub={`${dep.forfeitedCount} to non-refundable revenue`} tone="amber" icon={<Ban className="h-5 w-5" />} onClick={() => nav('/deposits?status=Forfeited')} />
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

        <Card title={<span className="flex items-center gap-2"><PackageX className="h-4 w-4 text-red-600" />Low stock</span>}
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
                    <span className="font-semibold text-red-600">{num(i.qty_on_hand)}</span>
                    <span className="text-slate-500"> / min {num(i.min_level)} {i.unit}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Expense & budget utilisation" actions={<Link className="text-sm text-navy-700 hover:underline" to="/budget">Details →</Link>}>
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
            className="w-56 rounded-xl border border-silver-200 bg-white p-3 text-left shadow-xs transition hover:border-navy-600 sm:w-auto">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-navy-100 p-1.5 text-navy-800">{CAT_ICON[r.c]}</span>
              <span className="flex-1 truncate text-sm font-semibold text-navy-900">{r.c}</span>
              {r.low > 0 && <span className="rounded-full bg-red-50 px-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200">{r.low} low</span>}
            </div>
            <div className="mt-2 flex items-baseline justify-between text-xs text-slate-500">
              <span>{num(r.count)} items</span><span className="font-medium tabular-nums text-navy-900">{mmk(r.value)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-silver-200" title={`${((r.value / total) * 100).toFixed(0)}% of stock value`}>
              <div className={cx('h-full rounded-full', r.low ? 'bg-red-500' : 'bg-navy-700')} style={{ width: `${(r.value / total) * 100}%` }} />
            </div>
          </button>
        ))}
      </div>
    </nav>
  );
}
