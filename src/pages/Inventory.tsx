import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowLeft, Camera, Info, LayoutGrid, List, Pencil, ShoppingBasket, Plus, RotateCcw, SlidersHorizontal, ClipboardCheck, Trash2 } from 'lucide-react';
import { stockMovement, type MovementRow } from './reportSpecs';
import { groupOf, groupsFor, iconFor, ICONS, type ItemGroup } from '../lib/itemGroups';
import { GlassArea, GlassBackdrop, glass } from '../components/glass';
import type { LucideIcon } from 'lucide-react';
import { MonthBar, useMonthParam } from '../components/MonthBar';
import { FileLink, FilePicker, Thumb, useFileUrl } from '../components/files';
import { DOC_ACCEPT } from '../lib/files';
import { useData } from '../lib/store';
import { canSplit, fmtPieces, fmtQty, fmtTxnQty, piecePrice, piecesIn, r6 } from '../lib/logic';
import { CLASSIFICATIONS, TXN_LABELS, type Category, type CountLine, type Item, type ReturnCondition } from '../lib/types';
import { date, dateTime, mmk, monthEnd, monthLabel, num, thisMonth } from '../lib/format';
import { Badge, Button, cx, Empty, ErrorNote, Field, Modal, PageHeader, SearchBox, StatusBadge, Tabs, useSubmit, useToast } from '../components/ui';
import { categoriesOf, tidyChoice } from '../lib/choices';
import { ComboInput } from '../components/ComboInput';

type Tab = 'items' | 'txns' | 'count';

export default function InventoryPage() {
  const { can } = useData();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>('items');
  const [month, setMonth] = useMonthParam();
  const { data } = useData();
  const [modal, setModal] = useState<null | 'return' | 'adjust' | { stockIn: string } | { item?: Item; group?: string }>(
    () => (params.get('stockin') === '1' && can('stock.create') ? { stockIn: '' } : null));
  return (
    <>
      <PageHeader title="Inventory" subtitle="Refreshments, training materials, YCP merchandise and office supplies"
        actions={can('stock.create') && <>
          <Button onClick={() => setModal({ stockIn: '' })}><ArrowDownToLine className="h-4 w-4" />Stock in</Button>
          <Button variant="secondary" onClick={() => setModal('return')}><RotateCcw className="h-4 w-4" />Return</Button>
          <Button variant="secondary" onClick={() => setModal('adjust')}><SlidersHorizontal className="h-4 w-4" />Adjust / write-off</Button>
        </>} />
      <MonthBar month={month} onChange={setMonth} allLabel="All months (current balance)"
        dates={[...data.stock_txns.map((t) => t.decided_at ?? t.created_at), ...data.physical_counts.map((c) => `${c.month}-01`)]}
        note={month ? `Balances as at ${date(monthEnd(month))}; movements in ${monthLabel(month)}` : 'Current balances and all transactions'} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'items', label: 'Stock on hand' }, { id: 'txns', label: 'Transactions' }, { id: 'count', label: 'Physical count' }]} />
      {tab === 'items' && <ItemsTab month={month} lowOnly={params.get('low') === '1'} initialCat={params.get('cat') ?? ''} onEdit={(item, group) => setModal({ item, group })} onStockIn={(id) => setModal({ stockIn: id })} />}
      {tab === 'txns' && <TxnsTab month={month} />}
      {tab === 'count' && <CountTab month={month} />}
      {modal && typeof modal === 'object' && 'stockIn' in modal && <StockInModal initialItem={modal.stockIn} onClose={() => setModal(null)} />}
      {modal === 'return' && <ReturnModal onClose={() => setModal(null)} />}
      {modal === 'adjust' && <AdjustModal onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && !('stockIn' in modal) && <ItemModal item={modal.item} initialGroup={modal.group} onClose={() => setModal(null)} />}
    </>
  );
}

const txnMonth = (t: { decided_at: string | null; created_at: string }) => (t.decided_at ?? t.created_at).slice(0, 7);

function ItemsTable({ rows, month, moves, onEdit }: { rows: Item[]; month: string; moves: Map<string, MovementRow> | null; onEdit: (i?: Item) => void }) {
  const { can, data } = useData();
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
                  <td className="whitespace-nowrap text-xs text-slate-500">{groupOf(i, data.item_groups).label}</td>
                  <td className="whitespace-nowrap">{i.category}</td>
                  {m && <>
                    <td className="num whitespace-nowrap text-slate-500">{fmtQty(i, m.opening)}</td>
                    <td className="num whitespace-nowrap text-emerald-700">{m.inQty + Math.max(0, m.adjusted) + m.returned ? `+${fmtQty(i, m.inQty + Math.max(0, m.adjusted) + m.returned)}` : '—'}</td>
                    <td className="num whitespace-nowrap text-kbz-red">{m.outQty - Math.min(0, m.adjusted) ? `−${fmtQty(i, m.outQty - Math.min(0, m.adjusted))}` : '—'}</td>
                  </>}
                  <td className="num"><span className={cx('whitespace-nowrap', isLow ? 'font-semibold text-red-600' : 'font-medium')}>{fmtQty(i, qty)}</span></td>
                  <td className="num text-slate-500">{num(i.min_level)}</td>
                  <td className="num">{num(i.unit_cost)}</td>
                  <td className="num">{num(Math.round(qty * i.unit_cost))}</td>
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

/** Item cards and details use one neutral style (white card, KBZ blue price). */
const NEUTRAL = { band: '', text: 'text-kbz-blue', soft: 'bg-navy-50' };
const CAT_TONE: Record<Category, typeof NEUTRAL> = {
  Refreshments: NEUTRAL, 'Training Materials': NEUTRAL, 'YCP Program': NEUTRAL, 'Office Supplies': NEUTRAL,
};
const pieceLabel = (i: Item) => i.piece_unit || 'piece';
const plural = (n: number, w: string) => (n === 1 || w.endsWith('s') ? w : `${w}s`);
const fmtPiece = (n: number) => (n >= 10 ? num(Math.round(n)) : n.toLocaleString('en-US', { maximumFractionDigits: 1 }));

/**
 * Shop-style view in two steps:
 *  1. the main item icon cards only (Coffee, Tea …);
 *  2. tap one to enter it and see just its item cards (with real photos).
 * The chosen main item is kept in the URL (?group=coffee) so browser Back returns to step 1.
 */
function ItemsTab({ month, lowOnly, initialCat, onEdit, onStockIn }: {
  month: string; lowOnly: boolean; initialCat: string; onEdit: (i?: Item, group?: string) => void; onStockIn: (itemId: string) => void;
}) {
  const { data, can } = useData();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | ''>(categoriesOf(data).includes(initialCat) ? initialCat : '');
  const [low, setLow] = useState(lowOnly);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [groupModal, setGroupModal] = useState<null | { group?: ItemGroup }>(null);
  const [detail, setDetail] = useState<Item | null>(null);
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
  const allCats = categoriesOf(data);
  const groups = groupsFor(cat, data.item_groups, allCats).map((g) => {
    const list = inCat.filter((i) => groupOf(i, data.item_groups).id === g.id);
    return { g, count: list.length, low: list.filter((i) => qtyOf(i) <= i.min_level).length };
  }).filter((x) => !low || x.low > 0); // every main item card shows, even before it has items
  const chosen = group === 'all' ? null : groupsFor('', data.item_groups, allCats).find((g) => g.id === group) ?? null;
  const manage = can('item.manage');
  const s = q.trim().toLowerCase();
  const searching = s.length > 0;
  // Items shown: inside a main item, or every match while searching, or everything in table view.
  const rows = useMemo(() => visible
    .filter((i) => (searching ? i.name.toLowerCase().includes(s) : group === 'all' || view === 'table' && !group ? !cat || i.category === cat : groupOf(i, data.item_groups).id === group))
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
            {['', ...categoriesOf(data)].map((c) => (
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
        {manage && <Button variant="secondary" onClick={() => onEdit(undefined, group || undefined)}><Plus className="h-4 w-4" />New item</Button>}
      </div>

      {showGroups ? (
        /* Step 1: main item icon cards only */
        <>
          <h3 className="mb-3 text-base font-bold text-kbz-dark">Choose a main item <span className="text-sm font-normal text-slate-500">· {groups.length} groups</span></h3>
          {groups.length === 0 ? <Empty>No items match.</Empty> : (
            <div className="relative isolate">
            <GlassBackdrop />
            <div className="grid grid-cols-2 gap-4 p-1 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6" role="list" aria-label="Main items">
              {groups.map(({ g, count, low: lowN }) => (
                <GroupCard key={g.id} label={g.label} count={count} low={lowN} onClick={() => setGroup(g.id)} Icon={g.icon}
                  onEdit={manage ? () => setGroupModal({ group: g }) : undefined} />
              ))}
              <GroupCard label="All items" count={inCat.length} onClick={() => setGroup('all')} Icon={LayoutGrid} muted />
              {manage && (
                <button onClick={() => setGroupModal({})}
                  className="flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-white/80 bg-white/25 px-3 py-6 text-center text-kbz-navy backdrop-blur-xl transition hover:bg-white/50">
                  <span className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-white/90 to-white/40 ring-1 ring-white/80 shadow-[inset_0_1px_8px_rgba(255,255,255,0.8)]"><Plus className="h-9 w-9" strokeWidth={1.4} /></span>
                  <span className="text-sm font-semibold">New main item</span>
                </button>
              )}
            </div>
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
            {chosen && !searching && manage && (
              <button onClick={() => setGroupModal({ group: chosen })} className="order-last inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 hover:text-kbz-navy sm:order-none" aria-label={`Edit main item ${chosen.label}`}>
                <Pencil className="h-3.5 w-3.5" />Edit main item
              </button>
            )}
            <h3 className="text-lg font-bold text-kbz-dark">
              {searching ? `Results for “${q.trim()}”` : chosen ? chosen.label : group === 'all' ? 'All items' : cat || 'All items'}
              <span className="ml-1 text-sm font-normal text-slate-500">· {rows.length} item{rows.length === 1 ? '' : 's'}</span>
            </h3>
            <span className="ml-auto text-xs text-slate-500">Value{month ? ` at end of ${monthLabel(month)}` : ''}: <b className="text-kbz-dark">{mmk(rows.reduce((t, i) => t + qtyOf(i) * i.unit_cost, 0))}</b></span>
          </div>
          {view === 'table' ? <ItemsTable rows={rows} month={month} moves={moves} onEdit={onEdit} /> : rows.length === 0 ? <Empty>No items match.</Empty> : (
            <GlassArea className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {rows.map((i) => <ProductCard key={i.id} item={i} qty={qtyOf(i)} showGroup={searching || group === 'all'} onOpen={() => setDetail(i)} onEdit={manage ? () => onEdit(i) : undefined} />)}
            </GlassArea>
          )}
          {chosen && !searching && rows.length === 0 && manage && (
            <div className="mt-3 text-center"><Button onClick={() => onEdit(undefined, chosen.id)}><Plus className="h-4 w-4" />Add the first item to {chosen.label}</Button></div>
          )}
        </>
      )}
      {groupModal && <GroupModal group={groupModal.group} defaultCategory={cat || 'Refreshments'} onClose={() => setGroupModal(null)}
        onDeleted={() => { setGroupModal(null); if (group) setGroup(''); }} />}
      {detail && <ItemDetailModal item={data.items.find((x) => x.id === detail.id) ?? detail} qty={qtyOf(data.items.find((x) => x.id === detail.id) ?? detail)}
        onClose={() => setDetail(null)} onEdit={manage ? () => { setDetail(null); onEdit(detail); } : undefined}
        onStockIn={can('stock.create') ? () => { setDetail(null); onStockIn(detail.id); } : undefined} />}
    </>
  );
}

function GroupCard({ label, count, low, onClick, Icon, muted, onEdit }: { label: string; count: number; low?: number; onClick: () => void; Icon: LucideIcon; muted?: boolean; onEdit?: () => void }) {
  const card = (
    <button onClick={onClick} role="listitem" aria-label={`${label}, ${count} item${count === 1 ? '' : 's'}${low ? `, ${low} low stock` : ''}`}
      className={cx('group relative flex h-full w-full flex-col items-center gap-3 overflow-hidden rounded-3xl border border-white/70 px-3 py-6 text-center backdrop-blur-xl transition duration-300',
        'shadow-[0_10px_30px_-12px_rgba(0,45,114,0.28),inset_0_1px_0_rgba(255,255,255,0.9)] hover:-translate-y-1 hover:bg-white/70 hover:shadow-[0_18px_40px_-14px_rgba(0,45,114,0.4),inset_0_1px_0_rgba(255,255,255,0.9)]',
        muted ? 'bg-white/30 text-slate-600' : 'bg-white/45 text-kbz-dark')}>
      {/* glass shine */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/60 to-transparent" />
      {!!low && <span className="absolute right-3 top-3 z-10 rounded-full bg-kbz-red px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">{low} low</span>}
      <span className="relative grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-white/95 to-white/40 text-kbz-navy ring-1 ring-white/80 shadow-[inset_0_1px_8px_rgba(255,255,255,0.9),0_8px_18px_-10px_rgba(0,45,114,0.45)] transition group-hover:from-kbz-navy group-hover:to-kbz-blue group-hover:text-white">
        <Icon className="h-9 w-9" strokeWidth={1.4} />
      </span>
      <span className="relative text-sm font-semibold leading-tight">{label}</span>
      <span className="relative -mt-2 text-[11px] text-slate-500">{count} item{count === 1 ? '' : 's'}</span>
    </button>
  );
  if (!onEdit) return card;
  return (
    <div className="group/card relative h-full w-full">
      {card}
      <button onClick={onEdit} aria-label={`Edit main item ${label}`} title="Rename / change icon"
        className="absolute left-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-white text-slate-400 opacity-0 shadow ring-1 ring-slate-200 transition hover:text-kbz-navy focus:opacity-100 group-hover/card:opacity-100">
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Create a main item, or rename / re-icon an existing one. */
function GroupModal({ group, defaultCategory, onClose, onDeleted }: { group?: ItemGroup; defaultCategory: Category; onClose: () => void; onDeleted: () => void }) {
  const { data, actions } = useData();
  const toast = useToast();
  const [label, setLabel] = useState(group?.label ?? '');
  const [category, setCategory] = useState<Category>(group?.category ?? defaultCategory);
  const [icon, setIcon] = useState(group?.iconName ?? 'Package');
  const [q, setQ] = useState('');
  const { busy, error, run } = useSubmit();
  const used = group ? data.items.filter((i) => groupOf(i, data.item_groups).id === group.id).length : 0;
  const Preview = iconFor(icon);
  const names = Object.keys(ICONS).filter((n) => !q.trim() || n.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Modal wide open onClose={onClose} title={group ? `Edit main item: ${group.label}` : 'New main item'} footer={<>
      {group?.custom && (
        <Button variant="ghost" className="mr-auto text-kbz-red" disabled={busy}
          onClick={() => run(async () => { await actions.deleteItemGroup(group.id); toast(`${group.label} deleted`); onDeleted(); })}>
          <Trash2 className="h-4 w-4" />Delete
        </Button>
      )}
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { await actions.saveItemGroup({ id: group?.id, label, category, icon }); toast(group ? 'Main item updated' : `${label.trim()} created`); onClose(); })}>
        {group ? 'Save' : 'Create main item'}
      </Button>
    </>}>
      <div className="grid gap-5 sm:grid-cols-[11rem_1fr]">
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-kbz-navy px-3 py-6 text-center text-white">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-white text-kbz-navy"><Preview className="h-9 w-9" strokeWidth={1.4} /></span>
          <span className="text-sm font-semibold">{label.trim() || 'Main item name'}</span>
          <span className="-mt-2 text-[11px] text-white/70">{group ? `${used} item${used === 1 ? '' : 's'}` : 'Preview'}</span>
        </div>
        <div className="space-y-3">
          <Field label="Name" required><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Juice, Notebooks, Prizes" autoFocus /></Field>
          <Field label="Category" hint={group ? 'The category of an existing main item cannot change.' : undefined}>
            {group ? <input className="input" value={category} disabled /> : <ComboInput value={category} onChange={setCategory} options={categoriesOf(data)} label="Category" />}
          </Field>
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-slate-600">Icon <span className="text-red-600">*</span></span>
          <input className="input w-44 py-1.5 text-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find icon (e.g. cup)" aria-label="Find icon" />
        </div>
        <div className="grid max-h-60 grid-cols-6 gap-2 overflow-y-auto rounded-2xl bg-slate-50 p-2 sm:grid-cols-10" role="radiogroup" aria-label="Icon">
          {names.map((n) => {
            const I = ICONS[n];
            return (
              <button key={n} type="button" role="radio" aria-checked={icon === n} aria-label={n} title={n} onClick={() => setIcon(n)}
                className={cx('grid aspect-square place-items-center rounded-xl transition', icon === n ? 'bg-kbz-navy text-white shadow' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-kbz-navy hover:ring-kbz-navy')}>
                <I className="h-5 w-5" strokeWidth={1.5} />
              </button>
            );
          })}
          {names.length === 0 && <p className="col-span-full py-4 text-center text-xs text-slate-400">No icon matches “{q}”.</p>}
        </div>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}

/** One item at a glance: price (also per piece), stock, last purchase, then short purchase and issue lists. */
function ItemDetailModal({ item: i, qty, onClose, onEdit, onStockIn }: { item: Item; qty: number; onClose: () => void; onEdit?: () => void; onStockIn?: () => void }) {
  const { data, can } = useData();
  const nav = useNavigate();
  const { url } = useFileUrl(i.photo);
  const g = groupOf(i, data.item_groups);
  const tone = CAT_TONE[i.category];
  const when = (t: { decided_at: string | null; created_at: string }) => t.decided_at ?? t.created_at;
  const txns = data.stock_txns.filter((t) => t.item_id === i.id).sort((a, b) => when(b).localeCompare(when(a)));
  const buys = txns.filter((t) => t.type === 'IN' && t.status !== 'Rejected');
  const lastBuy = buys.find((t) => t.status === 'Approved' && t.supplier !== 'Opening balance') ?? buys.find((t) => t.status === 'Approved');
  const issues = txns.filter((t) => t.type === 'OUT' && t.status === 'Approved');
  const topic = (id: string | null) => data.batches.find((b) => b.id === id)?.name ?? '—';
  const piece = piecePrice(i);
  const pu = pieceLabel(i);
  const out = qty <= 0;
  const isLow = !out && qty <= i.min_level;
  return (
    <Modal wide open onClose={onClose} title={i.name} footer={<>
      {onEdit && <Button variant="secondary" className="mr-auto" onClick={onEdit}><Pencil className="h-4 w-4" />Edit item</Button>}
      {onStockIn && <Button variant="success" onClick={onStockIn}><ArrowDownToLine className="h-4 w-4" />Stock in</Button>}
      {can('request.create') && i.active && <Button disabled={out} onClick={() => nav(`/requests?new=1&item=${i.id}`)}><ShoppingBasket className="h-4 w-4" />Request</Button>}
    </>}>
      <div className="grid gap-5 sm:grid-cols-[13rem_1fr]">
        <div className="rounded-2xl p-2.5 ring-1 ring-slate-200">
          <div className="grid h-48 place-items-center overflow-hidden rounded-xl bg-white">
            {url ? <img src={url} alt={i.name} className="h-48 w-full object-contain" />
              : <span className={cx('grid h-24 w-24 place-items-center rounded-full', tone.soft, tone.text)}><g.icon className="h-12 w-12" strokeWidth={1.25} /></span>}
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold', tone.soft, tone.text)}><g.icon className="h-3.5 w-3.5" />{g.label}</span>
            <span className="text-slate-500">{i.category}</span>
            {(out || isLow) && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-bold uppercase text-kbz-red">{out ? 'Out of stock' : 'Low stock'}</span>}
            {!i.active && <Badge>Inactive</Badge>}
          </div>

          <div className={cx('mt-3 rounded-2xl p-4', tone.soft)}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Price</div>
            <div className={cx('mt-1 text-2xl font-bold tabular-nums', tone.text)}>{num(i.unit_cost)} <span className="text-sm font-medium text-slate-500">MMK per {i.unit.toLowerCase()}</span></div>
            {piece !== null ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-slate-700">
                <span>1 {i.unit.toLowerCase()} = <b>{num(i.pack_qty!)} {plural(i.pack_qty!, pu)}</b></span>
                <span className="text-slate-400">→</span>
                <span><b className={tone.text}>{fmtPiece(piece)} MMK</b> per {pu}</span>
              </div>
            ) : <div className="mt-1 text-xs text-slate-400">Sold as a whole {i.unit.toLowerCase()} (not split into pieces).</div>}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <div className="text-[11px] text-slate-500">In stock</div>
              <div className={cx('text-base font-bold tabular-nums', out || isLow ? 'text-kbz-red' : 'text-kbz-dark')}>{fmtQty(i, qty)}</div>
              <div className="text-[11px] text-slate-400">{piece !== null ? `${fmtPieces(i, piecesIn(i, qty))} · ` : ''}min {num(i.min_level)}</div>
            </div>
            <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <div className="text-[11px] text-slate-500">Last bought</div>
              <div className="text-base font-bold text-kbz-dark">{lastBuy ? date(when(lastBuy)) : '—'}</div>
              <div className="truncate text-[11px] text-slate-400">{lastBuy ? `${num(lastBuy.qty)} ${i.unit} × ${num(lastBuy.unit_cost)}` : 'No purchase yet'}</div>
            </div>
            <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <div className="text-[11px] text-slate-500">Stock value</div>
              <div className="text-base font-bold tabular-nums text-kbz-dark">{num(Math.round(qty * i.unit_cost))}</div>
              <div className="text-[11px] text-slate-400">MMK</div>
            </div>
          </div>
        </div>
      </div>

      <h4 className="mb-2 mt-6 text-sm font-bold text-kbz-dark">Purchases</h4>
      {buys.length === 0 ? <p className="text-sm text-slate-400">No purchases recorded yet.</p> : (
        <ul className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
          {buys.slice(0, 5).map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
              <span className="w-24 shrink-0 text-slate-600">{date(when(t))}</span>
              <span className="min-w-0 flex-1 tabular-nums"><b>{num(t.qty)}</b> {i.unit} × {num(t.unit_cost)}{i.pack_qty && i.pack_qty > 1 ? <span className="text-slate-400"> ({fmtPiece(t.unit_cost / i.pack_qty)} / {pu})</span> : null}</span>
              <b className="tabular-nums">{num(t.qty * t.unit_cost)} MMK</b>
              {t.supplier === 'Opening balance' ? <span className="text-[11px] text-slate-400">Opening stock</span> : t.attachment ? <FileLink att={t.attachment} className="text-xs" /> : null}
              {t.status !== 'Approved' && <StatusBadge status={t.status} />}
            </li>
          ))}
        </ul>
      )}

      <h4 className="mb-2 mt-5 text-sm font-bold text-kbz-dark">Given to trainings</h4>
      {issues.length === 0 ? <p className="text-sm text-slate-400">Not given to any training yet.</p> : (
        <ul className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
          {issues.slice(0, 5).map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
              <span className="w-24 shrink-0 text-slate-600">{date(when(t))}</span>
              <span className="min-w-0 flex-1 truncate">{topic(t.batch_id)}</span>
              <b className="tabular-nums">{fmtTxnQty(t, i)}</b>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function ProductCard({ item: i, qty, onEdit, onOpen, showGroup }: { item: Item; qty: number; onEdit?: () => void; onOpen: () => void; showGroup?: boolean }) {
  const { can, actions, data } = useData();
  const toast = useToast();
  const g = groupOf(i, data.item_groups);
  const tone = CAT_TONE[i.category];
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
        min_level: i.min_level, active: i.active, item_group: i.item_group, pack_qty: i.pack_qty ?? null, piece_unit: i.piece_unit ?? null }, file);
      toast(`Photo saved for ${i.name}`);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setUploading(false); }
  };
  const photoInput = canPhoto && <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={uploading} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />;
  return (
    <div className={cx('group relative flex flex-col overflow-hidden rounded-3xl transition duration-300 hover:-translate-y-1 hover:bg-white/70', glass, !i.active && 'opacity-60')}>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/60 to-transparent" />
      <div className="relative p-3 pb-0">
        {(out || isLow || !i.active) && (
          <span className={cx('absolute left-3 top-3 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', !i.active ? 'bg-slate-200 text-slate-600' : out ? 'bg-slate-700 text-white' : 'bg-rose-100 text-kbz-red')}>
            {!i.active ? 'Inactive' : out ? 'Out of stock' : 'Low stock'}
          </span>
        )}
        {onEdit && (
          <button onClick={onEdit} className="absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-slate-400 ring-1 ring-slate-200 hover:text-kbz-navy" aria-label={`Edit ${i.name}`}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="relative mt-7 h-36 overflow-hidden rounded-2xl bg-white/85 ring-1 ring-white">
          {url ? (
            <button onClick={onOpen} className="block h-36 w-full" aria-label={`Photo of ${i.name}`}><img src={url} alt={i.name} className="h-36 w-full object-contain" loading="lazy" /></button>
          ) : canPhoto ? (
            <label className={cx('flex h-36 cursor-pointer flex-col items-center justify-center gap-1.5 text-slate-400 transition hover:text-kbz-navy', uploading && 'animate-pulse')}>
              <span className={cx('grid h-14 w-14 place-items-center rounded-full', tone.soft, tone.text)}><g.icon className="h-7 w-7" strokeWidth={1.4} /></span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold"><Camera className="h-3.5 w-3.5" />{uploading ? 'Uploading…' : 'Add photo'}</span>
              {photoInput}
            </label>
          ) : (
            <button onClick={onOpen} className="flex h-36 w-full items-center justify-center" aria-label={`Photo of ${i.name}`}>
              <span className={cx('grid h-20 w-20 place-items-center rounded-full', tone.soft, tone.text)}><g.icon className="h-10 w-10" strokeWidth={1.3} /></span>
            </button>
          )}
          {url && canPhoto && (
            <label className="absolute bottom-1 right-1 grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-white/90 text-slate-500 opacity-0 shadow ring-1 ring-slate-200 transition hover:text-kbz-navy group-hover:opacity-100 focus-within:opacity-100" title="Change photo" aria-label={`Change photo of ${i.name}`}>
              <Camera className="h-3.5 w-3.5" />{photoInput}
            </label>
          )}
        </div>
      </div>
      <div className="relative flex flex-1 flex-col p-3">
        <div className="text-[11px] text-slate-500">{showGroup ? `${g.label} · ` : ''}{i.unit}{i.pack_qty ? ` of ${i.pack_qty} ${plural(i.pack_qty, pieceLabel(i))}` : ''}</div>
        <button onClick={onOpen} className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-left text-sm font-semibold leading-snug text-kbz-dark hover:underline">{i.name}</button>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            <div className={cx('text-sm font-bold tabular-nums', tone.text)}>{num(i.unit_cost)} <span className="text-[11px] font-medium text-slate-400">MMK / {i.unit}</span></div>
            <div className={cx('text-[11px] font-semibold tabular-nums', out || isLow ? 'text-kbz-red' : 'text-emerald-700')}>{fmtQty(i, qty)} in stock</div>
          </div>
          <button onClick={onOpen} aria-label={`Details of ${i.name}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/80 px-3 py-2 text-xs font-semibold text-kbz-dark ring-1 ring-white shadow-sm transition hover:bg-kbz-navy hover:text-white">
            <Info className="h-3.5 w-3.5" />Details
          </button>
        </div>
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
                <td className="num whitespace-nowrap">{t.type === 'OUT' ? '−' : t.type === 'ADJUST' && t.qty < 0 ? '−' : '+'}{(() => { const it = item(t.item_id); return it ? fmtTxnQty(t, it) : num(Math.abs(t.qty)); })()}</td>
                <td className="num">{num(t.unit_cost)}</td>
                <td className="num font-medium">{num(Math.round(Math.abs(t.qty) * t.unit_cost))}</td>
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
      {categoriesOf(data).map((c) => {
        const list = data.items.filter((i) => i.category === c && i.active && (!filter || filter(i)));
        return list.length ? <optgroup key={c} label={c}>{list.map((i) => <option key={i.id} value={i.id}>{i.name} ({fmtQty(i, i.qty_on_hand)})</option>)}</optgroup> : null;
      })}
    </select>
  );
}

function StockInModal({ onClose, initialItem = '' }: { onClose: () => void; initialItem?: string }) {
  const { data, actions } = useData();
  const toast = useToast();
  const [f, setF] = useState(() => {
    const it0 = data.items.find((i) => i.id === initialItem);
    return { item_id: it0?.id ?? '', qty: '', unit_cost: it0 ? String(it0.unit_cost) : '', total: '', reason: '' };
  });
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
  const [f, setF] = useState({ batch_id: '', item_id: '', qty: '', by_piece: false, condition: 'Good' as ReturnCondition, reason: '' });
  const picked = data.items.find((i) => i.id === f.item_id);
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
        <Field label="Item issued to this batch" required className="sm:col-span-2"><ItemPicker value={f.item_id} onChange={(v) => setF({ ...f, item_id: v, by_piece: false })} filter={(i) => issuedItems.has(i.id)} /></Field>
        <Field label="Quantity" required>
          <div className="flex gap-2">
            <input className="input min-w-0 flex-1" type="number" min="1" step="1" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
            {picked && canSplit(picked) && (
              <select className="input w-auto" value={f.by_piece ? 'piece' : 'unit'} onChange={(e) => setF({ ...f, by_piece: e.target.value === 'piece' })} aria-label="Return by">
                <option value="unit">{picked.unit}</option><option value="piece">{picked.piece_unit || 'piece'}</option>
              </select>
            )}
          </div>
        </Field>
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

function ItemModal({ item, onClose, initialGroup }: { item?: Item; onClose: () => void; initialGroup?: string }) {
  const { actions, data } = useData();
  const toast = useToast();
  const [f, setF] = useState({
    name: item?.name ?? '', category: item?.category ?? groupsFor('', data.item_groups).find((g) => g.id === initialGroup)?.category ?? ('Refreshments' as Category), classification: item?.classification ?? 'Consumable',
    unit: item?.unit ?? 'Piece', unit_cost: String(item?.unit_cost ?? ''), min_level: String(item?.min_level ?? ''), active: item?.active ?? true,
    pack_qty: item?.pack_qty ? String(item.pack_qty) : '', piece_unit: item?.piece_unit ?? '',
    // Main item is typed or chosen by name; a new name becomes a new main item card on save.
    group_label: item ? groupOf(item, data.item_groups).label : initialGroup && initialGroup !== 'all' ? groupsFor('', data.item_groups, categoriesOf(data)).find((g) => g.id === initialGroup)?.label ?? '' : '',
  });
  const categories = categoriesOf(data);
  const groupChoices = groupsFor(tidyChoice(f.category, categories), data.item_groups);
  const { busy, error, run } = useSubmit();
  // undefined = keep current photo, null = remove, File = replace
  const [photo, setPhoto] = useState<File | null | undefined>(undefined);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  return (
    <Modal open onClose={onClose} title={item ? `Edit ${item.name}` : 'New inventory item'} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => {
        const category = tidyChoice(f.category, categories);
        if (!category) throw new Error('Type or choose a category.');
        const label = f.group_label.trim();
        let item_group: string | null = null;
        if (label) {
          const found = groupsFor(category, data.item_groups).find((g) => g.label.toLowerCase() === label.toLowerCase());
          item_group = found ? found.id : (await actions.saveItemGroup({ label, category, icon: 'Package' })).id;
        }
        const { group_label: _ignored, ...rest } = f;
        void _ignored;
        await actions.saveItem({ ...rest, category, item_group, id: item?.id, unit_cost: Number(f.unit_cost), min_level: Number(f.min_level),
          pack_qty: f.pack_qty.trim() ? Number(f.pack_qty) : null, piece_unit: f.piece_unit.trim() || null }, photo);
        toast('Item saved'); onClose();
      })}>Save</Button>
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
        <Field label="Unit (ယူနစ်)" required hint="Pack, Box, Bottle, Piece…"><input className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} aria-label="Unit" /></Field>
        <Field label="Name" required className="sm:col-span-2"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Category" hint="Choose, or type a new category"><ComboInput value={f.category} onChange={(v) => setF({ ...f, category: v })} options={categories} label="Category" /></Field>
        <Field label="Main item" hint="The card it appears under. Empty = chosen from the name; a new name makes a new card.">
          <ComboInput value={f.group_label} onChange={(v) => setF({ ...f, group_label: v })} options={groupChoices.map((g) => g.label)} placeholder="e.g. Coffee, Tea, Notebooks" label="Main item" />
        </Field>
        <Field label="Classification"><select className="input" value={f.classification} onChange={(e) => setF({ ...f, classification: e.target.value as Item['classification'] })}>{CLASSIFICATIONS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Cost per unit (MMK)"><input className="input" type="number" min="0" value={f.unit_cost} onChange={(e) => setF({ ...f, unit_cost: e.target.value })} /></Field>
        <Field label="Minimum level" hint="Red alert at or below this"><input className="input" type="number" min="0" value={f.min_level} onChange={(e) => setF({ ...f, min_level: e.target.value })} /></Field>
        <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
          <div className="mb-2 text-xs font-semibold text-slate-600">Pieces inside one {f.unit.trim() || 'unit'} <span className="font-normal text-slate-400">(optional, e.g. 1 Pack = 20 sachets)</span></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="How many pieces"><input className="input" type="number" min="2" step="1" value={f.pack_qty} onChange={(e) => setF({ ...f, pack_qty: e.target.value })} placeholder="e.g. 20" /></Field>
            <Field label="Name of one piece"><input className="input" value={f.piece_unit} onChange={(e) => setF({ ...f, piece_unit: e.target.value })} placeholder="e.g. sachet, cup, piece" /></Field>
          </div>
          {Number(f.pack_qty) > 1 && Number(f.unit_cost) > 0 && (
            <p className="mt-2 text-xs text-slate-600">= <b className="text-kbz-blue">{num(Math.round(Number(f.unit_cost) / Number(f.pack_qty)))} MMK</b> per {f.piece_unit.trim() || 'piece'}</p>
          )}
        </div>
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
  // Split items are counted in single pieces (e.g. 45 sachets), others in whole units.
  const sysCount = (i: Item) => (canSplit(i) ? piecesIn(i, i.qty_on_hand) : i.qty_on_hand);
  const toUnits = (i: Item, v: string) => (canSplit(i) ? r6(Number(v) / i.pack_qty!) : Number(v));
  const variances = entered.filter((i) => Number(counted[i.id]) !== sysCount(i)).length;
  return (
    <div className="space-y-6">
      {can('count.create') && (
        <div className="rounded-xl border border-silver-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Field label="Count month"><input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
            <Field label="Category"><select className="input" value={cat} onChange={(e) => { setCat(e.target.value as Category); setCounted({}); }}>{categoriesOf(data).map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Button variant="secondary" onClick={() => setCounted(Object.fromEntries(items.map((i) => [i.id, String(sysCount(i))])))}>Fill with system qty</Button>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Item</th><th className="num">System</th><th className="num">Counted</th><th className="num">Variance</th></tr></thead>
              <tbody>
                {items.map((i) => {
                  const v = counted[i.id];
                  const diff = v === undefined || v === '' ? null : Number(v) - sysCount(i);
                  const split = canSplit(i);
                  const show = (n: number) => (split ? fmtPieces(i, Math.abs(n)) : num(Math.abs(n)));
                  return (
                    <tr key={i.id}>
                      <td>{i.name}</td><td className="num whitespace-nowrap">{fmtQty(i, i.qty_on_hand)}</td>
                      <td className="num"><div className="flex items-center justify-end gap-1.5"><input className="input w-24 text-right" type="number" min="0" step="1" value={v ?? ''} onChange={(e) => setCounted({ ...counted, [i.id]: e.target.value })} aria-label={`Counted ${i.name}`} /><span className="w-14 text-left text-xs text-slate-500">{split ? `${i.piece_unit || 'piece'}s` : i.unit}</span></div></td>
                      <td className={`num whitespace-nowrap font-medium ${diff ? (diff < 0 ? 'text-red-600' : 'text-emerald-700') : 'text-slate-400'}`}>{diff === null ? '' : diff > 0 ? `+${show(diff)}` : diff < 0 ? `−${show(diff)}` : '0'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="Note" className="min-w-60 flex-1"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Counted by…, location…" /></Field>
            <Button busy={busy} disabled={!entered.length} onClick={() => run(async () => {
              const lines: CountLine[] = entered.map((i) => ({ item_id: i.id, system_qty: i.qty_on_hand, counted_qty: toUnits(i, counted[i.id]) }));
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
