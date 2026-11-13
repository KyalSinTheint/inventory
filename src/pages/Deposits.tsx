import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Layers, List, Plus } from 'lucide-react';
import { useData } from '../lib/store';
import { DEPOSIT_STATUSES, LOCATIONS, LOCATION_LABELS, TRAINEE_TYPES, type Batch, type Deposit, type Location, type TraineeType } from '../lib/types';
import { depositTotals, normalizeNrc, OPEN_STATUSES, retention } from '../lib/logic';
import { date, mmk, today } from '../lib/format';
import { DOC_ACCEPT } from '../lib/files';
import { Badge, Button, Empty, ErrorNote, Field, Modal, PageHeader, SearchBox, StatusBadge, cx, useSubmit, useToast } from '../components/ui';
import { FilePicker } from '../components/files';
import { exportExcel, exportPdf } from '../lib/export';
import { depositMasterReport } from './reportSpecs';

export const batchLabel = (b: Batch | undefined) => (b ? `${b.code}${b.location ? ` · ${b.location}` : ''}` : '—');

export default function DepositsPage() {
  const { data, can, settings, user } = useData();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const nav = useNavigate();
  const status = params.get('status') ?? '';
  const batch = params.get('batch') ?? '';
  const type = params.get('type') ?? '';
  const view = params.get('view') === 'batch' ? 'batch' : 'list';
  const setParam = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const batchOf = (id: string) => data.batches.find((b) => b.id === id);
  const licenseBatches = data.batches.filter((b) => b.program === 'License');

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const sn = normalizeNrc(q);
    return data.deposits
      .filter((d) => !status || (status === 'open' ? OPEN_STATUSES.includes(d.status) || d.status === 'Reversal Request' : d.status === status))
      .filter((d) => !batch || d.batch_id === batch)
      .filter((d) => !type || d.trainee_type === type)
      .filter((d) => !s || [d.ref, d.trainee_name, d.agent_code ?? ''].some((v) => v.toLowerCase().includes(s)) || (sn.length > 1 && normalizeNrc(d.nrc).includes(sn)))
      .sort((a, b) => b.ref.localeCompare(a.ref));
  }, [data.deposits, q, status, batch, type]);
  const t = depositTotals(rows);

  const doExport = async (kind: 'xlsx' | 'pdf') => {
    const spec = depositMasterReport(data, rows, user.name);
    await (kind === 'xlsx' ? exportExcel(spec) : exportPdf(spec));
  };

  return (
    <>
      <PageHeader title="License Class Deposits" subtitle="Deposit received → Held → Refunded (exam passed) or Forfeited (course incomplete / service term not met)"
        actions={<>
          {can('export') && <><Button variant="secondary" onClick={() => doExport('xlsx')}><Download className="h-4 w-4" />Excel</Button><Button variant="secondary" onClick={() => doExport('pdf')}><Download className="h-4 w-4" />PDF</Button></>}
          {can('deposit.create') && <Button onClick={() => setShowNew(true)}><Plus className="h-4 w-4" />Register deposit</Button>}
        </>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search name, NRC, agent code, ref" />
        <select className="input w-auto" value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status filter">
          <option value="">All statuses</option>
          <option value="open">Open (held + pending)</option>
          {DEPOSIT_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input w-auto" value={batch} onChange={(e) => setParam('batch', e.target.value)} aria-label="Batch filter">
          <option value="">All license batches</option>
          {licenseBatches.map((b) => <option key={b.id} value={b.id}>{batchLabel(b)}</option>)}
        </select>
        <select className="input w-auto" value={type} onChange={(e) => setParam('type', e.target.value)} aria-label="Internal or external">
          <option value="">Internal & external</option>
          {TRAINEE_TYPES.map((x) => <option key={x}>{x}</option>)}
        </select>
        <div className="ml-auto flex rounded-lg border border-silver-300 bg-white p-0.5" role="group" aria-label="View">
          <button onClick={() => setParam('view', '')} className={cx('flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm', view === 'list' ? 'bg-navy-800 text-white' : 'text-slate-600')}><List className="h-4 w-4" />List</button>
          <button onClick={() => setParam('view', 'batch')} className={cx('flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm', view === 'batch' ? 'bg-navy-800 text-white' : 'text-slate-600')}><Layers className="h-4 w-4" />By batch</button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
        <span>{rows.length} deposits</span>
        <span>Held: <b className="text-navy-900">{mmk(t.held)}</b></span>
        <span>Refunded: <b className="text-emerald-700">{mmk(t.refunded)}</b></span>
        <span>Forfeited: <b className="text-amber-700">{mmk(t.forfeited)}</b></span>
      </div>

      {view === 'batch' ? <ByBatch rows={rows} onPick={(id) => { const p = new URLSearchParams(params); p.set('batch', id); p.delete('view'); setParams(p, { replace: true }); }} /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Deposit ID</th><th>Trainee</th><th>NRC</th><th>Batch</th><th>Training</th><th className="num">Amount</th><th>Status</th><th>Retention</th></tr></thead>
            <tbody>
              {rows.map((d) => <Row key={d.id} d={d} batch={batchLabel(batchOf(d.batch_id))} onOpen={() => nav(`/deposits/${d.id}`)} alert={retention(d, settings.retention_alert_months, settings.service_term_months, today())} />)}
            </tbody>
          </table>
          {rows.length === 0 && <Empty>No deposits match these filters.</Empty>}
        </div>
      )}
      {showNew && <NewDeposit onClose={() => setShowNew(false)} onCreated={(id) => nav(`/deposits/${id}`)} />}
    </>
  );
}

function ByBatch({ rows, onPick }: { rows: Deposit[]; onPick: (batchId: string) => void }) {
  const { data } = useData();
  const groups = data.batches.filter((b) => b.program === 'License')
    .map((b) => ({ b, list: rows.filter((d) => d.batch_id === b.id) }))
    .filter((g) => g.list.length)
    .sort((a, b) => b.b.start_date.localeCompare(a.b.start_date));
  if (!groups.length) return <Empty>No deposits match these filters.</Empty>;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr><th>Batch</th><th>Branch</th><th>Training dates</th><th className="num">Trainees</th><th className="num">Internal / External</th><th className="num">Held</th><th className="num">Refunded</th><th className="num">Forfeited</th></tr></thead>
        <tbody>
          {groups.map(({ b, list }) => {
            const t = depositTotals(list);
            const internal = list.filter((d) => d.trainee_type === 'Internal').length;
            return (
              <tr key={b.id} className="cursor-pointer" onClick={() => onPick(b.id)}>
                <td><div className="font-medium text-navy-800">{b.code}</div><div className="text-xs text-slate-500">{b.name}</div></td>
                <td>{b.location ? LOCATION_LABELS[b.location] : '—'}</td>
                <td className="whitespace-nowrap text-xs">{date(b.start_date)} – {date(b.end_date)}</td>
                <td className="num">{list.length}</td>
                <td className="num">{internal} / {list.length - internal}</td>
                <td className="num">{mmk(t.held)}</td>
                <td className="num text-emerald-700">{mmk(t.refunded)}</td>
                <td className="num text-amber-700">{mmk(t.forfeited)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({ d, batch, onOpen, alert }: { d: Deposit; batch: string; onOpen: () => void; alert: ReturnType<typeof retention> }) {
  return (
    <tr className="cursor-pointer" onClick={onOpen}>
      <td className="whitespace-nowrap font-medium text-navy-800">{d.ref}</td>
      <td><div className="font-medium">{d.trainee_name}</div><div className="flex flex-wrap items-center gap-1 text-xs text-slate-500"><Badge tone={d.trainee_type === 'External' ? 'purple' : 'navy'}>{d.trainee_type}</Badge>{d.agent_code}</div></td>
      <td className="whitespace-nowrap text-sm">{d.nrc}</td>
      <td className="whitespace-nowrap">{batch}</td>
      <td className="whitespace-nowrap">{date(d.training_date)}</td>
      <td className="num">{mmk(d.amount)}</td>
      <td><StatusBadge status={d.status} />{d.status === 'Refund Request' && d.hod_approved_by && <div className="mt-1 text-xs text-slate-500">HOD ✓ · awaiting Finance</div>}</td>
      <td className="whitespace-nowrap">{alert.level === 'expired' ? <Badge tone="red">Term ended</Badge> : alert.level === 'warning' ? <Badge tone="amber">{alert.daysLeft}d left</Badge> : <span className="text-xs text-slate-400">—</span>}</td>
    </tr>
  );
}

export const NRC_HINT = 'e.g. 12/MaYaKa(N)123456 or ၁၂/မရက(နိုင်)၁၂၃၄၅၆';

function NewDeposit({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { data, actions, can } = useData();
  const toast = useToast();
  const batches = data.batches.filter((b) => b.program === 'License' && b.status !== 'Completed').sort((a, b) => b.start_date.localeCompare(a.start_date));
  const first = batches[0];
  const [f, setF] = useState({
    trainee_name: '', nrc: '', agent_code: '', trainee_type: 'Internal' as TraineeType, batch_id: first?.id ?? '',
    training_date: first?.start_date ?? today(), amount: '', payment_date: today(),
  });
  const [files, setFiles] = useState<File[]>([]);
  const [newBatch, setNewBatch] = useState(false);
  const { busy, error, run } = useSubmit();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const pickBatch = (id: string) => {
    const b = data.batches.find((x) => x.id === id);
    setF({ ...f, batch_id: id, training_date: b?.start_date || f.training_date });
  };
  return (
    <Modal wide open onClose={onClose} title="Register license class deposit" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => {
        const d = await actions.registerDeposit({ ...f, agent_code: f.agent_code || null, amount: Number(f.amount) }, files);
        toast(`${d.ref} registered as Held`);
        onCreated(d.id);
      })}>Register as Held</Button>
    </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Trainee name" required><input className="input" value={f.trainee_name} onChange={set('trainee_name')} /></Field>
        <Field label="Trainee type" required>
          <div className="flex gap-2">
            {TRAINEE_TYPES.map((x) => (
              <label key={x} className={cx('flex flex-1 cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm', f.trainee_type === x ? 'border-navy-700 bg-navy-50 font-medium text-navy-900' : 'border-silver-300 text-slate-600')}>
                <input type="radio" name="ttype" className="sr-only" checked={f.trainee_type === x} onChange={() => setF({ ...f, trainee_type: x })} />{x}
              </label>
            ))}
          </div>
        </Field>
        <Field label="NRC number" required hint={NRC_HINT}><input className="input" value={f.nrc} onChange={set('nrc')} placeholder="12/MaYaKa(N)123456" /></Field>
        <Field label="Agent code / employee ID" hint="Optional"><input className="input uppercase" value={f.agent_code} onChange={set('agent_code')} /></Field>
        <Field label="License course batch" required hint={batches.length ? undefined : 'Create an active License batch first.'}>
          <div className="flex gap-2">
            <select className="input" value={f.batch_id} onChange={(e) => pickBatch(e.target.value)}>
              {batches.map((b) => <option key={b.id} value={b.id}>{batchLabel(b)} · {b.name}</option>)}
            </select>
            {can('batch.manage') && <Button variant="secondary" type="button" onClick={() => setNewBatch(true)} aria-label="New batch" title="New batch"><Plus className="h-4 w-4" /></Button>}
          </div>
        </Field>
        <Field label="Training date" required hint="Defaults to the batch start date"><input className="input" type="date" value={f.training_date} onChange={set('training_date')} /></Field>
        <Field label="Deposit amount (MMK)" required><input className="input" type="number" min="0" step="any" inputMode="decimal" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Payment date" required><input className="input" type="date" max={today()} value={f.payment_date} onChange={set('payment_date')} /></Field>
        <Field label="Documents" hint="NRC copy, payment slip, agreement… (PDF, image, Word, Excel)" className="sm:col-span-2">
          <FilePicker files={files} onChange={setFiles} multiple accept={DOC_ACCEPT} label="Attach documents…" />
        </Field>
      </div>
      <p className="mt-3 text-xs text-slate-500">The system checks for missing fields, and an existing open deposit for the same NRC before saving.</p>
      <ErrorNote error={error} />
      {newBatch && <QuickBatch onClose={() => setNewBatch(false)} onCreated={(b) => { setNewBatch(false); setF({ ...f, batch_id: b.id, training_date: b.start_date || f.training_date }); }} />}
    </Modal>
  );
}

function QuickBatch({ onClose, onCreated }: { onClose: () => void; onCreated: (b: Batch) => void }) {
  const { actions } = useData();
  const [f, setF] = useState({ code: '', name: '', location: 'YGN' as Location, start_date: today(), end_date: '', budget: '' });
  const { busy, error, run } = useSubmit();
  return (
    <Modal open onClose={onClose} title="New License batch" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => onCreated(await actions.saveBatch({ ...f, program: 'License', status: 'Active', budget: Number(f.budget) || 0 })))}>Create batch</Button>
    </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Batch code" required><input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder={`LIC-${f.location}-${new Date().getFullYear()}-01`} /></Field>
        <Field label="Branch" required><select className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value as Location })}>{LOCATIONS.map((l) => <option key={l} value={l}>{l} · {LOCATION_LABELS[l]}</option>)}</select></Field>
        <Field label="Name" required className="sm:col-span-2"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Start date"><input className="input" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
        <Field label="End date"><input className="input" type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
        <Field label="Training budget (MMK)"><input className="input" type="number" min="0" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} /></Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}
