import type { ReportSpec } from '../lib/export';
import { batchActual, depositTotals, stockDelta, variancePct } from '../lib/logic';
import type { Asset, Batch, DataSet, Deposit, Item } from '../lib/types';
import { date, mmk } from '../lib/format';

const stamp = () => new Date().toISOString().slice(0, 10);
const effective = (t: { decided_at: string | null; created_at: string }) => t.decided_at ?? t.created_at;

export interface MovementRow {
  item: Item; opening: number; inQty: number; outQty: number; returned: number; adjusted: number; closing: number; value: number;
}

/** Stock movement between two dates (inclusive), rebuilt from approved transactions. */
export function stockMovement(data: DataSet, from: string, to: string): MovementRow[] {
  const start = `${from}T00:00:00`;
  const end = `${to}T23:59:59.999`;
  return data.items.map((item) => {
    const txns = data.stock_txns.filter((t) => t.item_id === item.id && t.status === 'Approved');
    const after = (iso: string) => txns.filter((t) => effective(t) > iso).reduce((s, t) => s + stockDelta(t), 0);
    const closing = item.qty_on_hand - after(end);
    const opening = item.qty_on_hand - after(start);
    const inRange = txns.filter((t) => effective(t) >= start && effective(t) <= end);
    const sum = (type: string) => inRange.filter((t) => t.type === type).reduce((s, t) => s + stockDelta(t), 0);
    return { item, opening, inQty: sum('IN'), outQty: -sum('OUT'), returned: sum('RETURN'), adjusted: sum('ADJUST'), closing, value: closing * item.unit_cost };
  });
}

export function stockMovementReport(data: DataSet, from: string, to: string, by: string, category = ''): ReportSpec<MovementRow> {
  const rows = stockMovement(data, from, to).filter((r) => !category || r.item.category === category);
  return {
    title: 'Stock Movement & Valuation Report', subtitle: `${date(from)} – ${date(to)}${category ? ` · ${category}` : ''}`,
    filename: `stock-movement_${from}_${to}`, generatedBy: by, rows,
    summary: [['Items', String(rows.length)], ['Closing valuation', mmk(rows.reduce((s, r) => s + r.value, 0))],
      ['Items at or below minimum', String(rows.filter((r) => r.closing <= r.item.min_level).length)]],
    columns: [
      { header: 'Code', value: (r) => r.item.code }, { header: 'Item', value: (r) => r.item.name }, { header: 'Category', value: (r) => r.item.category },
      { header: 'Opening', value: (r) => r.opening, numeric: true }, { header: 'In', value: (r) => r.inQty, numeric: true },
      { header: 'Out', value: (r) => r.outQty, numeric: true }, { header: 'Returned', value: (r) => r.returned, numeric: true },
      { header: 'Adjusted', value: (r) => r.adjusted, numeric: true }, { header: 'Closing', value: (r) => r.closing, numeric: true },
      { header: 'Unit cost', value: (r) => r.item.unit_cost, numeric: true }, { header: 'Value (MMK)', value: (r) => r.value, numeric: true },
    ],
  };
}

export function depositMasterReport(data: DataSet, rows: Deposit[], by: string): ReportSpec<Deposit> {
  const t = depositTotals(rows);
  const batch = (id: string) => data.batches.find((b) => b.id === id)?.code ?? '';
  return {
    title: 'License Class Deposit Master Report', filename: `deposit-master_${stamp()}`, generatedBy: by, rows,
    summary: [['Deposits', String(rows.length)], ['Held (incl. pending requests)', mmk(t.held)], ['Refunded', mmk(t.refunded)], ['Forfeited', mmk(t.forfeited)]],
    columns: [
      { header: 'Deposit ID', value: (d) => d.ref }, { header: 'Trainee name', value: (d) => d.trainee_name }, { header: 'Agent code', value: (d) => d.agent_code },
      { header: 'Batch', value: (d) => batch(d.batch_id) }, { header: 'Amount (MMK)', value: (d) => d.amount, numeric: true },
      { header: 'Payment date', value: (d) => d.payment_date }, { header: 'Voucher', value: (d) => d.voucher_ref }, { header: 'Status', value: (d) => d.status },
      { header: 'Forfeit reason', value: (d) => d.forfeit_reason ?? '' }, { header: 'Closed', value: (d) => d.closed_at?.slice(0, 10) ?? '' },
    ],
  };
}

export function forfeitureReport(data: DataSet, by: string, from: string, to: string): ReportSpec<Deposit> {
  const rows = data.deposits.filter((d) => d.status === 'Forfeited' && (d.closed_at ?? '').slice(0, 10) >= from && (d.closed_at ?? '').slice(0, 10) <= to);
  const sum = (r: string) => rows.filter((d) => d.forfeit_reason === r).reduce((s, d) => s + d.amount, 0);
  const name = (id: string | null) => data.profiles.find((p) => p.id === id)?.name ?? '';
  const batch = (id: string) => data.batches.find((b) => b.id === id)?.code ?? '';
  return {
    title: 'Deposit Forfeiture Detailed Statement', subtitle: `Forfeitures approved ${date(from)} – ${date(to)}`, filename: `forfeiture-statement_${from}_${to}`, generatedBy: by, rows,
    summary: [['Course Incomplete Forfeited Ledger', mmk(sum('Course Incomplete'))], ['Service Term Not Met Forfeited Ledger', mmk(sum('Service Period Not Met'))],
      ['Total transferred to non-refundable revenue', mmk(rows.reduce((s, d) => s + d.amount, 0))]],
    columns: [
      { header: 'Deposit ID', value: (d) => d.ref }, { header: 'Trainee', value: (d) => d.trainee_name }, { header: 'Agent code', value: (d) => d.agent_code },
      { header: 'Batch', value: (d) => batch(d.batch_id) }, { header: 'Amount (MMK)', value: (d) => d.amount, numeric: true },
      { header: 'Reason', value: (d) => d.forfeit_reason ?? '' }, { header: 'Evidence note', value: (d) => d.request_note ?? '' },
      { header: 'Requested by', value: (d) => name(d.requested_by) }, { header: 'Approved by (HOD)', value: (d) => name(d.hod_approved_by) },
      { header: 'Approved on', value: (d) => d.hod_approved_at?.slice(0, 10) ?? '' },
    ],
  };
}

export interface VarianceRow { batch: Batch; materials: number; expenses: number; actual: number; variance: number; pct: number | null; deposits: number; refunded: number; forfeited: number }

export function varianceRows(data: DataSet): VarianceRow[] {
  return data.batches.map((b) => {
    const a = batchActual(b.id, data.stock_txns, data.expenses);
    const dt = depositTotals(data.deposits.filter((d) => d.batch_id === b.id));
    return { batch: b, materials: a.materials, expenses: a.expenses, actual: a.total, variance: a.total - b.budget, pct: variancePct(b.budget, a.total), deposits: dt.held, refunded: dt.refunded, forfeited: dt.forfeited };
  });
}

export function varianceReport(data: DataSet, by: string): ReportSpec<VarianceRow> {
  const rows = varianceRows(data);
  const budget = rows.reduce((s, r) => s + r.batch.budget, 0);
  const actual = rows.reduce((s, r) => s + r.actual, 0);
  return {
    title: 'Training Batch Expense & Budget Variance Report', filename: `batch-variance_${stamp()}`, generatedBy: by, rows,
    summary: [['Total batch budgets', mmk(budget)], ['Total actual spend', mmk(actual)], ['Variance', `${mmk(actual - budget)} (${budget ? (((actual - budget) / budget) * 100).toFixed(1) : '—'}%)`]],
    columns: [
      { header: 'Batch', value: (r) => r.batch.code }, { header: 'Program', value: (r) => r.batch.program }, { header: 'Status', value: (r) => r.batch.status },
      { header: 'Budget', value: (r) => r.batch.budget, numeric: true }, { header: 'Materials', value: (r) => r.materials, numeric: true },
      { header: 'Other expenses', value: (r) => r.expenses, numeric: true }, { header: 'Actual', value: (r) => r.actual, numeric: true },
      { header: 'Variance', value: (r) => r.variance, numeric: true }, { header: 'Variance %', value: (r) => (r.pct === null ? '' : `${r.pct.toFixed(1)}%`), numeric: true },
      { header: 'Deposits held', value: (r) => r.deposits, numeric: true }, { header: 'Refunded', value: (r) => r.refunded, numeric: true },
      { header: 'Forfeited', value: (r) => r.forfeited, numeric: true },
    ],
  };
}

export interface AssetRow { asset: Asset; last: string; lastAction: string; maintenance: number; events: number }

export function assetRows(data: DataSet): AssetRow[] {
  return data.assets.map((a) => {
    const logs = data.asset_logs.filter((l) => l.asset_id === a.id).sort((x, y) => y.created_at.localeCompare(x.created_at));
    return { asset: a, last: logs[0]?.created_at ?? a.created_at, lastAction: logs[0]?.action ?? '', maintenance: logs.reduce((s, l) => s + (l.cost || 0), 0), events: logs.length };
  });
}

export function assetReport(data: DataSet, by: string): ReportSpec<AssetRow> {
  const rows = assetRows(data);
  const batch = (id: string | null) => data.batches.find((b) => b.id === id)?.code ?? '';
  return {
    title: 'Asset Register & Condition Log Report', filename: `asset-register_${stamp()}`, generatedBy: by, rows,
    summary: [['Assets', String(rows.length)], ['Book cost', mmk(rows.reduce((s, r) => s + r.asset.cost, 0))],
      ['Damaged / lost', String(rows.filter((r) => ['Damaged', 'Lost'].includes(r.asset.status)).length)],
      ['Maintenance spend', mmk(rows.reduce((s, r) => s + r.maintenance, 0))]],
    columns: [
      { header: 'Asset ID', value: (r) => r.asset.asset_tag }, { header: 'Name', value: (r) => r.asset.name }, { header: 'Serial', value: (r) => r.asset.serial_no },
      { header: 'Status', value: (r) => r.asset.status }, { header: 'Condition', value: (r) => r.asset.condition },
      { header: 'Holder / batch', value: (r) => [r.asset.holder, batch(r.asset.batch_id)].filter(Boolean).join(' · ') },
      { header: 'Cost', value: (r) => r.asset.cost, numeric: true }, { header: 'Maintenance', value: (r) => r.maintenance, numeric: true },
      { header: 'Last activity', value: (r) => `${r.lastAction} ${r.last.slice(0, 10)}` },
    ],
  };
}
