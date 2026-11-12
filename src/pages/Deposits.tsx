import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { useData } from '../lib/store';
import { DEPOSIT_STATUSES, type Deposit } from '../lib/types';
import { depositTotals, OPEN_STATUSES, retention } from '../lib/logic';
import { date, mmk, today } from '../lib/format';
import { Badge, Button, Empty, ErrorNote, Field, Modal, PageHeader, SearchBox, StatusBadge, useSubmit, useToast } from '../components/ui';
import { exportExcel, exportPdf } from '../lib/export';
import { depositMasterReport } from './reportSpecs';

export default function DepositsPage() {
  const { data, can, settings, user } = useData();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const nav = useNavigate();
  const status = params.get('status') ?? '';
  const batch = params.get('batch') ?? '';
  const setParam = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const batchCode = (id: string) => data.batches.find((b) => b.id === id)?.code ?? '—';
  const licenseBatches = data.batches.filter((b) => b.program === 'License');

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.deposits
      .filter((d) => !status || (status === 'open' ? OPEN_STATUSES.includes(d.status) || d.status === 'Reversal Request' : d.status === status))
      .filter((d) => !batch || d.batch_id === batch)
      .filter((d) => !s || [d.ref, d.trainee_name, d.agent_code, d.voucher_ref].some((v) => v.toLowerCase().includes(s)))
      .sort((a, b) => b.ref.localeCompare(a.ref));
  }, [data.deposits, q, status, batch]);
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
        <SearchBox value={q} onChange={setQ} placeholder="Search name, agent code, ref, voucher" />
        <select className="input w-auto" value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status filter">
          <option value="">All statuses</option>
          <option value="open">Open (held + pending)</option>
          {DEPOSIT_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input w-auto" value={batch} onChange={(e) => setParam('batch', e.target.value)} aria-label="Batch filter">
          <option value="">All license batches</option>
          {licenseBatches.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
        </select>
      </div>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
        <span>{rows.length} deposits</span>
        <span>Held: <b className="text-navy-900">{mmk(t.held)}</b></span>
        <span>Refunded: <b className="text-emerald-700">{mmk(t.refunded)}</b></span>
        <span>Forfeited: <b className="text-amber-700">{mmk(t.forfeited)}</b></span>
      </div>

      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Deposit ID</th><th>Trainee / Agent</th><th>Batch</th><th>Paid</th><th className="num">Amount</th><th>Status</th><th>Retention</th></tr></thead>
          <tbody>
            {rows.map((d) => <Row key={d.id} d={d} batch={batchCode(d.batch_id)} onOpen={() => nav(`/deposits/${d.id}`)} alert={retention(d, settings.retention_alert_months, settings.service_term_months, today())} />)}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No deposits match these filters.</Empty>}
      </div>
      {showNew && <NewDeposit onClose={() => setShowNew(false)} onCreated={(id) => nav(`/deposits/${id}`)} />}
    </>
  );
}

function Row({ d, batch, onOpen, alert }: { d: Deposit; batch: string; onOpen: () => void; alert: ReturnType<typeof retention> }) {
  return (
    <tr className="cursor-pointer" onClick={onOpen}>
      <td className="whitespace-nowrap font-medium text-navy-800">{d.ref}</td>
      <td><div className="font-medium">{d.trainee_name}</div><div className="text-xs text-slate-500">{d.agent_code}</div></td>
      <td className="whitespace-nowrap">{batch}</td>
      <td className="whitespace-nowrap">{date(d.payment_date)}</td>
      <td className="num">{mmk(d.amount)}</td>
      <td><StatusBadge status={d.status} />{d.status === 'Refund Request' && d.hod_approved_by && <div className="mt-1 text-xs text-slate-500">HOD ✓ · awaiting Finance</div>}</td>
      <td className="whitespace-nowrap">{alert.level === 'expired' ? <Badge tone="red">Term ended</Badge> : alert.level === 'warning' ? <Badge tone="amber">{alert.daysLeft}d left</Badge> : <span className="text-xs text-slate-400">—</span>}</td>
    </tr>
  );
}

function NewDeposit({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { data, actions } = useData();
  const toast = useToast();
  const batches = data.batches.filter((b) => b.program === 'License' && b.status !== 'Completed');
  const [f, setF] = useState({ trainee_name: '', agent_code: '', batch_id: batches[0]?.id ?? '', amount: '', payment_date: today(), voucher_ref: '' });
  const { busy, error, run } = useSubmit();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="Register license class deposit" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => {
        const d = await actions.registerDeposit({ ...f, amount: Number(f.amount) });
        toast(`${d.ref} registered as Held`);
        onCreated(d.id);
      })}>Register as Held</Button>
    </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Trainee / agent name" required className="sm:col-span-2"><input className="input" value={f.trainee_name} onChange={set('trainee_name')} /></Field>
        <Field label="Agent code / employee ID" required><input className="input uppercase" value={f.agent_code} onChange={set('agent_code')} /></Field>
        <Field label="License course batch" required hint={batches.length ? undefined : 'Create an active License batch first.'}>
          <select className="input" value={f.batch_id} onChange={set('batch_id')}>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </select>
        </Field>
        <Field label="Deposit amount (MMK)" required><input className="input" type="number" min="0" step="any" inputMode="decimal" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Payment date" required><input className="input" type="date" max={today()} value={f.payment_date} onChange={set('payment_date')} /></Field>
        <Field label="Voucher reference" required className="sm:col-span-2"><input className="input" value={f.voucher_ref} onChange={set('voucher_ref')} placeholder="Receipt voucher no." /></Field>
      </div>
      <p className="mt-3 text-xs text-slate-500">The system checks for missing fields, an existing open deposit for the same agent code, and duplicate vouchers before saving.</p>
      <ErrorNote error={error} />
    </Modal>
  );
}
