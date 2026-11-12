import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, Pencil, Plus, RotateCcw, SlidersHorizontal, ClipboardCheck } from 'lucide-react';
import { useData } from '../lib/store';
import { CATEGORIES, CLASSIFICATIONS, TXN_LABELS, type Category, type CountLine, type Item, type ReturnCondition } from '../lib/types';
import { isLowStock } from '../lib/logic';
import { date, dateTime, mmk, num, thisMonth } from '../lib/format';
import { Badge, Button, Empty, ErrorNote, Field, Modal, PageHeader, SearchBox, StatusBadge, Tabs, useSubmit, useToast } from '../components/ui';

type Tab = 'items' | 'txns' | 'count';

export default function InventoryPage() {
  const { can } = useData();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>('items');
  const [modal, setModal] = useState<null | 'in' | 'return' | 'adjust' | { item?: Item }>(null);
  return (
    <>
      <PageHeader title="Inventory" subtitle="Refreshments, training materials, YCP merchandise and office supplies"
        actions={can('stock.create') && <>
          <Button onClick={() => setModal('in')}><ArrowDownToLine className="h-4 w-4" />Stock in</Button>
          <Button variant="secondary" onClick={() => setModal('return')}><RotateCcw className="h-4 w-4" />Return</Button>
          <Button variant="secondary" onClick={() => setModal('adjust')}><SlidersHorizontal className="h-4 w-4" />Adjust / write-off</Button>
        </>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'items', label: 'Stock on hand' }, { id: 'txns', label: 'Transactions' }, { id: 'count', label: 'Physical count' }]} />
      {tab === 'items' && <ItemsTab lowOnly={params.get('low') === '1'} onEdit={(item) => setModal({ item })} />}
      {tab === 'txns' && <TxnsTab />}
      {tab === 'count' && <CountTab />}
      {modal === 'in' && <StockInModal onClose={() => setModal(null)} />}
      {modal === 'return' && <ReturnModal onClose={() => setModal(null)} />}
      {modal === 'adjust' && <AdjustModal onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && <ItemModal item={modal.item} onClose={() => setModal(null)} />}
    </>
  );
}

function ItemsTab({ lowOnly, onEdit }: { lowOnly: boolean; onEdit: (i?: Item) => void }) {
  const { data, can } = useData();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');
  const [low, setLow] = useState(lowOnly);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.items.filter((i) => (!cat || i.category === cat) && (!low || isLowStock(i)) && (!s || i.name.toLowerCase().includes(s) || i.code.toLowerCase().includes(s)));
  }, [data.items, q, cat, low]);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search item or code" />
        <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} />Low stock only</label>
        <div className="flex-1" />
        {can('item.manage') && <Button variant="secondary" onClick={() => onEdit()}><Plus className="h-4 w-4" />New item</Button>}
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Code</th><th>Item</th><th>Category</th><th>Type</th><th className="num">On hand</th><th className="num">Min</th><th className="num">Unit cost</th><th className="num">Value</th>{can('item.manage') && <th />}</tr></thead>
          <tbody>
            {rows.map((i) => {
              const isLow = isLowStock(i);
              return (
                <tr key={i.id} className={isLow ? 'bg-red-50/60' : ''}>
                  <td className="whitespace-nowrap text-slate-500">{i.code}</td>
                  <td className="font-medium text-navy-900">{i.name}{!i.active && <Badge>inactive</Badge>}</td>
                  <td className="whitespace-nowrap">{i.category}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{i.classification}</td>
                  <td className="num"><span className={isLow ? 'font-semibold text-red-600' : 'font-medium'}>{num(i.qty_on_hand)}</span> <span className="text-xs text-slate-500">{i.unit}</span></td>
                  <td className="num text-slate-500">{num(i.min_level)}</td>
                  <td className="num">{num(i.unit_cost)}</td>
                  <td className="num">{num(i.qty_on_hand * i.unit_cost)}</td>
                  {can('item.manage') && <td><button className="rounded p-1 text-slate-500 hover:bg-silver-100" onClick={() => onEdit(i)} aria-label={`Edit ${i.name}`}><Pencil className="h-4 w-4" /></button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No items match.</Empty>}
      </div>
      <p className="mt-2 text-xs text-slate-500">Rows in red are at or below the minimum level. Total value: {mmk(rows.reduce((s, i) => s + i.qty_on_hand * i.unit_cost, 0))}</p>
    </>
  );
}

function TxnsTab() {
  const { data, name } = useData();
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const item = (id: string) => data.items.find((i) => i.id === id);
  const batch = (id: string | null) => data.batches.find((b) => b.id === id)?.code;
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.stock_txns
      .filter((t) => (!type || t.type === type) && (!status || t.status === status))
      .filter((t) => !s || t.ref.toLowerCase().includes(s) || (item(t.item_id)?.name.toLowerCase().includes(s) ?? false) || (t.invoice_no ?? '').toLowerCase().includes(s))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.stock_txns, type, status, q]);
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search ref, item, invoice" />
        <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"><option value="">All types</option>{Object.entries(TXN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option><option>Pending</option><option>Approved</option><option>Rejected</option></select>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Ref</th><th>Date</th><th>Type</th><th>Item</th><th className="num">Qty</th><th>Details</th><th>Status</th><th>By</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap font-medium text-navy-800">{t.ref}</td>
                <td className="whitespace-nowrap">{date(t.created_at)}</td>
                <td className="whitespace-nowrap">{TXN_LABELS[t.type]}{t.condition && <div className="text-xs text-slate-500">{t.condition}</div>}</td>
                <td>{item(t.item_id)?.name}</td>
                <td className="num">{t.type === 'OUT' ? '−' : t.type === 'ADJUST' && t.qty < 0 ? '−' : '+'}{num(Math.abs(t.qty))}</td>
                <td className="text-xs text-slate-600">{[t.supplier, t.invoice_no, batch(t.batch_id), t.reason].filter(Boolean).join(' · ')}{t.decision_note && <div className="text-red-600">Note: {t.decision_note}</div>}</td>
                <td><StatusBadge status={t.status} /></td>
                <td className="whitespace-nowrap text-xs">{name(t.created_by)}{t.decided_by && <div className="text-slate-500">✓ {name(t.decided_by)}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No transactions.</Empty>}
      </div>
    </>
  );
}

function ItemPicker({ value, onChange, filter }: { value: string; onChange: (v: string) => void; filter?: (i: Item) => boolean }) {
  const { data } = useData();
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose item…</option>
      {CATEGORIES.map((c) => {
        const list = data.items.filter((i) => i.category === c && i.active && (!filter || filter(i)));
        return list.length ? <optgroup key={c} label={c}>{list.map((i) => <option key={i.id} value={i.id}>{i.name} ({num(i.qty_on_hand)} {i.unit})</option>)}</optgroup> : null;
      })}
    </select>
  );
}

function StockInModal({ onClose }: { onClose: () => void }) {
  const { data, actions } = useData();
  const toast = useToast();
  const [f, setF] = useState({ item_id: '', qty: '', unit_cost: '', supplier: '', invoice_no: '', reason: '' });
  const { busy, error, run } = useSubmit();
  const it = data.items.find((i) => i.id === f.item_id);
  return (
    <Modal open onClose={onClose} title="Stock in (purchase)" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { const t = await actions.stockIn({ ...f, qty: Number(f.qty), unit_cost: Number(f.unit_cost || it?.unit_cost || 0) }); toast(`${t.ref} sent to HOD for approval`); onClose(); })}>Submit for approval</Button>
    </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Item" required className="sm:col-span-2"><ItemPicker value={f.item_id} onChange={(v) => setF({ ...f, item_id: v })} /></Field>
        <Field label={`Quantity${it ? ` (${it.unit})` : ''}`} required><input className="input" type="number" min="1" step="1" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        <Field label="Unit cost (MMK)" hint={it ? `Current: ${num(it.unit_cost)}` : undefined}><input className="input" type="number" min="0" value={f.unit_cost} placeholder={it ? String(it.unit_cost) : ''} onChange={(e) => setF({ ...f, unit_cost: e.target.value })} /></Field>
        <Field label="Supplier" required><input className="input" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
        <Field label="Supplier invoice no." required><input className="input" value={f.invoice_no} onChange={(e) => setF({ ...f, invoice_no: e.target.value })} /></Field>
        <Field label="Note" className="sm:col-span-2"><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      </div>
      <p className="mt-3 text-xs text-slate-500">The balance is updated when the L&D HOD approves.</p>
      <ErrorNote error={error} />
    </Modal>
  );
}

function ReturnModal({ onClose }: { onClose: () => void }) {
  const { data, actions } = useData();
  const toast = useToast();
  const [f, setF] = useState({ batch_id: '', item_id: '', qty: '', condition: 'Good' as ReturnCondition, reason: '' });
  const { busy, error, run } = useSubmit();
  const issuedItems = useMemo(() => new Set(data.stock_txns.filter((t) => t.type === 'OUT' && t.batch_id === f.batch_id && t.status === 'Approved').map((t) => t.item_id)), [data.stock_txns, f.batch_id]);
  return (
    <Modal open onClose={onClose} title="Return after training" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { const t = await actions.stockReturn({ ...f, qty: Number(f.qty) }); toast(`${t.ref} recorded`); onClose(); })}>Record return</Button>
    </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Training batch" required className="sm:col-span-2">
          <select className="input" value={f.batch_id} onChange={(e) => setF({ ...f, batch_id: e.target.value, item_id: '' })}>
            <option value="">Choose batch…</option>{data.batches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </select>
        </Field>
        <Field label="Item issued to this batch" required className="sm:col-span-2"><ItemPicker value={f.item_id} onChange={(v) => setF({ ...f, item_id: v })} filter={(i) => issuedItems.has(i.id)} /></Field>
        <Field label="Quantity" required><input className="input" type="number" min="1" step="1" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        <Field label="Condition" required>
          <select className="input" value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value as ReturnCondition })}>
            <option value="Good">Good: back to stock</option><option value="Damaged">Damaged: log only</option><option value="Lost">Lost: log only</option>
          </select>
        </Field>
        <Field label="Note" required={f.condition !== 'Good'} className="sm:col-span-2"><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}

function AdjustModal({ onClose }: { onClose: () => void }) {
  const { data, actions } = useData();
  const toast = useToast();
  const [f, setF] = useState({ item_id: '', qty: '', reason: '' });
  const { busy, error, run } = useSubmit();
  const it = data.items.find((i) => i.id === f.item_id);
  return (
    <Modal open onClose={onClose} title="Stock adjustment / write-off" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { const t = await actions.stockAdjust({ ...f, qty: Number(f.qty) }); toast(`${t.ref} sent to HOD for approval`); onClose(); })}>Submit for approval</Button>
    </>}>
      <div className="grid gap-3">
        <Field label="Item" required><ItemPicker value={f.item_id} onChange={(v) => setF({ ...f, item_id: v })} /></Field>
        <Field label="Change in quantity" required hint={`Use a negative number to write off (e.g. -5).${it ? ` On hand: ${it.qty_on_hand} ${it.unit}.` : ''}`}><input className="input" type="number" step="1" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        <Field label="Reason" required><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Expired, damaged in storage" /></Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}

function ItemModal({ item, onClose }: { item?: Item; onClose: () => void }) {
  const { actions } = useData();
  const toast = useToast();
  const [f, setF] = useState({
    code: item?.code ?? '', name: item?.name ?? '', category: item?.category ?? ('Refreshments' as Category), classification: item?.classification ?? 'Consumable',
    unit: item?.unit ?? 'Piece', unit_cost: String(item?.unit_cost ?? ''), min_level: String(item?.min_level ?? ''), active: item?.active ?? true,
  });
  const { busy, error, run } = useSubmit();
  return (
    <Modal open onClose={onClose} title={item ? `Edit ${item.name}` : 'New inventory item'} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { await actions.saveItem({ ...f, id: item?.id, unit_cost: Number(f.unit_cost), min_level: Number(f.min_level) }); toast('Item saved'); onClose(); })}>Save</Button>
    </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Code" required><input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        <Field label="Unit" required><input className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
        <Field label="Name" required className="sm:col-span-2"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Category"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Category })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Classification"><select className="input" value={f.classification} onChange={(e) => setF({ ...f, classification: e.target.value as Item['classification'] })}>{CLASSIFICATIONS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Unit cost (MMK)"><input className="input" type="number" min="0" value={f.unit_cost} onChange={(e) => setF({ ...f, unit_cost: e.target.value })} /></Field>
        <Field label="Minimum level" hint="Red alert at or below this"><input className="input" type="number" min="0" value={f.min_level} onChange={(e) => setF({ ...f, min_level: e.target.value })} /></Field>
        {item && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Active</label>}
      </div>
      {!item && <p className="mt-3 text-xs text-slate-500">New items start at zero. Use Stock in to add the opening quantity.</p>}
      <ErrorNote error={error} />
    </Modal>
  );
}

function CountTab() {
  const { data, actions, can, name } = useData();
  const toast = useToast();
  const [cat, setCat] = useState<Category>('Refreshments');
  const [month, setMonth] = useState(thisMonth());
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const { busy, error, run } = useSubmit();
  const items = data.items.filter((i) => i.active && i.category === cat);
  const entered = items.filter((i) => counted[i.id] !== undefined && counted[i.id] !== '');
  const variances = entered.filter((i) => Number(counted[i.id]) !== i.qty_on_hand).length;
  return (
    <div className="space-y-6">
      {can('count.create') && (
        <div className="rounded-xl border border-silver-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Field label="Count month"><input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
            <Field label="Category"><select className="input" value={cat} onChange={(e) => { setCat(e.target.value as Category); setCounted({}); }}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Button variant="secondary" onClick={() => setCounted(Object.fromEntries(items.map((i) => [i.id, String(i.qty_on_hand)])))}>Fill with system qty</Button>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Item</th><th className="num">System</th><th className="num">Counted</th><th className="num">Variance</th></tr></thead>
              <tbody>
                {items.map((i) => {
                  const v = counted[i.id];
                  const diff = v === undefined || v === '' ? null : Number(v) - i.qty_on_hand;
                  return (
                    <tr key={i.id}>
                      <td>{i.name}</td><td className="num">{num(i.qty_on_hand)}</td>
                      <td className="num"><input className="input ml-auto w-24 text-right" type="number" min="0" step="1" value={v ?? ''} onChange={(e) => setCounted({ ...counted, [i.id]: e.target.value })} aria-label={`Counted ${i.name}`} /></td>
                      <td className={`num font-medium ${diff ? (diff < 0 ? 'text-red-600' : 'text-emerald-700') : 'text-slate-400'}`}>{diff === null ? '' : diff > 0 ? `+${diff}` : diff}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="Note" className="min-w-60 flex-1"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Counted by…, location…" /></Field>
            <Button busy={busy} disabled={!entered.length} onClick={() => run(async () => {
              const lines: CountLine[] = entered.map((i) => ({ item_id: i.id, system_qty: i.qty_on_hand, counted_qty: Number(counted[i.id]) }));
              const r = await actions.submitCount({ month, lines, note: note || cat });
              toast(`${r.count.ref} saved · ${r.adjustments} adjustment(s) sent for HOD approval`);
              setCounted({}); setNote('');
            })}><ClipboardCheck className="h-4 w-4" />Submit count ({entered.length} items, {variances} variances)</Button>
          </div>
          <ErrorNote error={error} />
        </div>
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-navy-900">Count history (reconciliation)</h3>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Ref</th><th>Month</th><th>Counted by</th><th className="num">Items</th><th className="num">Variances</th><th className="num">Net variance value</th><th>Note</th></tr></thead>
            <tbody>
              {[...data.physical_counts].reverse().map((c) => {
                const v = c.lines.filter((l) => l.counted_qty !== l.system_qty);
                const val = v.reduce((s, l) => s + (l.counted_qty - l.system_qty) * (data.items.find((i) => i.id === l.item_id)?.unit_cost ?? 0), 0);
                return <tr key={c.id}><td className="font-medium text-navy-800">{c.ref}</td><td>{c.month}</td><td>{name(c.created_by)} <div className="text-xs text-slate-500">{dateTime(c.created_at)}</div></td><td className="num">{c.lines.length}</td><td className="num">{v.length}</td><td className="num">{mmk(val)}</td><td className="text-xs">{c.note}</td></tr>;
              })}
            </tbody>
          </table>
          {data.physical_counts.length === 0 && <Empty>No physical counts recorded yet.</Empty>}
        </div>
      </div>
    </div>
  );
}
