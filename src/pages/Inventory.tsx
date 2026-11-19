import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowLeft, Camera, LayoutGrid, List, Pencil, ShoppingBasket, Plus, RotateCcw, SlidersHorizontal, ClipboardCheck, Trash2 } from 'lucide-react';
import { stockMovement, type MovementRow } from './reportSpecs';
import { groupOf, groupsFor } from '../lib/itemGroups';
import type { LucideIcon } from 'lucide-react';
import { MonthBar, useMonthParam } from '../components/MonthBar';
import { FileLink, FilePicker, Thumb, useFileUrl } from '../components/files';
import { DOC_ACCEPT } from '../lib/files';
import { useData } from '../lib/store';
import { CATEGORIES, CLASSIFICATIONS, TXN_LABELS, type Category, type CountLine, type Item, type ReturnCondition } from '../lib/types';
import { date, dateTime, mmk, monthEnd, monthLabel, num, thisMonth } from '../lib/format';
import { Badge, Button, cx, Empty, ErrorNote, Field, Modal, PageHeader, SearchBox, StatusBadge, Tabs, useSubmit, useToast } from '../components/ui';

type Tab = 'items' | 'txns' | 'count';

export default function InventoryPage() {
  const { can } = useData();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>('items');
  const [month, setMonth] = useMonthParam();
  const { data } = useData();
  const [modal, setModal] = useState<null | 'in' | 'return' | 'adjust' | { item?: Item }>(() => (params.get('stockin') === '1' && can('stock.create') ? 'in' : null));
  return (
    <>
      <PageHeader title="Inventory" subtitle="Refreshments, training materials, YCP merchandise and office supplies"
        actions={can('stock.create') && <>
          <Button onClick={() => setModal('in')}><ArrowDownToLine className="h-4 w-4" />Stock in</Button>
          <Button variant="secondary" onClick={() => setModal('return')}><RotateCcw className="h-4 w-4" />Return</Button>
          <Button variant="secondary" onClick={() => setModal('adjust')}><SlidersHorizontal className="h-4 w-4" />Adjust / write-off</Button>
        </>} />
      <MonthBar month={month} onChange={setMonth} allLabel="All months (current balance)"
        dates={[...data.stock_txns.map((t) => t.decided_at ?? t.created_at), ...data.physical_counts.map((c) => `${c.month}-01`)]}
        note={month ? `Balances as at ${date(monthEnd(month))}; movements in ${monthLabel(month)}` : 'Current balances and all transactions'} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'items', label: 'Stock on hand' }, { id: 'txns', label: 'Transactions' }, { id: 'count', label: 'Physical count' }]} />
      {tab === 'items' && <ItemsTab month={month} lowOnly={params.get('low') === '1'} initialCat={params.get('cat') ?? ''} onEdit={(item) => setModal({ item })} />}
      {tab === 'txns' && <TxnsTab month={month} />}
      {tab === 'count' && <CountTab month={month} />}
      {modal === 'in' && <StockInModal onClose={() => setModal(null)} />}
      {modal === 'return' && <ReturnModal onClose={() => setModal(null)} />}
      {modal === 'adjust' && <AdjustModal onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && <ItemModal item={modal.item} onClose={() => setModal(null)} />}
    </>
  );
}

const txnMonth = (t: { decided_at: string | null; created_at: string }) => (t.decided_at ?? t.created_at).slice(0, 7);

function ItemsTable({ rows, month, moves, onEdit }: { rows: Item[]; month: string; moves: Map<string, MovementRow> | null; onEdit: (i?: Item) => void }) {
  const { can } = useData();
  const qtyOf = (i: Item) => moves?.get(i.id)?.closing ?? i.qty_on_hand;
  return (
    <>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th className="w-12" /><th>Item</th><th>Main item</th><th>Category</th>
            {moves && <><th className="num">Opening</th><th className="num">In</th><th className="num">Out</th></>}
            <th className="num">{moves ? `On hand ${monthLabel(month)}` : 'On hand'}</th><th className="num">Min</th><th className="num">Cost / unit</th><th className="num">Value (qty × cost)</th>{can('item.manage') && <th />}</tr></thead>
          <tbody>
            {rows.map((i) => {
              const qty = qtyOf(i);
              const isLow = qty <= i.min_level;
              const m = moves?.get(i.id);
              return (
                <tr key={i.id} className={isLow ? 'bg-red-50/60' : ''}>
                  <td className="py-1.5"><Thumb att={i.photo} alt={i.name} /></td>
                  <td className="font-medium text-navy-900">{i.name}{!i.active && <Badge>inactive</Badge>}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{groupOf(i).label}</td>
                  <td className="whitespace-nowrap">{i.category}</td>
                  {m && <>
                    <td className="num text-slate-500">{num(m.opening)}</td>
                    <td className="num text-emerald-700">{m.inQty + Math.max(0, m.adjusted) + m.returned ? `+${num(m.inQty + Math.max(0, m.adjusted) + m.returned)}` : '—'}</td>
                    <td className="num text-kbz-red">{m.outQty - Math.min(0, m.adjusted) ? `−${num(m.outQty - Math.min(0, m.adjusted))}` : '—'}</td>
                  </>}
                  <td className="num"><span className={isLow ? 'font-semibold text-red-600' : 'font-medium'}>{num(qty)}</span> <span className="text-xs text-slate-500">{i.unit}</span></td>
                  <td className="num text-slate-500">{num(i.min_level)}</td>
                  <td className="num">{num(i.unit_cost)}</td>
                  <td className="num">{num(qty * i.unit_cost)}</td>
                  {can('item.manage') && <td><button className="rounded p-1 text-slate-500 hover:bg-silver-100" onClick={() => onEdit(i)} aria-label={`Edit ${i.name}`}><Pencil className="h-4 w-4" /></button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No items match.</Empty>}
      </div>
    </>
  );
}

/**
 * Shop-style view in two steps:
 *  1. the main item icon cards only (Coffee, Tea …);
 *  2. tap one to enter it and see just its item cards (with real photos).
 * The chosen main item is kept in the URL (?group=coffee) so browser Back returns to step 1.
 */
function ItemsTab({ month, lowOnly, initialCat, onEdit }: { month: string; lowOnly: boolean; initialCat: string; onEdit: (i?: Item) => void }) {
  const { data, can } = useData();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | ''>((CATEGORIES as readonly string[]).includes(initialCat) ? (initialCat as Category) : '');
  const [low, setLow] = useState(lowOnly);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const group = params.get('group') ?? '';
  const setGroup = (g: string) => {
    const p = new URLSearchParams(params);
    if (g) p.set('group', g); else p.delete('group');
    setParams(p, { replace: !g });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const moves = useMemo(() => (month ? new Map(stockMovement(data, `${month}-01`, monthEnd(month)).map((r) => [r.item.id, r])) : null), [data, month]);
  const qtyOf = (i: Item) => moves?.get(i.id)?.closing ?? i.qty_on_hand;
  const visible = data.items.filter((i) => can('item.manage') || i.active);
  const inCat = visible.filter((i) => !cat || i.category === cat);
  const groups = groupsFor(cat).map((g) => {
    const list = inCat.filter((i) => groupOf(i).id === g.id);
    return { g, count: list.length, low: list.filter((i) => qtyOf(i) <= i.min_level).length };
  }).filter((x) => x.count > 0 && (!low || x.low > 0));
  const chosen = group === 'all' ? null : groupsFor('').find((g) => g.id === group) ?? null;
  const s = q.trim().toLowerCase();
  const searching = s.length > 0;
  // Items shown: inside a main item, or every match while searching, or everything in table view.
  const rows = useMemo(() => visible
    .filter((i) => (searching ? i.name.toLowerCase().includes(s) : group === 'all' || view === 'table' && !group ? !cat || i.category === cat : groupOf(i).id === group))
    .filter((i) => !low || qtyOf(i) <= i.min_level)
    .sort((a, b) => a.name.localeCompare(b.name)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [data.items, s, group, cat, low, moves, view]);
  const showGroups = !group && !searching && view === 'cards';

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search all items" />
        {showGroups && (
          <div className="-mx-4 flex w-[calc(100%+2rem)] gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:flex-wrap sm:px-0" role="group" aria-label="Category">
            {(['', ...CATEGORIES] as const).map((c) => (
              <button key={c || 'all'} onClick={() => setCat(c)}
                className={cx('shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition', cat === c ? 'bg-kbz-navy text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-kbz-navy')}>
                {c || 'All categories'}
              </button>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} />Low stock only</label>
        <div className="flex-1" />
        <div className="flex rounded-xl bg-white p-0.5 ring-1 ring-slate-200" role="group" aria-label="View">
          <button onClick={() => setView('cards')} className={cx('flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold', view === 'cards' ? 'bg-kbz-navy text-white' : 'text-slate-600')}><LayoutGrid className="h-3.5 w-3.5" />Cards</button>
          <button onClick={() => setView('table')} className={cx('flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold', view === 'table' ? 'bg-kbz-navy text-white' : 'text-slate-600')}><List className="h-3.5 w-3.5" />Table</button>
        </div>
        {can('item.manage') && <Button variant="secondary" onClick={() => onEdit()}><Plus className="h-4 w-4" />New item</Button>}
      </div>

      {showGroups ? (
        /* Step 1: main item icon cards only */
        <>
          <h3 className="mb-3 text-base font-bold text-kbz-dark">Choose a main item <span className="text-sm font-normal text-slate-500">· {groups.length} groups</span></h3>
          {groups.length === 0 ? <Empty>No items match.</Empty> : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6" role="list" aria-label="Main items">
              {groups.map(({ g, count, low: lowN }) => (
                <GroupCard key={g.id} label={g.label} count={count} low={lowN} onClick={() => setGroup(g.id)} Icon={g.icon} />
              ))}
              <GroupCard label="All items" count={inCat.length} onClick={() => setGroup('all')} Icon={LayoutGrid} muted />
            </div>
          )}
        </>
      ) : (
        /* Step 2: inside a main item (or search results / table) */
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {group && !searching && (
              <button onClick={() => setGroup('')} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-kbz-navy shadow-sm ring-1 ring-slate-200 hover:ring-kbz-navy">
                <ArrowLeft className="h-4 w-4" />All main items
              </button>
            )}
            {chosen && !searching && (
              <span className="grid h-11 w-11 place-items-center rounded-full bg-kbz-navy text-white"><chosen.icon className="h-6 w-6" strokeWidth={1.5} /></span>
            )}
            <h3 className="text-lg font-bold text-kbz-dark">
              {searching ? `Results for “${q.trim()}”` : chosen ? chosen.label : group === 'all' ? 'All items' : cat || 'All items'}
              <span className="ml-1 text-sm font-normal text-slate-500">· {rows.length} item{rows.length === 1 ? '' : 's'}</span>
            </h3>
            <span className="ml-auto text-xs text-slate-500">Value{month ? ` at end of ${monthLabel(month)}` : ''}: <b className="text-kbz-dark">{mmk(rows.reduce((t, i) => t + qtyOf(i) * i.unit_cost, 0))}</b></span>
          </div>
          {view === 'table' ? <ItemsTable rows={rows} month={month} moves={moves} onEdit={onEdit} /> : rows.length === 0 ? <Empty>No items match.</Empty> : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {rows.map((i) => <ProductCard key={i.id} item={i} qty={qtyOf(i)} showGroup={searching || group === 'all'} onEdit={can('item.manage') ? () => onEdit(i) : undefined} />)}
            </div>
          )}
        </>
      )}
    </>
  );
}

function GroupCard({ label, count, low, onClick, Icon, muted }: { label: string; count: number; low?: number; onClick: () => void; Icon: LucideIcon; muted?: boolean }) {
  return (
    <button onClick={onClick} role="listitem" aria-label={`${label}, ${count} item${count === 1 ? '' : 's'}${low ? `, ${low} low stock` : ''}`}
      className={cx('group relative flex flex-col items-center gap-3 rounded-3xl px-3 py-6 text-center shadow-[0_8px_24px_-14px_rgba(15,23,42,0.3)] transition hover:-translate-y-0.5 hover:bg-kbz-navy hover:text-white hover:shadow-[0_14px_30px_-14px_rgba(0,45,114,0.8)]',
        muted ? 'bg-slate-100 text-slate-600' : 'bg-white text-kbz-dark')}>
      {!!low && <span className="absolute right-3 top-3 rounded-full bg-kbz-red px-2 py-0.5 text-[10px] font-bold text-white">{low} low</span>}
      <span className="grid h-20 w-20 place-items-center rounded-full bg-slate-50 ring-1 ring-slate-100 transition group-hover:bg-white group-hover:text-kbz-navy">
        <Icon className="h-9 w-9" strokeWidth={1.4} />
      </span>
      <span className="text-sm font-semibold leading-tight">{label}</span>
      <span className="-mt-2 text-[11px] text-slate-400 transition group-hover:text-white/70">{count} item{count === 1 ? '' : 's'}</span>
    </button>
  );
}

function ProductCard({ item: i, qty, onEdit, showGroup }: { item: Item; qty: number; onEdit?: () => void; showGroup?: boolean }) {
  const { can, actions } = useData();
  const toast = useToast();
  const nav = useNavigate();
  const g = groupOf(i);
  const out = qty <= 0;
  const isLow = !out && qty <= i.min_level;
  const { url } = useFileUrl(i.photo);
  const [uploading, setUploading] = useState(false);
  const canPhoto = can('item.manage');
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      await actions.saveItem({ id: i.id, name: i.name, category: i.category, classification: i.classification, unit: i.unit, unit_cost: i.unit_cost,
        min_level: i.min_level, active: i.active, item_group: i.item_group }, file);
      toast(`Photo saved for ${i.name}`);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setUploading(false); }
  };
  const photoInput = canPhoto && <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={uploading} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />;
  return (
    <div className={cx('group relative flex flex-col rounded-2xl bg-white p-3 shadow-[0_6px_22px_-12px_rgba(15,23,42,0.3)] transition hover:shadow-[0_14px_30px_-14px_rgba(15,23,42,0.35)]', !i.active && 'opacity-60')}>
      {(out || isLow || !i.active) && (
        <span className={cx('absolute left-3 top-3 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
          !i.active ? 'bg-slate-200 text-slate-600' : out ? 'bg-slate-700 text-white' : 'bg-rose-100 text-kbz-red')}>
          {!i.active ? 'Inactive' : out ? 'Out of stock' : 'Low stock'}
        </span>
      )}
      {onEdit && (
        <button onClick={onEdit} className="absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-slate-400 ring-1 ring-slate-200 hover:text-kbz-navy" aria-label={`Edit ${i.name}`}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="relative h-40 overflow-hidden rounded-xl bg-white">
        {url ? (
          <img src={url} alt={i.name} className="h-40 w-full object-contain" loading="lazy" />
        ) : canPhoto ? (
          <label className={cx('flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 transition hover:border-kbz-navy hover:text-kbz-navy', uploading && 'animate-pulse')}>
            <Camera className="h-7 w-7" strokeWidth={1.5} />
            <span className="text-xs font-semibold">{uploading ? 'Uploading…' : 'Add photo'}</span>
            {photoInput}
          </label>
        ) : (
          <span className="flex h-40 items-center justify-center"><span className="grid h-24 w-24 place-items-center rounded-full bg-navy-50 text-kbz-navy"><g.icon className="h-12 w-12" strokeWidth={1.25} /></span></span>
        )}
        {url && canPhoto && (
          <label className="absolute bottom-1 right-1 grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-white/90 text-slate-500 opacity-0 shadow ring-1 ring-slate-200 transition hover:text-kbz-navy group-hover:opacity-100 focus-within:opacity-100" title="Change photo" aria-label={`Change photo of ${i.name}`}>
            <Camera className="h-3.5 w-3.5" />{photoInput}
          </label>
        )}
      </div>
      <div className="mt-3 text-[11px] text-slate-400">{showGroup ? `${g.label} · ` : ''}{i.unit}</div>
      <div className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-kbz-dark">{i.name}</div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold tabular-nums text-kbz-blue">{num(i.unit_cost)} <span className="text-[11px] font-medium text-slate-400">MMK / {i.unit}</span></div>
          <div className={cx('text-[11px] font-semibold tabular-nums', out || isLow ? 'text-kbz-red' : 'text-emerald-700')}>{num(qty)} in stock{isLow ? ` · min ${num(i.min_level)}` : ''}</div>
        </div>
        {can('request.create') && i.active && (
          <button onClick={() => nav(`/requests?new=1&item=${i.id}`)} disabled={out} title={out ? 'Out of stock' : 'Request this item'}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-kbz-dark transition hover:bg-kbz-navy hover:text-white disabled:opacity-40" aria-label={`Request ${i.name}`}>
            <ShoppingBasket className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function TxnsTab({ month }: { month: string }) {
  const { data, name } = useData();
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const item = (id: string) => data.items.find((i) => i.id === id);
  const topic = (id: string | null) => data.batches.find((b) => b.id === id)?.name ?? '';
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.stock_txns
      .filter((t) => (!month || txnMonth(t) === month) && (!type || t.type === type) && (!status || t.status === status))
      .filter((t) => !s || (item(t.item_id)?.name.toLowerCase().includes(s) ?? false) || topic(t.batch_id).toLowerCase().includes(s))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.stock_txns, type, status, q, month]);
  const total = rows.filter((t) => t.status === 'Approved').reduce((sum, t) => sum + Math.abs(t.qty) * t.unit_cost, 0);
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search item or training" />
        <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"><option value="">All types</option>{Object.entries(TXN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option><option>Pending</option><option>Approved</option><option>Rejected</option></select>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Training topic</th><th>Date</th><th>Type</th><th>Item</th><th className="num">Qty</th><th className="num">Cost / unit</th><th className="num">Total</th><th>Status</th><th>By</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="min-w-40 font-medium text-navy-800">{topic(t.batch_id) || <span className="font-normal text-slate-400">—</span>}</td>
                <td className="whitespace-nowrap">{date(t.created_at)}</td>
                <td className="whitespace-nowrap">{TXN_LABELS[t.type]}{t.condition && <div className="text-xs text-slate-500">{t.condition}</div>}</td>
                <td>{item(t.item_id)?.name}{t.attachment && <div className="text-xs"><FileLink att={t.attachment} /></div>}</td>
                <td className="num">{t.type === 'OUT' ? '−' : t.type === 'ADJUST' && t.qty < 0 ? '−' : '+'}{num(Math.abs(t.qty))}</td>
                <td className="num">{num(t.unit_cost)}</td>
                <td className="num font-medium">{num(Math.abs(t.qty) * t.unit_cost)}</td>
                <td><StatusBadge status={t.status} />{t.status === 'Rejected' && t.decision_note && <div className="mt-1 max-w-48 text-xs text-red-600">{t.decision_note}</div>}</td>
                <td className="whitespace-nowrap text-xs">{name(t.created_by)}{t.decided_by && <div className="text-slate-500">✓ {name(t.decided_by)}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>{month ? `No transactions in ${monthLabel(month)}.` : 'No transactions.'}</Empty>}
      </div>
      <p className="mt-2 text-xs text-slate-500">{rows.length} transactions{month ? ` in ${monthLabel(month)}` : ''} · approved value {mmk(total)}</p>
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
  const [f, setF] = useState({ item_id: '', qty: '', unit_cost: '', total: '', reason: '' });
  const [invoice, setInvoice] = useState<File[]>([]);
  const { busy, error, run } = useSubmit();
  const it = data.items.find((i) => i.id === f.item_id);
  const qty = Number(f.qty) || 0;
  // Cost per unit and total stay in step: typing one recalculates the other.
  const setQty = (v: string) => { const q = Number(v) || 0; const c = Number(f.unit_cost); setF({ ...f, qty: v, total: q && f.unit_cost !== '' ? String(Math.round(q * c * 100) / 100) : f.total }); };
  const setCost = (v: string) => setF({ ...f, unit_cost: v, total: qty && v !== '' ? String(Math.round(qty * Number(v) * 100) / 100) : '' });
  const setTotal = (v: string) => setF({ ...f, total: v, unit_cost: qty && v !== '' ? String(Math.round((Number(v) / qty) * 100) / 100) : f.unit_cost });
  const pickItem = (id: string) => {
    const x = data.items.find((i) => i.id === id);
    const c = f.unit_cost !== '' ? f.unit_cost : x ? String(x.unit_cost) : '';
    setF({ ...f, item_id: id, unit_cost: c, total: qty && c !== '' ? String(qty * Number(c)) : f.total });
  };
  return (
    <Modal wide open onClose={onClose} title="Stock in (purchase)" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { await actions.stockIn({ ...f, qty, unit_cost: Number(f.unit_cost || it?.unit_cost || 0) }, invoice[0] ?? null); toast('Stock in sent to HOD for approval'); onClose(); })}>Submit for approval</Button>
    </>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Item" required className="sm:col-span-3"><div className="flex items-center gap-2"><Thumb att={it?.photo} alt={it?.name ?? ''} size={38} /><div className="flex-1"><ItemPicker value={f.item_id} onChange={pickItem} /></div></div></Field>
        <Field label={`Quantity${it ? ` (${it.unit})` : ''}`} required><input className="input" type="number" min="1" step="1" value={f.qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Cost per unit (MMK)" hint={it ? `Current: ${num(it.unit_cost)}` : undefined}><input className="input" type="number" min="0" step="any" value={f.unit_cost} onChange={(e) => setCost(e.target.value)} /></Field>
        <Field label="Total cost (MMK)" hint="Qty × cost per unit"><input className="input font-medium" type="number" min="0" step="any" value={f.total} onChange={(e) => setTotal(e.target.value)} /></Field>
        <Field label="Invoice (scan / photo / PDF)" className="sm:col-span-3"><FilePicker files={invoice} onChange={setInvoice} accept={DOC_ACCEPT} label="Attach invoice…" /></Field>
        <Field label="Note" className="sm:col-span-3"><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
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
      <Button busy={busy} onClick={() => run(async () => { await actions.stockReturn({ ...f, qty: Number(f.qty) }); toast('Return recorded'); onClose(); })}>Record return</Button>
    </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Training batch" required className="sm:col-span-2">
          <select className="input" value={f.batch_id} onChange={(e) => setF({ ...f, batch_id: e.target.value, item_id: '' })}>
            <option value="">Choose training…</option>{data.batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
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
      <Button busy={busy} onClick={() => run(async () => { await actions.stockAdjust({ ...f, qty: Number(f.qty) }); toast('Adjustment sent to HOD for approval'); onClose(); })}>Submit for approval</Button>
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
    name: item?.name ?? '', category: item?.category ?? ('Refreshments' as Category), classification: item?.classification ?? 'Consumable',
    unit: item?.unit ?? 'Piece', unit_cost: String(item?.unit_cost ?? ''), min_level: String(item?.min_level ?? ''), active: item?.active ?? true,
    item_group: item ? groupOf(item).id : '',
  });
  const { busy, error, run } = useSubmit();
  // undefined = keep current photo, null = remove, File = replace
  const [photo, setPhoto] = useState<File | null | undefined>(undefined);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  return (
    <Modal open onClose={onClose} title={item ? `Edit ${item.name}` : 'New inventory item'} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { await actions.saveItem({ ...f, item_group: f.item_group || null, id: item?.id, unit_cost: Number(f.unit_cost), min_level: Number(f.min_level) }, photo); toast('Item saved'); onClose(); })}>Save</Button>
    </>}>
      <div className="mb-4 flex items-center gap-4">
        {preview ? <img src={preview} alt="New photo" className="h-24 w-24 rounded-lg border border-silver-200 object-cover" /> : <Thumb att={photo === null ? null : item?.photo} alt={item?.name ?? ''} size={96} />}
        <div className="flex flex-col gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-silver-300 px-3 py-1.5 text-sm text-navy-800 hover:bg-silver-100">
            <Camera className="h-4 w-4" />{item?.photo || photo ? 'Change photo' : 'Add photo'}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { setPhoto(e.target.files?.[0] ?? undefined); e.target.value = ''; }} />
          </label>
          {(photo || (photo === undefined && item?.photo)) && <Button size="sm" variant="ghost" type="button" onClick={() => setPhoto(null)}><Trash2 className="h-4 w-4" />Remove photo</Button>}
          <span className="text-xs text-slate-500">Resized automatically before upload.</span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Unit" required><input className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
        <Field label="Name" required className="sm:col-span-2"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Category"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Category, item_group: '' })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Main item" hint="The icon card it appears under"><select className="input" value={f.item_group} onChange={(e) => setF({ ...f, item_group: e.target.value })}>
          <option value="">Choose automatically from the name</option>{groupsFor(f.category).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select></Field>
        <Field label="Classification"><select className="input" value={f.classification} onChange={(e) => setF({ ...f, classification: e.target.value as Item['classification'] })}>{CLASSIFICATIONS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Cost per unit (MMK)"><input className="input" type="number" min="0" value={f.unit_cost} onChange={(e) => setF({ ...f, unit_cost: e.target.value })} /></Field>
        <Field label="Minimum level" hint="Red alert at or below this"><input className="input" type="number" min="0" value={f.min_level} onChange={(e) => setF({ ...f, min_level: e.target.value })} /></Field>
        {item && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Active</label>}
      </div>
      {!item && <p className="mt-3 text-xs text-slate-500">New items start at zero. Use Stock in to add the opening quantity.</p>}
      <ErrorNote error={error} />
    </Modal>
  );
}

function CountTab({ month: viewMonth }: { month: string }) {
  const { data, actions, can, name } = useData();
  const toast = useToast();
  const [cat, setCat] = useState<Category>('Refreshments');
  const [month, setMonth] = useState(viewMonth || thisMonth());
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
              toast(`Count saved · ${r.adjustments} adjustment(s) sent for HOD approval`);
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
            <thead><tr><th>Month</th><th>Counted by</th><th className="num">Items</th><th className="num">Variances</th><th className="num">Net variance value</th></tr></thead>
            <tbody>
              {[...data.physical_counts].filter((c) => !viewMonth || c.month === viewMonth).reverse().map((c) => {
                const v = c.lines.filter((l) => l.counted_qty !== l.system_qty);
                const val = v.reduce((s, l) => s + (l.counted_qty - l.system_qty) * (data.items.find((i) => i.id === l.item_id)?.unit_cost ?? 0), 0);
                return <tr key={c.id}><td className="whitespace-nowrap font-medium text-navy-800">{monthLabel(c.month)}</td><td>{name(c.created_by)} <div className="text-xs text-slate-500">{dateTime(c.created_at)}</div></td><td className="num">{c.lines.length}</td><td className="num">{v.length}</td><td className="num">{mmk(val)}</td></tr>;
              })}
            </tbody>
          </table>
          {!data.physical_counts.some((c) => !viewMonth || c.month === viewMonth) && <Empty>{viewMonth ? `No physical count in ${monthLabel(viewMonth)}.` : 'No physical counts recorded yet.'}</Empty>}
        </div>
      </div>
    </div>
  );
}
