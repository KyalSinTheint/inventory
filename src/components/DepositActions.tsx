import { useState } from 'react';
import { CheckCircle2, FileUp, RotateCcw, Undo2, Ban, XCircle } from 'lucide-react';
import { useData } from '../lib/store';
import { FORFEIT_REASONS, type Deposit, type ForfeitReason } from '../lib/types';
import type { DepositAction } from '../lib/logic';
import { Button, ErrorNote, Field, Modal, useSubmit, useToast } from './ui';
import { mmk } from '../lib/format';

type Kind = DepositAction['kind'];

/** Buttons for every action the signed-in user may take on this deposit right now, each opening its form. */
export function DepositActions({ deposit: d, compact }: { deposit: Deposit; compact?: boolean }) {
  const { user, actions, can } = useData();
  const [open, setOpen] = useState<Kind | null>(null);
  const role = user.role;
  const mine = d.requested_by === user.id;
  const size = compact ? 'sm' : 'md';

  const btns: { kind: Kind; label: string; variant: 'primary' | 'secondary' | 'danger' | 'success'; icon: React.ReactNode }[] = [];
  if (d.status === 'Held' && can('deposit.request')) {
    btns.push({ kind: 'requestRefund', label: 'Request refund', variant: 'primary', icon: <Undo2 className="h-4 w-4" /> });
    btns.push({ kind: 'requestForfeit', label: 'Request forfeiture', variant: 'secondary', icon: <Ban className="h-4 w-4" /> });
  }
  if (role === 'hod' && !mine && ((d.status === 'Refund Request' && !d.hod_approved_by) || d.status === 'Forfeiture Request')) {
    btns.push({ kind: 'hodApprove', label: d.status === 'Refund Request' ? 'Approve refund' : 'Approve forfeiture', variant: 'success', icon: <CheckCircle2 className="h-4 w-4" /> });
  }
  if (role === 'finance' && d.status === 'Refund Request' && d.hod_approved_by) {
    btns.push({ kind: 'financeApprove', label: 'Confirm refund paid', variant: 'success', icon: <CheckCircle2 className="h-4 w-4" /> });
  }
  if ((role === 'hod' && !mine && (d.status === 'Forfeiture Request' || (d.status === 'Refund Request' && !d.hod_approved_by)))
    || (role === 'finance' && d.status === 'Refund Request' && d.hod_approved_by)) {
    btns.push({ kind: 'reject', label: 'Reject', variant: 'danger', icon: <XCircle className="h-4 w-4" /> });
  }
  if ((d.status === 'Refunded' || d.status === 'Forfeited') && can('deposit.request')) {
    btns.push({ kind: 'requestReversal', label: 'Request reversal', variant: 'secondary', icon: <RotateCcw className="h-4 w-4" /> });
  }
  if (role === 'hod' && !mine && d.status === 'Reversal Request') {
    btns.push({ kind: 'approveReversal', label: 'Approve reversal', variant: 'success', icon: <CheckCircle2 className="h-4 w-4" /> });
    btns.push({ kind: 'rejectReversal', label: 'Reject reversal', variant: 'danger', icon: <XCircle className="h-4 w-4" /> });
  }

  if (!btns.length) {
    if (mine && ['Refund Request', 'Forfeiture Request', 'Reversal Request'].includes(d.status) && role === 'hod') {
      return <p className="text-xs text-slate-500">You submitted this request, so another approver must decide it.</p>;
    }
    return null;
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {btns.map((b) => <Button key={b.kind} size={size} variant={b.variant} onClick={() => setOpen(b.kind)}>{b.icon}{b.label}</Button>)}
      </div>
      {open && <ActionModal kind={open} deposit={d} onClose={() => setOpen(null)} run={actions.depositAction} />}
    </>
  );
}

function ActionModal({ kind, deposit: d, onClose, run }: {
  kind: Kind; deposit: Deposit; onClose: () => void;
  run: (id: string, a: DepositAction, file?: File | null) => Promise<unknown>;
}) {
  const [note, setNote] = useState('');
  const [reason, setReason] = useState<ForfeitReason | ''>('');
  const [voucher, setVoucher] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const toast = useToast();
  const { busy, error, run: submit } = useSubmit();

  const meta: Record<Kind, { title: string; button: string; explain: string }> = {
    requestRefund: { title: 'Request deposit refund', button: 'Submit refund request', explain: 'For a trainee who passed the license exam. The HOD approves first, then Finance confirms payment.' },
    requestForfeit: { title: 'Request deposit forfeiture', button: 'Submit forfeiture request', explain: 'The deposit becomes non-refundable revenue once the HOD approves.' },
    hodApprove: { title: d.status === 'Refund Request' ? 'Approve refund (HOD)' : 'Approve forfeiture (HOD)', button: 'Approve', explain: d.status === 'Refund Request' ? 'After your approval, Finance confirms the payment and the deposit is closed as Refunded.' : 'The deposit will be closed as Forfeited and moved to the non-refundable revenue ledger. This cannot be edited afterwards.' },
    financeApprove: { title: 'Confirm refund payment (Finance)', button: 'Confirm & close as Refunded', explain: 'Record the payment voucher. The deposit will be closed as Refunded and can no longer be edited.' },
    reject: { title: 'Reject request', button: 'Reject', explain: 'The deposit goes back to Held so staff can correct and resubmit.' },
    requestReversal: { title: 'Request reversal of an approved transaction', button: 'Submit reversal request', explain: 'Approved refunds / forfeitures cannot be edited or deleted. If the HOD approves this reversal, the deposit returns to Held and every step stays in the audit log.' },
    approveReversal: { title: 'Approve reversal', button: 'Approve reversal', explain: `The deposit goes back from ${d.reversal_from} to Held. Reason given: “${d.reversal_reason ?? ''}”` },
    rejectReversal: { title: 'Reject reversal', button: 'Reject reversal', explain: `The deposit stays ${d.reversal_from}.` },
  };
  const m = meta[kind];
  const needsNote = ['requestForfeit', 'reject', 'requestReversal', 'rejectReversal'].includes(kind);

  const action = (): DepositAction => {
    switch (kind) {
      case 'requestRefund': return { kind, note, hasAttachment: !!file };
      case 'requestForfeit': return { kind, reason: reason || null, note, hasAttachment: !!file };
      case 'financeApprove': return { kind, voucherRef: voucher };
      case 'reject': return { kind, note };
      case 'requestReversal': return { kind, reason: note };
      case 'rejectReversal': return { kind, note };
      default: return { kind } as DepositAction;
    }
  };

  return (
    <Modal open onClose={onClose} title={m.title} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button variant={kind.startsWith('reject') ? 'danger' : 'primary'} busy={busy}
        onClick={() => submit(async () => { await run(d.id, action(), file); toast(`${d.ref}: ${m.button.toLowerCase()} done`); onClose(); })}>{m.button}</Button>
    </>}>
      <div className="mb-4 rounded-lg bg-silver-100 px-3 py-2 text-sm">
        <div className="font-medium text-navy-900">{d.ref} · {d.trainee_name} · NRC {d.nrc}</div>
        <div className="text-slate-600">{mmk(d.amount)} · paid {d.payment_date}</div>
      </div>
      <p className="mb-4 text-sm text-slate-600">{m.explain}</p>
      <div className="space-y-3">
        {kind === 'requestForfeit' && (
          <Field label="Forfeiture reason" required>
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value as ForfeitReason)}>
              <option value="">Choose a reason…</option>
              {FORFEIT_REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
        )}
        {(kind === 'requestRefund' || kind === 'requestForfeit') && (
          <Field label={kind === 'requestRefund' ? 'Exam Pass Certificate' : 'Forfeiture notice / evidence'} required hint="PDF or image. Required.">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-silver-300 px-3 py-3 text-sm text-slate-600 hover:border-navy-600">
              <FileUp className="h-4 w-4" />
              <span className="truncate">{file ? file.name : 'Choose file…'}</span>
              <input type="file" accept=".pdf,image/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </Field>
        )}
        {kind === 'financeApprove' && (
          <Field label="Finance payment voucher reference" required><input className="input" value={voucher} onChange={(e) => setVoucher(e.target.value)} placeholder="e.g. PV-55821" /></Field>
        )}
        {(needsNote || kind === 'requestRefund') && (
          <Field label={kind === 'requestForfeit' ? 'Evidence note' : kind === 'requestRefund' ? 'Note (optional)' : 'Reason'} required={needsNote}>
            <textarea className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={kind === 'requestForfeit' ? 'e.g. Absent from 4 of 6 sessions; HR exit letter dated…' : ''} />
          </Field>
        )}
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}
