import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useData } from '../lib/store';
import { TXN_LABELS } from '../lib/types';
import { requestValue, txnValue } from '../lib/logic';
import { dateTime, mmk, num } from '../lib/format';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, StatusBadge, useSubmit, useToast } from '../components/ui';
import { DepositActions } from '../components/DepositActions';

export default function ApprovalsPage() {
  const { data, user, name, actions } = useData();
  const isHod = user.role === 'hod';
  const notMine = (by: string | null) => by !== user.id;
  const depositsQ = data.deposits.filter((d) => isHod
    ? ((d.status === 'Refund Request' && !d.hod_approved_by) || d.status === 'Forfeiture Request' || d.status === 'Reversal Request') && notMine(d.requested_by)
    : d.status === 'Refund Request' && !!d.hod_approved_by);
  const requests = isHod ? data.material_requests.filter((r) => r.status === 'Pending' && notMine(r.created_by)) : [];
  const txns = isHod ? data.stock_txns.filter((t) => t.status === 'Pending' && notMine(t.created_by)) : [];
  const ownPending = isHod ? data.stock_txns.filter((t) => t.status === 'Pending' && !notMine(t.created_by)).length + data.material_requests.filter((r) => r.status === 'Pending' && !notMine(r.created_by)).length : 0;
  const batch = (id: string | null) => data.batches.find((b) => b.id === id);
  const item = (id: string) => data.items.find((i) => i.id === id);

  return (
    <>
      <PageHeader title="Approvals" subtitle={isHod ? 'Requests waiting for the L&D HOD' : 'Refunds approved by the HOD, waiting for Finance to confirm payment'} />
      {ownPending > 0 && <p className="mb-4 text-sm text-slate-500">{ownPending} pending item(s) you created yourself are hidden: another approver must decide them.</p>}
      <div className="space-y-6">
        <Card title={<>License deposits <Badge tone="amber">{depositsQ.length}</Badge></>} padded={false}>
          {depositsQ.length === 0 ? <Empty>No deposit requests waiting.</Empty> : (
            <ul className="divide-y divide-silver-100">
              {depositsQ.map((d) => (
                <li key={d.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><Link to={`/deposits/${d.id}`} className="font-medium text-navy-800 hover:underline">{d.ref}</Link><StatusBadge status={d.status} />{d.forfeit_reason && <Badge>{d.forfeit_reason}</Badge>}</div>
                    <div className="text-sm">{d.trainee_name} ({d.agent_code}) · <b>{mmk(d.amount)}</b> · {batch(d.batch_id)?.code}</div>
                    <div className="text-xs text-slate-500">Requested by {name(d.requested_by)} · {dateTime(d.requested_at)}{d.hod_approved_by && ` · HOD approved by ${name(d.hod_approved_by)}`}</div>
                    {(d.request_note || d.reversal_reason) && <div className="mt-1 text-xs text-slate-600">{d.status === 'Reversal Request' ? `Reversal reason: ${d.reversal_reason}` : d.request_note}</div>}
                    {d.attachment && <div className="mt-1 text-xs text-slate-600">📎 {d.attachment.name}</div>}
                  </div>
                  <DepositActions deposit={d} compact />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {isHod && (
          <Card title={<>Material requests <Badge tone="amber">{requests.length}</Badge></>} padded={false}>
            {requests.length === 0 ? <Empty>No material requests waiting.</Empty> : (
              <ul className="divide-y divide-silver-100">
                {requests.map((r) => {
                  const short = r.lines.filter((l) => l.qty > (item(l.item_id)?.qty_on_hand ?? 0));
                  return (
                    <li key={r.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-navy-800">{r.ref} · {batch(r.batch_id)?.code} <span className="font-normal text-slate-500">({mmk(requestValue(r, data.items))})</span></div>
                        <div className="text-xs text-slate-500">By {name(r.created_by)} · {dateTime(r.created_at)}</div>
                        {r.purpose && <div className="mt-1 text-sm">{r.purpose}</div>}
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {r.lines.map((l, i) => { const it = item(l.item_id); const bad = l.qty > (it?.qty_on_hand ?? 0); return <li key={i} className={`rounded-md px-2 py-0.5 text-xs ${bad ? 'bg-red-50 text-red-700' : 'bg-silver-100'}`}>{it?.name} × {num(l.qty)} <span className="text-slate-500">({num(it?.qty_on_hand ?? 0)} on hand)</span></li>; })}
                        </ul>
                        {short.length > 0 && <div className="mt-1 text-xs text-red-600">Not enough stock to issue: reject or wait for a stock in.</div>}
                      </div>
                      <Decide label="request" onDecide={(ok, note) => actions.decideRequest(r.id, ok, note)} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {isHod && (
          <Card title={<>Stock in & adjustments <Badge tone="amber">{txns.length}</Badge></>} padded={false}>
            {txns.length === 0 ? <Empty>No stock transactions waiting.</Empty> : (
              <ul className="divide-y divide-silver-100">
                {txns.map((t) => {
                  const it = item(t.item_id);
                  return (
                    <li key={t.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-navy-800">{t.ref} · {TXN_LABELS[t.type]}</div>
                        <div className="text-sm">{it?.name}: <b>{t.qty > 0 ? '+' : ''}{num(t.qty)}</b> {it?.unit} (on hand {num(it?.qty_on_hand ?? 0)}) · {mmk(txnValue(t))}</div>
                        <div className="text-xs text-slate-500">{[t.supplier, t.invoice_no, t.reason].filter(Boolean).join(' · ')} · by {name(t.created_by)} {dateTime(t.created_at)}</div>
                      </div>
                      <Decide label="transaction" onDecide={(ok, note) => actions.decideTxn(t.id, ok, note)} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

function Decide({ label, onDecide }: { label: string; onDecide: (approve: boolean, note: string) => Promise<unknown> }) {
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const { busy, error, run } = useSubmit();
  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <div className="flex gap-2">
        <Button size="sm" variant="success" busy={busy && !rejecting} onClick={() => run(async () => { await onDecide(true, ''); toast(`Approved ${label}`); })}><CheckCircle2 className="h-4 w-4" />Approve</Button>
        <Button size="sm" variant="danger" onClick={() => setRejecting(true)}><XCircle className="h-4 w-4" />Reject</Button>
      </div>
      {!rejecting && error && <div className="max-w-xs text-xs text-red-600">{error}</div>}
      {rejecting && (
        <Modal open onClose={() => setRejecting(false)} title={`Reject ${label}`} footer={<>
          <Button variant="secondary" onClick={() => setRejecting(false)}>Cancel</Button>
          <Button variant="danger" busy={busy} onClick={() => run(async () => { await onDecide(false, note); toast(`Rejected ${label}`); setRejecting(false); })}>Reject</Button>
        </>}>
          <Field label="Reason (sent back to staff)" required><textarea className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <ErrorNote error={error} />
        </Modal>
      )}
    </div>
  );
}
