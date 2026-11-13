import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FilePlus2, Lock, Pencil } from 'lucide-react';
import { useData } from '../lib/store';
import { retention, FINAL_STATUSES } from '../lib/logic';
import { date, dateTime, mmk, today } from '../lib/format';
import { Badge, Button, Card, ErrorNote, Field, Modal, PageHeader, StatusBadge, useSubmit, useToast } from '../components/ui';
import { DepositActions } from '../components/DepositActions';
import { TRAINEE_TYPES, type Deposit, type TraineeType } from '../lib/types';
import { FileLink, FilePicker } from '../components/files';
import { DOC_ACCEPT } from '../lib/files';
import { batchLabel, NRC_HINT } from './Deposits';

export default function DepositDetail() {
  const { id } = useParams();
  const { data, name, settings, can } = useData();
  const [edit, setEdit] = useState(false);
  const [addDocs, setAddDocs] = useState(false);
  const d = data.deposits.find((x) => x.id === id);
  if (!d) return <p className="text-sm text-slate-500">Deposit not found. <Link className="text-navy-700 underline" to="/deposits">Back to list</Link></p>;
  const batch = data.batches.find((b) => b.id === d.batch_id);
  const r = retention(d, settings.retention_alert_months, settings.service_term_months, today());
  const history = data.deposit_status_log.filter((l) => l.deposit_id === d.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const locked = FINAL_STATUSES.includes(d.status);
  const ledger = d.status === 'Refunded' ? 'Exam Pass Refund Ledger' : d.status === 'Forfeited'
    ? (d.forfeit_reason === 'Course Incomplete' ? 'Course Incomplete Forfeited Ledger (non-refundable income)' : 'Service Term Not Met Forfeited Ledger (non-refundable income)')
    : 'License Exam Deposit Account (liability)';

  const rows: [string, React.ReactNode][] = [
    ['Trainee', d.trainee_name], ['NRC', d.nrc], ['Trainee type', d.trainee_type], ['Agent code / employee ID', d.agent_code ?? '—'],
    ['License course batch', batch ? `${batchLabel(batch)} · ${batch.name}` : '—'], ['Training date', date(d.training_date)],
    ['Deposit amount', <b key="a">{mmk(d.amount)}</b>], ['Payment date', date(d.payment_date)],
    ['Ledger', ledger], ['Service term ends', <span key="t">{date(r.dueDate)} {d.status === 'Held' && r.level !== 'ok' && <Badge tone={r.level === 'expired' ? 'red' : 'amber'}>{r.level === 'expired' ? 'ended' : `${r.daysLeft} days left`}</Badge>}</span>],
    ['Registered by', `${name(d.created_by)} · ${dateTime(d.created_at)}`],
  ];
  if (d.forfeit_reason) rows.push(['Forfeiture reason', d.forfeit_reason]);
  if (d.request_note) rows.push(['Request note', d.request_note]);
  if (d.requested_by) rows.push(['Requested by', `${name(d.requested_by)} · ${dateTime(d.requested_at)}`]);
  if (d.hod_approved_by) rows.push(['HOD approval', `${name(d.hod_approved_by)} · ${dateTime(d.hod_approved_at)}`]);
  if (d.finance_approved_by) rows.push(['Finance confirmation', `${name(d.finance_approved_by)} · ${dateTime(d.finance_approved_at)} · ${d.finance_voucher_ref}`]);
  if (d.reversal_reason) rows.push(['Reversal', d.reversal_reason]);

  return (
    <>
      <Link to="/deposits" className="mb-3 inline-flex items-center gap-1 text-sm text-navy-700 hover:underline"><ArrowLeft className="h-4 w-4" />All deposits</Link>
      <PageHeader title={`${d.ref} · ${d.trainee_name}`} subtitle={<span className="inline-flex items-center gap-2"><StatusBadge status={d.status} />{locked && <span className="inline-flex items-center gap-1 text-xs"><Lock className="h-3 w-3" />Approved: read-only, changes need a reversal</span>}</span>}
        actions={d.status === 'Held' && can('deposit.create') ? <Button variant="secondary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" />Correct details</Button> : undefined} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Deposit record">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {rows.map(([k, v]) => (
                <div key={k} className="min-w-0"><dt className="text-xs text-slate-500">{k}</dt><dd className="break-words text-sm text-navy-900">{v}</dd></div>
              ))}
            </dl>
            {d.attachment && (
              <div className="mt-4 border-t border-silver-100 pt-3 text-sm">
                <div className="mb-1 text-xs text-slate-500">{d.status.includes('Forfeit') || d.forfeit_reason ? 'Forfeiture notice' : 'Exam Pass Certificate'}</div>
                <FileLink att={d.attachment} />
              </div>
            )}
          </Card>
          <Card title={`Documents (${d.documents?.length ?? 0})`} actions={can('deposit.create') && !['Refunded', 'Forfeited', 'Reversal Request'].includes(d.status)
            ? <Button size="sm" variant="secondary" onClick={() => setAddDocs(true)}><FilePlus2 className="h-4 w-4" />Add documents</Button> : undefined}>
            {d.documents?.length ? (
              <ul className="space-y-1.5 text-sm">{d.documents.map((a, i) => <li key={i}><FileLink att={a} /></li>)}</ul>
            ) : <p className="text-sm text-slate-500">No documents attached. Add the NRC copy, payment slip or agreement here.</p>}
          </Card>
          <Card title="Actions"><DepositActions deposit={d} /><NoActionsHint d={d} /></Card>
        </div>
        <Card title="Status history (audit trail)">
          <ol className="relative space-y-4 border-l border-silver-200 pl-4">
            {history.map((h) => (
              <li key={h.id} className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-navy-700 ring-4 ring-white" />
                <div className="text-sm font-medium text-navy-900">{!h.from_status ? h.to_status : h.from_status === h.to_status ? `${h.to_status}: HOD approved` : `${h.from_status} → ${h.to_status}`}</div>
                <div className="text-xs text-slate-500">{h.user_name} · {dateTime(h.created_at)}{h.ip ? ` · IP ${h.ip}` : ''}</div>
                {h.note && <div className="mt-0.5 text-xs text-slate-600">{h.note}</div>}
                {h.attachment_name && <div className="mt-0.5 text-xs text-slate-600">📎 {h.attachment_name}</div>}
              </li>
            ))}
          </ol>
        </Card>
      </div>
      {edit && <EditDeposit d={d} onClose={() => setEdit(false)} />}
      {addDocs && <AddDocs d={d} onClose={() => setAddDocs(false)} />}
    </>
  );
}

function EditDeposit({ d, onClose }: { d: Deposit; onClose: () => void }) {
  const { actions } = useData();
  const toast = useToast();
  const [f, setF] = useState({
    trainee_name: d.trainee_name, nrc: d.nrc, agent_code: d.agent_code ?? '', trainee_type: d.trainee_type, training_date: d.training_date,
    amount: String(d.amount), payment_date: d.payment_date,
  });
  const { busy, error, run } = useSubmit();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title={`Correct ${d.ref}`} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { await actions.editDeposit(d.id, { ...f, agent_code: f.agent_code || null, amount: Number(f.amount) }); toast('Deposit corrected; change logged'); onClose(); })}>Save correction</Button>
    </>}>
      <p className="mb-3 text-sm text-slate-600">Corrections are only possible while the deposit is Held. The old and new values are written to the audit log.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Trainee name" className="sm:col-span-2"><input className="input" value={f.trainee_name} onChange={set('trainee_name')} /></Field>
        <Field label="NRC number" hint={NRC_HINT}><input className="input" value={f.nrc} onChange={set('nrc')} /></Field>
        <Field label="Agent code / employee ID"><input className="input uppercase" value={f.agent_code} onChange={set('agent_code')} /></Field>
        <Field label="Trainee type"><select className="input" value={f.trainee_type} onChange={(e) => setF({ ...f, trainee_type: e.target.value as TraineeType })}>{TRAINEE_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Training date"><input className="input" type="date" value={f.training_date} onChange={set('training_date')} /></Field>
        <Field label="Amount (MMK)"><input className="input" type="number" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Payment date"><input className="input" type="date" max={today()} value={f.payment_date} onChange={set('payment_date')} /></Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}

function AddDocs({ d, onClose }: { d: Deposit; onClose: () => void }) {
  const { actions } = useData();
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const { busy, error, run } = useSubmit();
  return (
    <Modal open onClose={onClose} title={`Add documents to ${d.ref}`} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} disabled={!files.length} onClick={() => run(async () => { await actions.addDepositDocuments(d.id, files); toast(`${files.length} document(s) added`); onClose(); })}>Upload</Button>
    </>}>
      <FilePicker files={files} onChange={setFiles} multiple accept={DOC_ACCEPT} label="Choose documents…" />
      <ErrorNote error={error} />
    </Modal>
  );
}

function NoActionsHint({ d }: { d: Deposit }) {
  const { user } = useData();
  const msg: Partial<Record<Deposit['status'], string>> = {
    'Refund Request': d.hod_approved_by ? 'Waiting for Finance to confirm the refund payment.' : 'Waiting for HOD approval.',
    'Forfeiture Request': 'Waiting for HOD approval.',
    'Reversal Request': 'Waiting for HOD to decide the reversal.',
    Refunded: 'Closed: refunded.', Forfeited: 'Closed: forfeited to non-refundable revenue.',
    Held: 'Deposit is held until the trainee passes the exam (refund) or a forfeiture applies.',
  };
  return <p className="mt-3 text-xs text-slate-500">{msg[d.status]}{user.role === 'finance' && d.status !== 'Refund Request' ? ' Finance has read-only access here.' : ''}</p>;
}
