import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Layers, List, Plus } from 'lucide-react';
import { useData } from '../lib/store';
import { DEPOSIT_STATUSES, LOCATION_LABELS, TRAINEE_TYPES, type Batch, type Deposit, type TraineeType } from '../lib/types';
import { depositTotals, normalizeNrc, OPEN_STATUSES, retention } from '../lib/logic';
import { date, mmk, monthLabel, today } from '../lib/format';
import { DOC_ACCEPT } from '../lib/files';
import { Badge, Button, Empty, ErrorNote, Field, Modal, PageHeader, SearchBox, StatusBadge, cx, useSubmit, useToast } from '../components/ui';
import { FilePicker } from '../components/files';
import { exportExcel, exportPdf } from '../lib/export';
import { MonthBar } from '../components/MonthBar';
import { depositMasterReport } from './reportSpecs';
import { TrainingPicker, useTrainingDraft } from '../components/TrainingPicker';

export const batchLabel = (b: Batch | undefined) => (b ? b.name : '—');

export default function DepositsPage() {
  const { data, can, settings, user } = useData();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(() => params.get('new') === '1' && can('deposit.create'));
  const nav = useNavigate();
  const status = params.get('status') ?? '';
  const batch = params.get('batch') ?? '';
  const type = params.get('type') ?? '';
  const view = params.get('view') === 'batch' ? 'batch' : 'list';
  const month = params.get('month') ?? '';
  const setParam = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const batchOf = (id: string) => data.batches.find((b) => b.id === id);
  const licenseBatches = data.batches.filter((b) => b.program === 'License');

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const sn = normalizeNrc(q);
    return data.deposits
      .filter((d) => !status || (status === 'open' ? OPEN_STATUSES.includes(d.status) || d.status === 'Reversal Request' : d.status === status))
      .filter((d) => !month || d.payment_date.startsWith(month))
      .filter((d) => !batch || d.batch_id === batch)
      .filter((d) => !type || d.trainee_type === type)
      .filter((d) => !s || [d.trainee_name, d.agent_code ?? ''].some((v) => v.toLowerCase().includes(s)) || (sn.length > 1 && normalizeNrc(d.nrc).includes(sn)))
      .sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.created_at.localeCompare(a.created_at));
  }, [data.deposits, q, status, batch, type, month]);
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

      <MonthBar month={month} onChange={(m) => setParam('month', m)} dates={data.deposits.map((d) => d.payment_date)}
        note={month ? `Deposits paid in ${monthLabel(month)}` : 'All deposits'} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search name, NRC, agent code" />
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
            <thead><tr><th>Trainee</th><th>NRC</th><th>Training</th><th>Training dates</th><th className="num">Amount</th><th>Status</th><th>Retention</th></tr></thead>
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
        <thead><tr><th>Training</th><th>Branch</th><th>Training dates</th><th className="num">Trainees</th><th className="num">Internal / External</th><th className="num">Held</th><th className="num">Refunded</th><th className="num">Forfeited</th></tr></thead>
        <tbody>
          {groups.map(({ b, list }) => {
            const t = depositTotals(list);
            const internal = list.filter((d) => d.trainee_type === 'Internal').length;
            return (
              <tr key={b.id} className="cursor-pointer" onClick={() => onPick(b.id)}>
                <td className="font-medium text-navy-800">{b.name}</td>
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
      <td><div className="font-medium text-navy-800">{d.trainee_name}</div><div className="flex flex-wrap items-center gap-1 text-xs text-slate-500"><Badge tone={d.trainee_type === 'External' ? 'purple' : 'navy'}>{d.trainee_type}</Badge>{d.agent_code}</div></td>
      <td className="whitespace-nowrap text-sm">{d.nrc}</td>
      <td className="whitespace-nowrap">{batch}</td>
      <td className="whitespace-nowrap text-sm">{date(d.training_date)}{d.training_end_date && d.training_end_date !== d.training_date && <div className="text-xs text-slate-500">to {date(d.training_end_date)}</div>}</td>
      <td className="num">{mmk(d.amount)}</td>
      <td><StatusBadge status={d.status} />{d.status === 'Refund Request' && d.hod_approved_by && <div className="mt-1 text-xs text-slate-500">HOD ✓ · awaiting Finance</div>}</td>
      <td className="whitespace-nowrap">{alert.level === 'expired' ? <Badge tone="red">Term ended</Badge> : alert.level === 'warning' ? <Badge tone="amber">{alert.daysLeft}d left</Badge> : <span className="text-xs text-slate-400">—</span>}</td>
    </tr>
  );
}

export const NRC_HINT = 'e.g. 12/MaYaKa(N)123456 or ၁၂/မရက(နိုင်)၁၂၃၄၅၆';

function NewDeposit({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { data, actions } = useData();
  const toast = useToast();
  const batches = data.batches.filter((b) => !b.archived && b.program === 'License' && b.status !== 'Completed').sort((a, b) => b.start_date.localeCompare(a.start_date));

  const [f, setF] = useState({
    trainee_name: '', nrc: '', agent_code: '', trainee_type: 'Internal' as TraineeType, batch_id: '',
    training_date: today(), training_end_date: today(), amount: '', payment_date: today(),
  });
  const [files, setFiles] = useState<File[]>([]);
  const training = useTrainingDraft();
  const { busy, error, run } = useSubmit();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal wide open onClose={onClose} title="Register license class deposit" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => {
        const batch_id = await training.resolve(f.batch_id);
        const d = await actions.registerDeposit({ ...f, batch_id, agent_code: f.agent_code || null, amount: Number(f.amount) }, files);
        toast('Deposit registered as Held');
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
        <Field label="License course batch" required hint={batches.length ? undefined : 'Type the batch name to add it.'}>
          <TrainingPicker value={f.batch_id} batches={batches} program="License" required onDraft={training.onDraft}
            onChange={(id, b) => setF({ ...f, batch_id: id, training_date: b?.start_date || f.training_date, training_end_date: b?.end_date || b?.start_date || f.training_end_date })} />
        </Field>
        <Field label="Training start date" required hint="Defaults to the batch dates"><input className="input" type="date" value={f.training_date}
          onChange={(e) => setF({ ...f, training_date: e.target.value, training_end_date: f.training_end_date && f.training_end_date < e.target.value ? e.target.value : f.training_end_date })} /></Field>
        <Field label="Training end date" required><input className="input" type="date" min={f.training_date} value={f.training_end_date} onChange={set('training_end_date')} /></Field>
        <Field label="Deposit amount (MMK)" required><input className="input" type="number" min="0" step="any" inputMode="decimal" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Payment date" required><input className="input" type="date" max={today()} value={f.payment_date} onChange={set('payment_date')} /></Field>
        <Field label="Documents" hint="NRC copy, payment slip, agreement… (PDF, image, Word, Excel)" className="sm:col-span-2">
          <FilePicker files={files} onChange={setFiles} multiple accept={DOC_ACCEPT} label="Attach documents…" />
        </Field>
      </div>
      <p className="mt-3 text-xs text-slate-500">The system checks for missing fields, and an existing open deposit for the same NRC before saving.</p>
      <ErrorNote error={error} />
    </Modal>
  );
}

