import { useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import { GlassArea, notchMask } from '../components/glass';
import { useData } from '../lib/store';
import { CATEGORIES, type MaterialRequest, type RequestLine } from '../lib/types';
import { requestValue } from '../lib/logic';
import { date, mmk, monthLabel, num } from '../lib/format';
import { MonthBar, useMonthParam } from '../components/MonthBar';
import { FileLink, FilePicker } from '../components/files';
import { EXCEL_ACCEPT } from '../lib/files';
import { Button, cx, Empty, ErrorNote, Field, Modal, PageHeader, useSubmit, useToast } from '../components/ui';

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
  const qty = r.lines.reduce((t, l) => t + l.qty, 0);
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
          <div><div className="text-xs text-slate-500">Total qty</div><div className="text-lg font-semibold tabular-nums text-kbz-dark">{num(qty)}</div></div>
          <div className="min-w-0"><div className="text-xs text-slate-500">Value</div><div className="truncate text-lg font-bold tabular-nums text-kbz-blue">{num(requestValue(r, data.items))}<span className="ml-1 text-[11px] font-medium text-slate-400">MMK</span></div></div>
        </div>
        <button onClick={onOpen} className="w-full shrink-0 rounded-xl bg-kbz-navy px-4 py-2.5 sm:w-auto text-sm font-semibold text-white shadow-[0_8px_18px_-8px_rgba(0,45,114,0.7)] transition hover:bg-kbz-blue">View Details</button>
      </div>
    </article>
  );
}

function RequestDetail({ r, onClose, onRevise }: { r: MaterialRequest; onClose: () => void; onRevise: () => void }) {
  const { data, can, name } = useData();
  const b = data.batches.find((x) => x.id === r.batch_id);
  const item = (id: string) => data.items.find((i) => i.id === id);
  const pill = STATUS_PILL[r.status];
  return (
    <Modal wide open onClose={onClose} title={`Material request · ${b?.name ?? ''}`} footer={<>
      {r.status === 'Rejected' && can('request.create') && <Button variant="secondary" className="mr-auto" onClick={onRevise}><Pencil className="h-4 w-4" />Revise &amp; resubmit</Button>}
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
      <ul className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
        {r.lines.map((l, idx) => {
          const it = item(l.item_id);
          const short = r.status === 'Pending' && l.qty > (it?.qty_on_hand ?? 0);
          return (
            <li key={idx} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium text-kbz-dark">{it?.name ?? 'Item'}</span>
              <span className="tabular-nums"><b>{num(l.qty)}</b> {it?.unit}</span>
              <span className="w-28 text-right tabular-nums text-slate-500">{num(l.qty * (it?.unit_cost ?? 0))} MMK</span>
              {r.status === 'Pending' && <span className={cx('w-28 text-right text-xs', short ? 'font-semibold text-kbz-red' : 'text-slate-400')}>{num(it?.qty_on_hand ?? 0)} on hand</span>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-right text-sm">Total: <b className="text-kbz-blue">{mmk(requestValue(r, data.items))}</b></p>
    </Modal>
  );
}

function RequestModal({ request, initialItem, onClose }: { request?: MaterialRequest; initialItem?: string; onClose: () => void }) {
  const { data, actions } = useData();
  const toast = useToast();
  const batches = data.batches.filter((b) => b.status !== 'Completed' || b.id === request?.batch_id);
  const [batchId, setBatchId] = useState(request?.batch_id ?? batches[0]?.id ?? '');
  const [purpose, setPurpose] = useState(request?.purpose ?? '');
  const [remarks, setRemarks] = useState(request?.remarks ?? '');
  const [file, setFile] = useState<File[]>([]);
  const [removeFile, setRemoveFile] = useState(false);
  const [lines, setLines] = useState<{ item_id: string; qty: string }[]>(request?.lines.map((l) => ({ item_id: l.item_id, qty: String(l.qty) })) ?? [{ item_id: initialItem && data.items.some((i) => i.id === initialItem) ? initialItem : '', qty: '' }]);
  const { busy, error, run } = useSubmit();
  const item = (id: string) => data.items.find((i) => i.id === id);
  const total = lines.reduce((s, l) => s + Number(l.qty || 0) * (item(l.item_id)?.unit_cost ?? 0), 0);
  return (
    <Modal wide open onClose={onClose} title={request ? 'Revise material request' : 'New material request'} footer={<>
      <span className="mr-auto self-center text-sm text-slate-600">Estimated value: <b>{mmk(total)}</b></span>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => {
        await actions.saveRequest({ id: request?.id, batch_id: batchId, purpose, remarks, lines: lines.map<RequestLine>((l) => ({ item_id: l.item_id, qty: Number(l.qty) })) },
          file[0] ?? (removeFile ? null : undefined));
        toast('Request sent to HOD for approval'); onClose();
      })}>Submit for approval</Button>
    </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Training" required><select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)}>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Purpose"><input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Day 1–3 refreshments for 30 trainees" /></Field>
        <Field label="Remarks" className="sm:col-span-2"><textarea className="input min-h-24" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Details for the HOD: number of trainees, delivery date, sizes, special instructions…" /></Field>
        <Field label="Attachment (Excel list, etc.)" className="sm:col-span-2" hint="Excel, CSV, PDF or photo">
          {request?.attachment && !removeFile && !file.length ? (
            <div className="flex items-center gap-3 text-sm"><FileLink att={request.attachment} /><Button size="sm" variant="ghost" type="button" onClick={() => setRemoveFile(true)}>Remove</Button></div>
          ) : <FilePicker files={file} onChange={setFile} accept={EXCEL_ACCEPT} label="Attach Excel file…" />}
        </Field>
      </div>
      <div className="mt-4 space-y-2">
        {lines.map((l, idx) => {
          const it = item(l.item_id);
          const over = it && Number(l.qty) > it.qty_on_hand;
          return (
            <div key={idx} className="flex flex-wrap items-start gap-2">
              <select className="input min-w-0 flex-1 basis-56" value={l.item_id} onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, item_id: e.target.value } : x)))} aria-label="Item">
                <option value="">Choose item…</option>
                {CATEGORIES.map((c) => <optgroup key={c} label={c}>{data.items.filter((i) => i.category === c && i.active).map((i) => <option key={i.id} value={i.id} disabled={i.qty_on_hand === 0}>{i.name} ({num(i.qty_on_hand)} available)</option>)}</optgroup>)}
              </select>
              <div className="w-28">
                <input className={`input text-right ${over ? 'border-red-400' : ''}`} type="number" min="1" step="1" placeholder="Qty" value={l.qty} onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} aria-label="Quantity" />
                {over && <div className="mt-0.5 text-xs text-red-600">Max {it.qty_on_hand}</div>}
              </div>
              <button className="rounded p-2 text-slate-500 hover:bg-silver-100" onClick={() => setLines(lines.filter((_, i) => i !== idx))} aria-label="Remove line" disabled={lines.length === 1}><Trash2 className="h-4 w-4" /></button>
            </div>
          );
        })}
        <Button size="sm" variant="ghost" onClick={() => setLines([...lines, { item_id: '', qty: '' }])}><Plus className="h-4 w-4" />Add item</Button>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}
