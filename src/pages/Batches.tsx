import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import { useData } from '../lib/store';
import { LOCATIONS, LOCATION_LABELS, PROGRAMS, type Batch, type BatchStatus, type Location, type Program } from '../lib/types';
import { batchActual, budgetCategory, depositTotals, utilizationPct } from '../lib/logic';
import { date, mmk, pct } from '../lib/format';
import { Button, Empty, ErrorNote, Field, Modal, PageHeader, StatusBadge, useSubmit, useToast } from '../components/ui';

export default function BatchesPage() {
  const { data, can } = useData();
  const [edit, setEdit] = useState<Batch | 'new' | null>(null);
  const rows = [...data.batches].sort((a, b) => b.start_date.localeCompare(a.start_date));
  return (
    <>
      <PageHeader title="Training Batches" subtitle="Corporate, Agency, YCP and License classes, each with its own budget"
        actions={can('batch.manage') && <Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />New batch</Button>} />
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Dates</th><th>Status</th><th className="num">Budget</th><th className="num">Actual</th><th className="num">Used</th><th className="num">Deposits</th>{can('batch.manage') && <th />}</tr></thead>
          <tbody>
            {rows.map((b) => {
              const a = batchActual(b.id, data.stock_txns, data.expenses).total;
              const deps = data.deposits.filter((d) => d.batch_id === b.id);
              const u = utilizationPct(b.budget, a);
              return (
                <tr key={b.id}>
                  <td className="whitespace-nowrap font-medium text-navy-800">{b.code}</td>
                  <td>{b.name}</td><td className="whitespace-nowrap">{budgetCategory(b)}</td>
                  <td className="whitespace-nowrap text-xs">{date(b.start_date)} – {date(b.end_date)}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td className="num">{mmk(b.budget)}</td><td className="num">{mmk(a)}</td>
                  <td className={`num font-medium ${u > 100 ? 'text-red-600' : ''}`}>{b.budget ? pct(u, 0) : '—'}</td>
                  <td className="num">{deps.length ? <Link className="text-navy-700 hover:underline" to={`/deposits?batch=${b.id}`}>{deps.length} · {mmk(depositTotals(deps).held)} held</Link> : '—'}</td>
                  {can('batch.manage') && <td><button className="rounded p-1 text-slate-500 hover:bg-silver-100" onClick={() => setEdit(b)} aria-label={`Edit ${b.code}`}><Pencil className="h-4 w-4" /></button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No batches yet.</Empty>}
      </div>
      {edit && <BatchModal batch={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function BatchModal({ batch, onClose }: { batch?: Batch; onClose: () => void }) {
  const { actions } = useData();
  const toast = useToast();
  const [f, setF] = useState({
    code: batch?.code ?? '', name: batch?.name ?? '', program: batch?.program ?? ('License' as Program), location: (batch?.location ?? 'YGN') as Location | null, start_date: batch?.start_date ?? '',
    end_date: batch?.end_date ?? '', budget: String(batch?.budget ?? ''), status: batch?.status ?? ('Planned' as BatchStatus),
  });
  const { busy, error, run } = useSubmit();
  return (
    <Modal open onClose={onClose} title={batch ? `Edit ${batch.code}` : 'New training batch'} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { await actions.saveBatch({ ...f, id: batch?.id, budget: Number(f.budget) || 0 }); toast('Batch saved'); onClose(); })}>Save</Button>
    </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Batch code" required><input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="LIC-2027-01" /></Field>
        <Field label="Program"><select className="input" value={f.program} onChange={(e) => setF({ ...f, program: e.target.value as Program })}>{PROGRAMS.map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Branch" required={f.program === 'License'} hint={f.program === 'License' ? `Budget category: License - ${f.location ?? '?'}` : undefined}>
          <select className="input" value={f.location ?? ''} onChange={(e) => setF({ ...f, location: (e.target.value || null) as Location | null })}>
            {f.program !== 'License' && <option value="">—</option>}
            {LOCATIONS.map((l) => <option key={l} value={l}>{l} · {LOCATION_LABELS[l]}</option>)}
          </select>
        </Field>
        <Field label="Name" required className="sm:col-span-2"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Start date"><input className="input" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
        <Field label="End date"><input className="input" type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
        <Field label="Training budget (MMK)"><input className="input" type="number" min="0" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} /></Field>
        <Field label="Status"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as BatchStatus })}><option>Planned</option><option>Active</option><option>Completed</option></select></Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}
