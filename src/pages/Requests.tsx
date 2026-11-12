import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useData } from '../lib/store';
import { CATEGORIES, type MaterialRequest, type RequestLine } from '../lib/types';
import { requestValue } from '../lib/logic';
import { dateTime, mmk, num } from '../lib/format';
import { Button, Empty, ErrorNote, Field, Modal, PageHeader, StatusBadge, useSubmit, useToast } from '../components/ui';

export default function RequestsPage() {
  const { data, can, name } = useData();
  const [edit, setEdit] = useState<MaterialRequest | 'new' | null>(null);
  const [status, setStatus] = useState('');
  const batch = (id: string) => data.batches.find((b) => b.id === id);
  const item = (id: string) => data.items.find((i) => i.id === id);
  const rows = useMemo(() => data.material_requests.filter((r) => !status || r.status === status).sort((a, b) => b.created_at.localeCompare(a.created_at)), [data.material_requests, status]);
  return (
    <>
      <PageHeader title="Material Requests" subtitle="Request materials for a training batch. Stock is issued when the L&D HOD approves."
        actions={can('request.create') && <Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />New request</Button>} />
      <select className="input mb-4 w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option><option>Pending</option><option>Approved</option><option>Rejected</option></select>
      <div className="space-y-3">
        {rows.map((r) => {
          const b = batch(r.batch_id);
          return (
            <div key={r.id} className="rounded-xl border border-silver-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2"><span className="font-semibold text-navy-900">{r.ref}</span><StatusBadge status={r.status} /></div>
                  <div className="text-sm text-slate-600">{b?.code} · {b?.name}</div>
                  <div className="text-xs text-slate-500">By {name(r.created_by)} · {dateTime(r.created_at)}{r.decided_by && ` · decided by ${name(r.decided_by)} ${dateTime(r.decided_at)}`}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium tabular-nums">{mmk(requestValue(r, data.items))}</div>
                  {r.status === 'Rejected' && can('request.create') && <Button size="sm" variant="secondary" className="mt-1" onClick={() => setEdit(r)}><Pencil className="h-3.5 w-3.5" />Revise & resubmit</Button>}
                </div>
              </div>
              {r.purpose && <p className="mt-2 text-sm text-slate-700">{r.purpose}</p>}
              {r.decision_note && <p className={`mt-2 rounded-md px-2 py-1 text-sm ${r.status === 'Rejected' ? 'bg-red-50 text-red-700' : 'bg-silver-100 text-slate-700'}`}>HOD: {r.decision_note}</p>}
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {r.lines.map((l, i) => <li key={i} className="rounded-md bg-silver-100 px-2 py-0.5 text-xs">{item(l.item_id)?.name} × {num(l.qty)}</li>)}
              </ul>
            </div>
          );
        })}
        {rows.length === 0 && <Empty>No requests.</Empty>}
      </div>
      {edit && <RequestModal request={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function RequestModal({ request, onClose }: { request?: MaterialRequest; onClose: () => void }) {
  const { data, actions } = useData();
  const toast = useToast();
  const batches = data.batches.filter((b) => b.status !== 'Completed' || b.id === request?.batch_id);
  const [batchId, setBatchId] = useState(request?.batch_id ?? batches[0]?.id ?? '');
  const [purpose, setPurpose] = useState(request?.purpose ?? '');
  const [lines, setLines] = useState<{ item_id: string; qty: string }[]>(request?.lines.map((l) => ({ item_id: l.item_id, qty: String(l.qty) })) ?? [{ item_id: '', qty: '' }]);
  const { busy, error, run } = useSubmit();
  const item = (id: string) => data.items.find((i) => i.id === id);
  const total = lines.reduce((s, l) => s + Number(l.qty || 0) * (item(l.item_id)?.unit_cost ?? 0), 0);
  return (
    <Modal wide open onClose={onClose} title={request ? `Revise ${request.ref}` : 'New material request'} footer={<>
      <span className="mr-auto self-center text-sm text-slate-600">Estimated value: <b>{mmk(total)}</b></span>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => {
        const r = await actions.saveRequest({ id: request?.id, batch_id: batchId, purpose, lines: lines.map<RequestLine>((l) => ({ item_id: l.item_id, qty: Number(l.qty) })) });
        toast(`${r.ref} sent to HOD for approval`); onClose();
      })}>Submit for approval</Button>
    </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Training batch" required><select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)}>{batches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}</select></Field>
        <Field label="Purpose"><input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Day 1–3 refreshments for 30 trainees" /></Field>
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
