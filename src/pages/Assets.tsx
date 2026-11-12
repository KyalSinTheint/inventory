import { useMemo, useState } from 'react';
import { History, Plus } from 'lucide-react';
import { useData } from '../lib/store';
import { CATEGORIES, type Asset, type AssetAction, type AssetCondition, type Category } from '../lib/types';
import { date, dateTime, mmk, num, today } from '../lib/format';
import { Button, Empty, ErrorNote, Field, Modal, PageHeader, SearchBox, StatusBadge, useSubmit, useToast } from '../components/ui';

const NEXT: Record<Asset['status'], AssetAction[]> = {
  Available: ['Check Out', 'Maintenance Start', 'Reported Damaged', 'Reported Lost', 'Retired'],
  'Checked Out': ['Check In', 'Maintenance Start', 'Reported Damaged', 'Reported Lost'],
  Maintenance: ['Maintenance Done', 'Reported Damaged', 'Reported Lost'],
  Damaged: ['Maintenance Start', 'Reported Lost', 'Retired'],
  Lost: ['Retired'],
  Retired: [],
};

export default function AssetsPage() {
  const { data, can } = useData();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState<null | 'new' | { asset: Asset; action: AssetAction } | { history: Asset }>(null);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.assets.filter((a) => (!status || a.status === status) && (!s || [a.asset_tag, a.name, a.serial_no, a.holder ?? ''].some((v) => v.toLowerCase().includes(s))));
  }, [data.assets, q, status]);
  const batch = (id: string | null) => data.batches.find((b) => b.id === id)?.code;
  const counts = data.assets.reduce<Record<string, number>>((m, a) => ({ ...m, [a.status]: (m[a.status] ?? 0) + 1 }), {});
  return (
    <>
      <PageHeader title="Reusable Assets" subtitle="Unique asset IDs with check-out / check-in, maintenance and damaged / lost records"
        actions={can('asset.record') && <Button onClick={() => setModal('new')}><Plus className="h-4 w-4" />Register asset</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search tag, name, serial, holder" />
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>{Object.keys(NEXT).map((s) => <option key={s} value={s}>{s} ({counts[s] ?? 0})</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Asset ID</th><th>Name</th><th>Serial</th><th>Status</th><th>Condition</th><th>Holder</th><th className="num">Cost</th><th /></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap font-medium text-navy-800">{a.asset_tag}</td>
                <td>{a.name}<div className="text-xs text-slate-500">{a.location}</div></td>
                <td className="whitespace-nowrap text-xs">{a.serial_no}</td>
                <td><StatusBadge status={a.status} /></td>
                <td>{a.condition}</td>
                <td className="text-sm">{a.holder ?? '—'}{a.batch_id && <div className="text-xs text-slate-500">{batch(a.batch_id)}</div>}</td>
                <td className="num">{num(a.cost)}</td>
                <td>
                  <div className="flex items-center justify-end gap-1">
                    {can('asset.record') && NEXT[a.status].length > 0 && (
                      <select className="input w-auto py-1 text-xs" value="" onChange={(e) => e.target.value && setModal({ asset: a, action: e.target.value as AssetAction })} aria-label={`Action for ${a.asset_tag}`}>
                        <option value="">Action…</option>{NEXT[a.status].map((x) => <option key={x}>{x}</option>)}
                      </select>
                    )}
                    <button className="rounded p-1.5 text-slate-500 hover:bg-silver-100" onClick={() => setModal({ history: a })} aria-label="Condition log"><History className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No assets.</Empty>}
      </div>
      {modal === 'new' && <NewAsset onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && 'action' in modal && <ActionModal asset={modal.asset} action={modal.action} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && 'history' in modal && <HistoryModal asset={modal.history} onClose={() => setModal(null)} />}
    </>
  );
}

function NewAsset({ onClose }: { onClose: () => void }) {
  const { actions } = useData();
  const toast = useToast();
  const [f, setF] = useState({ name: '', serial_no: '', category: 'Training Materials' as Category, purchase_date: today(), cost: '', condition: 'Good' as AssetCondition, location: 'L&D Store Room' });
  const { busy, error, run } = useSubmit();
  return (
    <Modal open onClose={onClose} title="Register reusable asset" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { const a = await actions.registerAsset({ ...f, cost: Number(f.cost) || 0 }); toast(`${a.asset_tag} registered`); onClose(); })}>Register</Button>
    </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Asset name" required className="sm:col-span-2"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Flipchart Stand" /></Field>
        <Field label="Serial number" required><input className="input" value={f.serial_no} onChange={(e) => setF({ ...f, serial_no: e.target.value })} /></Field>
        <Field label="Category"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Category })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Purchase date"><input className="input" type="date" value={f.purchase_date} onChange={(e) => setF({ ...f, purchase_date: e.target.value })} /></Field>
        <Field label="Cost (MMK)"><input className="input" type="number" min="0" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
        <Field label="Condition"><select className="input" value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value as AssetCondition })}><option>Good</option><option>Fair</option><option>Damaged</option></select></Field>
        <Field label="Location"><input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
      </div>
      <p className="mt-3 text-xs text-slate-500">A unique Asset ID (AST-0000) is assigned automatically.</p>
      <ErrorNote error={error} />
    </Modal>
  );
}

function ActionModal({ asset: a, action, onClose }: { asset: Asset; action: AssetAction; onClose: () => void }) {
  const { data, actions } = useData();
  const toast = useToast();
  const [f, setF] = useState({ holder: '', batch_id: '', condition: (action === 'Check In' ? a.condition : 'Good') as AssetCondition, cost: '', note: '' });
  const { busy, error, run } = useSubmit();
  return (
    <Modal open onClose={onClose} title={`${action}: ${a.asset_tag}`} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { await actions.assetAction(a.id, action, { ...f, batch_id: f.batch_id || null, cost: Number(f.cost) || 0 }); toast(`${a.asset_tag}: ${action}`); onClose(); })}>Save</Button>
    </>}>
      <p className="mb-3 text-sm text-slate-600">{a.name} · {a.serial_no}</p>
      <div className="grid gap-3">
        {action === 'Check Out' && <>
          <Field label="Checked out to" required><input className="input" value={f.holder} onChange={(e) => setF({ ...f, holder: e.target.value })} placeholder="Trainer / staff name" /></Field>
          <Field label="For training batch"><select className="input" value={f.batch_id} onChange={(e) => setF({ ...f, batch_id: e.target.value })}><option value="">—</option>{data.batches.filter((b) => b.status !== 'Completed').map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}</select></Field>
        </>}
        {(action === 'Check In' || action === 'Maintenance Done') && (
          <Field label="Condition on return" required><select className="input" value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value as AssetCondition })}><option>Good</option><option>Fair</option><option>Damaged</option></select></Field>
        )}
        {(action === 'Maintenance Start' || action === 'Maintenance Done') && <Field label="Maintenance cost (MMK)"><input className="input" type="number" min="0" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>}
        <Field label="Note" required={action === 'Reported Damaged' || action === 'Reported Lost'}><textarea className="input min-h-16" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}

function HistoryModal({ asset: a, onClose }: { asset: Asset; onClose: () => void }) {
  const { data, name } = useData();
  const logs = data.asset_logs.filter((l) => l.asset_id === a.id).sort((x, y) => y.created_at.localeCompare(x.created_at));
  const batch = (id: string | null) => data.batches.find((b) => b.id === id)?.code;
  return (
    <Modal wide open onClose={onClose} title={`Condition log: ${a.asset_tag} ${a.name}`}>
      <p className="mb-3 text-sm text-slate-600">Serial {a.serial_no} · purchased {date(a.purchase_date)} · {mmk(a.cost)} · maintenance spend {mmk(logs.reduce((s, l) => s + l.cost, 0))}</p>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>When</th><th>Action</th><th>Condition</th><th>Holder / batch</th><th className="num">Cost</th><th>Note</th><th>By</th></tr></thead>
          <tbody>{logs.map((l) => <tr key={l.id}><td className="whitespace-nowrap text-xs">{dateTime(l.created_at)}</td><td className="whitespace-nowrap">{l.action}</td><td>{l.condition ?? ''}</td><td className="text-xs">{[l.holder, batch(l.batch_id)].filter(Boolean).join(' · ')}</td><td className="num">{l.cost ? num(l.cost) : ''}</td><td className="text-xs">{l.note}</td><td className="whitespace-nowrap text-xs">{name(l.created_by)}</td></tr>)}</tbody>
        </table>
      </div>
    </Modal>
  );
}
