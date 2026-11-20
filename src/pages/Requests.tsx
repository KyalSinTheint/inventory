import { useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import { GlassArea, notchMask } from '../components/glass';
import { useData } from '../lib/store';
import { type MaterialRequest, type RequestLine } from '../lib/types';
import { canSplit, fmtPieces, fmtQty, lineAmount, linePieces, piecesIn, requestValue } from '../lib/logic';
import { date, mmk, monthLabel, num } from '../lib/format';
import { MonthBar, useMonthParam } from '../components/MonthBar';
import { FileLink, FilePicker } from '../components/files';
import { EXCEL_ACCEPT } from '../lib/files';
import { Button, cx, Empty, ErrorNote, Field, Modal, PageHeader, useSubmit, useToast } from '../components/ui';
import { TrainingPicker } from '../components/TrainingPicker';
import { RequestLinesTable } from '../components/RequestLines';
import { categoriesOf } from '../lib/choices';

export default function RequestsPage() {
  const { data, can } = useData();
  const [params] = useSearchParams();
  const [edit, setEdit] = useState<MaterialRequest | 'new' | null>(() => (params.get('new') === '1' && can('request.create') ? 'new' : null));
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [month, setMonth] = useMonthParam();
  const rows = useMemo(() => data.material_requests.filter((r) => (!status || r.status === status) && (!month || r.created_at.startsWith(month)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at)), [data.material_requests, status, month]);
  const openReq = open ? data.material_requests.find((r) => r.id === open) ?? null : null;
  return (
    <>
      <PageHeader title="Material Requests" subtitle="Request materials for a training batch. Stock is issued when the L&D HOD approves."
        actions={can('request.create') && <Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />New request</Button>} />
      <MonthBar month={month} onChange={setMonth} dates={data.material_requests.map((r) => r.created_at)} note={month ? `Requests made in ${monthLabel(month)}` : 'All requests'} />
      <select className="input mb-4 w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option><option>Pending</option><option>Approved</option><option>Rejected</option></select>
      {rows.length === 0 ? <Empty>No requests.</Empty> : (
        <GlassArea className="grid gap-5 lg:grid-cols-2">
          {rows.map((r) => <RequestTicket key={r.id} r={r} onOpen={() => setOpen(r.id)} />)}
        </GlassArea>
      )}
      {openReq && <RequestDetail r={openReq} onClose={() => setOpen(null)} onRevise={() => { setOpen(null); setEdit(openReq); }} />}
      {edit && <RequestModal request={edit === 'new' ? undefined : edit} initialItem={edit === 'new' ? params.get('item') ?? undefined : undefined} onClose={() => setEdit(null)} />}
    </>
  );
}

const STATUS_PILL: Record<MaterialRequest['status'], { text: string; cls: string }> = {
  Pending: { text: 'Waiting for HOD', cls: 'bg-amber-100/90 text-amber-800' },
  Approved: { text: 'Approved · issued', cls: 'bg-emerald-100/90 text-emerald-700' },
  Rejected: { text: 'Rejected', cls: 'bg-rose-100/90 text-kbz-red' },
};

/** A material request drawn as a glass ticket: store → training, then items / qty / value. */
function RequestTicket({ r, onOpen }: { r: MaterialRequest; onOpen: () => void }) {
  const { data, name } = useData();
  const b = data.batches.find((x) => x.id === r.batch_id);
  // Whole units and single pieces are counted apart: "12 + 15 pcs".
  const units = r.lines.reduce((t, l) => t + (l.by_piece ? 0 : l.qty), 0);
  const pcs = r.lines.reduce((t, l) => t + (l.by_piece ? l.qty : 0), 0);
  const pill = STATUS_PILL[r.status];
  return (
    <article className="group transition duration-300 hover:-translate-y-1" aria-label={`Request for ${b?.name ?? 'training'}, ${r.status}`}>
      {/* top half: notches cut at its bottom corners */}
      <div className="relative rounded-t-3xl border border-b-0 border-white/70 bg-white/55 px-5 pb-6 pt-5 backdrop-blur-xl sm:px-6" style={notchMask('bottom')}>
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-16 rounded-t-3xl bg-gradient-to-b from-white/70 to-transparent" />
        <div className="relative flex items-center justify-between gap-3">
          <span className="text-sm font-semibold tracking-tight text-kbz-navy">Material Request</span>
          <span className={cx('rounded-full px-3 py-1 text-xs font-semibold', pill.cls)}>{pill.text}</span>
        </div>
        <div className="relative mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-bold text-kbz-dark sm:text-lg">L&amp;D Store</div>
            <div className="truncate text-xs text-slate-500">by {name(r.created_by)}</div>
            <div className="mt-1 text-sm text-slate-700">{date(r.created_at)}</div>
          </div>
          <div className="flex flex-col items-center pt-1 text-center">
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="hidden w-8 border-t-2 border-dashed border-slate-300 sm:block" />
              <ClipboardList className="h-5 w-5 text-kbz-blue" />
              <span className="hidden w-8 border-t-2 border-dashed border-slate-300 sm:block" />
            </div>
            <div className="mt-1 text-xs text-slate-500">{r.lines.length} item{r.lines.length === 1 ? '' : 's'}</div>
            <div className="text-[11px] text-slate-400">{r.status === 'Approved' ? 'Issued' : 'To issue'}</div>
          </div>
          <div className="min-w-0 text-right">
            <div className="line-clamp-2 text-base font-bold leading-tight text-kbz-dark sm:text-lg">{b?.name ?? '—'}</div>
            <div className="truncate text-xs text-slate-500">{b?.program}{b?.location ? ` · ${b.location}` : ''}</div>
            {b?.start_date && <div className="mt-1 text-sm text-slate-700">{date(b.start_date)}</div>}
          </div>
        </div>
      </div>
      {/* dashed tear line */}
      <div className="relative mx-5 border-t-2 border-dashed border-white/90" />
      {/* bottom half: notches cut at its top corners */}
      <div className="relative flex flex-col gap-4 rounded-b-3xl border border-t-0 border-white/70 bg-white/55 px-5 pb-5 pt-5 backdrop-blur-xl sm:flex-row sm:items-end sm:px-6" style={notchMask('top')}>
        <div className="grid flex-1 grid-cols-3 gap-3">
          <div><div className="text-xs text-slate-500">Items</div><div className="text-lg font-semibold tabular-nums text-kbz-dark">{r.lines.length}</div></div>
          <div><div className="text-xs text-slate-500">Total qty</div><div className="text-lg font-semibold tabular-nums text-kbz-dark">{units || !pcs ? num(units) : ''}{units && pcs ? <span className="text-slate-400"> + </span> : null}{pcs ? <>{num(pcs)}<span className="ml-0.5 text-[11px] font-medium text-slate-400">pcs</span></> : null}</div></div>
          <div className="min-w-0"><div className="text-xs text-slate-500">Value</div><div className="truncate text-lg font-bold tabular-nums text-kbz-blue">{num(requestValue(r, data.items))}<span className="ml-1 text-[11px] font-medium text-slate-400">MMK</span></div></div>
        </div>
        <button onClick={onOpen} className="w-full shrink-0 rounded-xl bg-kbz-navy px-4 py-2.5 sm:w-auto text-sm font-semibold text-white shadow-[0_8px_18px_-8px_rgba(0,45,114,0.7)] transition hover:bg-kbz-blue">View Details</button>
      </div>
    </article>
  );
}

function RequestDetail({ r, onClose, onRevise }: { r: MaterialRequest; onClose: () => void; onRevise: () => void }) {
  const { data, can, name, user, actions } = useData();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const del = useSubmit();
  const mine = r.created_by === user.id && r.status !== 'Approved';
  const b = data.batches.find((x) => x.id === r.batch_id);
  const pill = STATUS_PILL[r.status];
  return (
    <Modal wide open onClose={onClose} title={`Material request · ${b?.name ?? ''}`} footer={<>
      {mine && (confirmDelete ? (
        <span className="mr-auto flex flex-wrap items-center gap-2 text-sm">
          <span className="text-kbz-red">Delete this request?</span>
          <Button size="sm" variant="danger" busy={del.busy} onClick={() => del.run(async () => { await actions.deleteRequest(r.id); toast('Request deleted (kept in the audit log)'); onClose(); })}><Trash2 className="h-4 w-4" />Yes, delete</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>No</Button>
        </span>
      ) : <Button variant="ghost" className="text-kbz-red" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" />Delete</Button>)}
      {r.status === 'Rejected' && can('request.create') && <Button variant="secondary" className={mine ? undefined : 'mr-auto'} onClick={onRevise}><Pencil className="h-4 w-4" />Revise &amp; resubmit</Button>}
      <Button onClick={onClose}>Close</Button>
    </>}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cx('rounded-full px-3 py-1 text-xs font-semibold', pill.cls)}>{pill.text}</span>
        <span className="text-slate-500">Requested by <b className="text-kbz-dark">{name(r.created_by)}</b> on {date(r.created_at)}</span>
        {r.decided_by && <span className="text-slate-500">· decided by <b className="text-kbz-dark">{name(r.decided_by)}</b> on {date(r.decided_at)}</span>}
      </div>
      {r.decision_note && <p className={cx('mt-3 rounded-xl px-3 py-2 text-sm', r.status === 'Rejected' ? 'bg-rose-50 text-kbz-red' : 'bg-slate-50 text-slate-700')}>HOD: {r.decision_note}</p>}
      {(r.purpose || r.remarks) && (
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
          {r.purpose && <div className="font-semibold text-kbz-dark">{r.purpose}</div>}
          {r.remarks && <p className="mt-1 whitespace-pre-line text-slate-600">{r.remarks}</p>}
        </div>
      )}
      {r.attachment && <div className="mt-3 text-sm"><FileLink att={r.attachment} /></div>}
      <h4 className="mb-2 mt-5 text-sm font-bold text-kbz-dark">Items</h4>
      <RequestLinesTable lines={r.lines} items={data.items} pending={r.status === 'Pending'} />
      <ErrorNote error={del.error} />
    </Modal>
  );
}

type FormLine = { text: string; item_id: string; qty: string; by_piece: boolean; unit: string; cost: string; pack: string };

function RequestModal({ request, initialItem, onClose }: { request?: MaterialRequest; initialItem?: string; onClose: () => void }) {
  const { data, actions } = useData();
  const toast = useToast();
  const batches = data.batches.filter((b) => b.status !== 'Completed' || b.id === request?.batch_id);
  const [batchId, setBatchId] = useState(request?.batch_id ?? batches[0]?.id ?? '');
  const [purpose, setPurpose] = useState(request?.purpose ?? '');
  const [remarks, setRemarks] = useState(request?.remarks ?? '');
  const [file, setFile] = useState<File[]>([]);
  const [removeFile, setRemoveFile] = useState(false);
  const item = (id: string) => data.items.find((i) => i.id === id);
  const active = data.items.filter((i) => i.active);
  const blank: FormLine = { text: '', item_id: '', qty: '', by_piece: false, unit: '', cost: '', pack: '' };
  const [lines, setLines] = useState<FormLine[]>(() => request?.lines.map((l) => ({
    text: l.item_id ? item(l.item_id)?.name ?? '' : l.name ?? '', item_id: l.item_id, qty: String(l.qty), by_piece: !!l.by_piece,
    unit: l.unit ?? '', cost: l.unit_cost ? String(l.unit_cost) : '', pack: l.pack_qty ? String(l.pack_qty) : '',
  })) ?? [initialItem && item(initialItem) ? { ...blank, text: item(initialItem)!.name, item_id: initialItem } : blank]);
  const { busy, error, run } = useSubmit();
  // Typing the exact name of a store item links the line to it; anything else is a typed item.
  const match = (text: string) => active.find((i) => i.name.trim().toLowerCase() === text.trim().toLowerCase());
  const toLine = (l: FormLine): RequestLine => l.item_id
    ? { item_id: l.item_id, qty: Number(l.qty), ...(l.by_piece && canSplit(item(l.item_id) ?? { pack_qty: null }) ? { by_piece: true } : {}) }
    : { item_id: '', qty: Number(l.qty), name: l.text, unit: l.unit, ...(l.cost ? { unit_cost: Number(l.cost) } : {}), ...(Number(l.pack) > 1 ? { pack_qty: Number(l.pack) } : {}) };
  const total = lines.reduce((s, l) => s + (l.qty && (l.item_id || l.text.trim()) ? lineAmount(toLine(l), data.items) : 0), 0);
  const setLine = (idx: number, patch: Partial<FormLine>) => setLines(lines.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  return (
    <Modal wide open onClose={onClose} title={request ? 'Revise material request' : 'New material request'} footer={<>
      <span className="mr-auto self-center text-sm text-slate-600">Estimated value: <b>{mmk(total)}</b></span>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => {
        await actions.saveRequest({ id: request?.id, batch_id: batchId, purpose, remarks, lines: lines.filter((l) => l.item_id || l.text.trim() || l.qty).map(toLine) },
          file[0] ?? (removeFile ? null : undefined));
        toast('Request sent to HOD for approval'); onClose();
      })}>Submit for approval</Button>
    </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Training" required hint="Type to search, or type a new name to add it."><TrainingPicker value={batchId} onChange={setBatchId} batches={batches} required /></Field>
        <Field label="Purpose"><input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Day 1–3 refreshments for 30 trainees" /></Field>
        <Field label="Remarks" className="sm:col-span-2"><textarea className="input min-h-24" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Details for the HOD: number of trainees, delivery date, sizes, special instructions…" /></Field>
        <Field label="Attachment (Excel list, etc.)" className="sm:col-span-2" hint="Excel, CSV, PDF or photo">
          {request?.attachment && !removeFile && !file.length ? (
            <div className="flex items-center gap-3 text-sm"><FileLink att={request.attachment} /><Button size="sm" variant="ghost" type="button" onClick={() => setRemoveFile(true)}>Remove</Button></div>
          ) : <FilePicker files={file} onChange={setFile} accept={EXCEL_ACCEPT} label="Attach Excel file…" />}
        </Field>
      </div>
      <div className="mt-4">
        <h4 className="text-sm font-semibold text-kbz-dark">Items</h4>
        <p className="mb-2 text-xs text-slate-500">Type any item, or pick one from the store list that appears as you type. Typed items that are not in the store are approved without taking stock.</p>
        <datalist id="store-items">
          {categoriesOf(data).flatMap((c) => active.filter((i) => i.category === c).map((i) => (
            <option key={i.id} value={i.name}>{i.qty_on_hand > 0 ? `${fmtQty(i, i.qty_on_hand)} in store` : 'out of stock'}</option>
          )))}
        </datalist>
        <div className="space-y-3">
          {lines.map((l, idx) => {
            const it = l.item_id ? item(l.item_id) : undefined;
            const split = !!it && canSplit(it);
            const piece = split && l.by_piece;
            const have = it ? (split ? piecesIn(it, it.qty_on_hand) : it.qty_on_hand) : 0;
            const want = it && l.qty ? linePieces(toLine(l), it) : 0;
            const over = !!it && want > have;
            const max = it ? (piece ? fmtPieces(it, have) : `${Math.floor(split ? have / it.pack_qty! : have)} ${it.unit}`) : '';
            const typed = !it && l.text.trim() !== '';
            return (
              <div key={idx} className="rounded-2xl bg-slate-50/70 p-2 ring-1 ring-slate-200/70">
                <div className="flex flex-wrap items-start gap-2">
                  <input className="input min-w-0 flex-1 basis-56" list="store-items" value={l.text} aria-label="Item"
                    placeholder="Type or choose an item…"
                    onChange={(e) => { const m = match(e.target.value); setLine(idx, { text: e.target.value, item_id: m?.id ?? '', by_piece: m ? l.by_piece && canSplit(m) : false }); }} />
                  <div className="w-24">
                    <input className={`input text-right ${over ? 'border-red-400' : ''}`} type="number" min="1" step="1" placeholder="Qty" value={l.qty} onChange={(e) => setLine(idx, { qty: e.target.value })} aria-label="Quantity" />
                  </div>
                  {it && (split ? (
                    <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold" role="group" aria-label="Issue by">
                      {[false, true].map((bp) => (
                        <button key={String(bp)} type="button" aria-pressed={l.by_piece === bp} onClick={() => setLine(idx, { by_piece: bp })}
                          className={cx('rounded-lg px-3 py-1.5 transition', l.by_piece === bp ? 'bg-white text-kbz-navy shadow-sm' : 'text-slate-500 hover:text-kbz-dark')}>
                          {bp ? `${it.piece_unit || 'piece'}` : it.unit}
                        </button>
                      ))}
                    </div>
                  ) : <span className="self-center text-sm text-slate-500">{it.unit}</span>)}
                  {typed && <input className="input w-24" value={l.unit} onChange={(e) => setLine(idx, { unit: e.target.value })} placeholder="Unit" aria-label="Unit" />}
                  <button className="rounded p-2 text-slate-500 hover:bg-silver-100" onClick={() => setLines(lines.filter((_, i) => i !== idx))} aria-label="Remove line" disabled={lines.length === 1}><Trash2 className="h-4 w-4" /></button>
                </div>
                {it && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 px-1 text-xs">
                    <span className={cx(over || it.qty_on_hand <= 0 ? 'font-medium text-kbz-red' : 'text-emerald-700')}>
                      {it.qty_on_hand <= 0 ? 'Store item · out of stock (record a Stock in first)' : over ? `Store item · only ${max} available` : `Store item · ${fmtQty(it, it.qty_on_hand)} available`}
                    </span>
                    <span className="text-slate-500">Unit: <b className="text-slate-700">{it.unit}{split ? ` of ${it.pack_qty} ${it.piece_unit || 'piece'}s` : ''}</b></span>
                    <span className="text-slate-500">Price: <b className="text-slate-700">{num(it.unit_cost)} MMK / {it.unit}</b></span>
                    {split && <span className="text-slate-500">Per {it.piece_unit || 'piece'}: <b className="text-slate-700">{(Math.round((it.unit_cost / it.pack_qty!) * 100) / 100).toLocaleString('en-US')} MMK</b></span>}
                    {l.qty && <span className="ml-auto text-slate-500">Amount: <b className="text-kbz-blue">{num(Math.round(lineAmount(toLine(l), data.items)))} MMK</b></span>}
                  </div>
                )}
                {typed && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-slate-500">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">Not in store</span>
                    <label className="flex items-center gap-1.5">Price / {l.unit.trim() || 'unit'}
                      <input className="input w-28 py-1 text-right" type="number" min="0" value={l.cost} onChange={(e) => setLine(idx, { cost: e.target.value })} placeholder="MMK" aria-label="Price per unit" />
                    </label>
                    <label className="flex items-center gap-1.5">Pieces in one {l.unit.trim() || 'unit'}
                      <input className="input w-20 py-1 text-right" type="number" min="2" step="1" value={l.pack} onChange={(e) => setLine(idx, { pack: e.target.value })} placeholder="opt." aria-label="Pieces in one unit" />
                    </label>
                    {Number(l.pack) > 1 && Number(l.cost) > 0 && <span>Per piece: <b className="text-slate-700">{(Math.round((Number(l.cost) / Number(l.pack)) * 100) / 100).toLocaleString('en-US')} MMK</b></span>}
                    {l.qty && Number(l.cost) > 0 && <span className="ml-auto">Amount: <b className="text-kbz-blue">{num(Math.round(Number(l.qty) * Number(l.cost)))} MMK</b></span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setLines([...lines, blank])}><Plus className="h-4 w-4" />Add item</Button>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}
