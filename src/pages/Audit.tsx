import { useMemo, useState } from 'react';
import { useData } from '../lib/store';
import { dateTime } from '../lib/format';
import { exportExcel } from '../lib/export';
import { Button, Empty, PageHeader, SearchBox, Tabs } from '../components/ui';
import type { AuditLog, DepositStatusLog } from '../lib/types';

export default function AuditPage() {
  const { data, can, user } = useData();
  const [tab, setTab] = useState<'all' | 'deposit'>('deposit');
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const [limit, setLimit] = useState(200);
  const entities = Array.from(new Set(data.audit_logs.map((a) => a.entity))).sort();
  const all = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.audit_logs.filter((a) => (!entity || a.entity === entity) && (!s || `${a.user_name} ${a.action} ${a.details}`.toLowerCase().includes(s)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [data.audit_logs, q, entity]);
  const deps = useMemo(() => {
    const s = q.trim().toLowerCase();
    const ref = (id: string) => data.deposits.find((d) => d.id === id)?.ref ?? '';
    return data.deposit_status_log.map((l) => ({ ...l, ref: ref(l.deposit_id) }))
      .filter((l) => !s || `${l.ref} ${l.user_name} ${l.note ?? ''} ${l.to_status}`.toLowerCase().includes(s))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [data.deposit_status_log, data.deposits, q]);

  const exportIt = () => tab === 'all'
    ? exportExcel<AuditLog>({ title: 'Audit Log', filename: `audit-log_${new Date().toISOString().slice(0, 10)}`, generatedBy: user.name, rows: all, columns: [
        { header: 'Time', value: (a) => a.created_at }, { header: 'User', value: (a) => a.user_name }, { header: 'Action', value: (a) => a.action },
        { header: 'Entity', value: (a) => a.entity }, { header: 'Details', value: (a) => a.details }, { header: 'IP', value: (a) => a.ip ?? '' }] })
    : exportExcel<DepositStatusLog & { ref: string }>({ title: 'Deposit State Changes', filename: `deposit-state-log_${new Date().toISOString().slice(0, 10)}`, generatedBy: user.name, rows: deps, columns: [
        { header: 'Time', value: (a) => a.created_at }, { header: 'Deposit', value: (a) => a.ref }, { header: 'From', value: (a) => a.from_status ?? '' },
        { header: 'To', value: (a) => a.to_status }, { header: 'User', value: (a) => a.user_name }, { header: 'Note', value: (a) => a.note ?? '' },
        { header: 'Attachment', value: (a) => a.attachment_name ?? '' }, { header: 'IP', value: (a) => a.ip ?? '' }] });

  return (
    <>
      <PageHeader title="Audit Log" subtitle="Read-only record of every change: who, when, what and from which IP address" actions={can('export') && <Button variant="secondary" onClick={exportIt}>Export Excel</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'deposit', label: 'Deposit state changes' }, { id: 'all', label: 'All activity' }]} />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search user, ref, details" />
        {tab === 'all' && <select className="input w-auto" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Entity"><option value="">All records</option>{entities.map((e) => <option key={e}>{e}</option>)}</select>}
      </div>
      <div className="table-wrap">
        {tab === 'all' ? (
          <table className="tbl">
            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Record</th><th>Details</th><th>IP</th></tr></thead>
            <tbody>{all.slice(0, limit).map((a) => <tr key={a.id}><td className="whitespace-nowrap text-xs">{dateTime(a.created_at)}</td><td className="whitespace-nowrap">{a.user_name}</td><td className="whitespace-nowrap">{a.action}</td><td className="text-xs">{a.entity}</td><td className="max-w-md break-words text-xs">{a.details}</td><td className="whitespace-nowrap text-xs text-slate-500">{a.ip ?? '—'}</td></tr>)}</tbody>
          </table>
        ) : (
          <table className="tbl">
            <thead><tr><th>Time</th><th>Deposit</th><th>Change</th><th>User</th><th>Note / attachment</th><th>IP</th></tr></thead>
            <tbody>{deps.slice(0, limit).map((l) => <tr key={l.id}><td className="whitespace-nowrap text-xs">{dateTime(l.created_at)}</td><td className="whitespace-nowrap font-medium text-navy-800">{l.ref}</td><td className="whitespace-nowrap">{l.from_status ? `${l.from_status} → ` : ''}<b>{l.to_status}</b></td><td className="whitespace-nowrap">{l.user_name}</td><td className="text-xs">{l.note}{l.attachment_name && <div>📎 {l.attachment_name}</div>}</td><td className="whitespace-nowrap text-xs text-slate-500">{l.ip ?? '—'}</td></tr>)}</tbody>
          </table>
        )}
        {(tab === 'all' ? all : deps).length === 0 && <Empty>No entries.</Empty>}
      </div>
      {(tab === 'all' ? all : deps).length > limit && <Button variant="ghost" className="mt-2" onClick={() => setLimit(limit + 500)}>Show more</Button>}
    </>
  );
}
