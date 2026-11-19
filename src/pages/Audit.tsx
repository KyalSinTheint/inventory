import { useMemo, useState } from 'react';
import { useData } from '../lib/store';
import { dateTime, monthLabel } from '../lib/format';
import { MonthBar, useMonthParam } from '../components/MonthBar';
import { exportExcel } from '../lib/export';
import { Button, Empty, PageHeader, SearchBox, Tabs } from '../components/ui';
import type { AuditLog, DepositStatusLog } from '../lib/types';

export default function AuditPage() {
  const { data, can, user } = useData();
  const [tab, setTab] = useState<'all' | 'deposit'>('deposit');
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const [limit, setLimit] = useState(200);
  const [month, setMonth] = useMonthParam();
  const entities = Array.from(new Set(data.audit_logs.map((a) => a.entity))).sort();
  const all = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.audit_logs.filter((a) => (!month || a.created_at.startsWith(month)) && (!entity || a.entity === entity) && (!s || `${a.user_name} ${a.action} ${a.entity}`.toLowerCase().includes(s)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [data.audit_logs, q, entity, month]);
  const deps = useMemo(() => {
    const s = q.trim().toLowerCase();
    const trainee = (id: string) => data.deposits.find((d) => d.id === id)?.trainee_name ?? '';
    return data.deposit_status_log.filter((l) => !month || l.created_at.startsWith(month)).map((l) => ({ ...l, ref: trainee(l.deposit_id) }))
      .filter((l) => !s || `${l.ref} ${l.user_name} ${l.to_status}`.toLowerCase().includes(s))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [data.deposit_status_log, data.deposits, q, month]);

  const exportIt = () => tab === 'all'
    ? exportExcel<AuditLog>({ title: 'Audit Log', filename: `audit-log_${new Date().toISOString().slice(0, 10)}`, generatedBy: user.name, rows: all, columns: [
        { header: 'Time', value: (a) => a.created_at }, { header: 'User', value: (a) => a.user_name }, { header: 'Action', value: (a) => a.action },
        { header: 'Entity', value: (a) => a.entity }, { header: 'Details', value: (a) => a.details }, { header: 'IP', value: (a) => a.ip ?? '' }] })
    : exportExcel<DepositStatusLog & { ref: string }>({ title: 'Deposit State Changes', filename: `deposit-state-log_${new Date().toISOString().slice(0, 10)}`, generatedBy: user.name, rows: deps, columns: [
        { header: 'Time', value: (a) => a.created_at }, { header: 'Trainee', value: (a) => a.ref }, { header: 'From', value: (a) => a.from_status ?? '' },
        { header: 'To', value: (a) => a.to_status }, { header: 'User', value: (a) => a.user_name }, { header: 'Note', value: (a) => a.note ?? '' },
        { header: 'Attachment', value: (a) => a.attachment_name ?? '' }, { header: 'IP', value: (a) => a.ip ?? '' }] });

  return (
    <>
      <PageHeader title="Audit Log" subtitle="Read-only record of every change: who, when, what and from which IP address" actions={can('export') && <Button variant="secondary" onClick={exportIt}>Export Excel</Button>} />
      <MonthBar month={month} onChange={setMonth} dates={[...data.audit_logs.map((a) => a.created_at), ...data.deposit_status_log.map((l) => l.created_at)]}
        note={month ? `Activity in ${monthLabel(month)}` : 'All activity'} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'deposit', label: 'Deposit state changes' }, { id: 'all', label: 'All activity' }]} />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search user, trainee, action" />
        {tab === 'all' && <select className="input w-auto" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Entity"><option value="">All records</option>{entities.map((e) => <option key={e}>{e}</option>)}</select>}
      </div>
      <div className="table-wrap">
        {tab === 'all' ? (
          <table className="tbl">
            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Record</th><th>IP</th></tr></thead>
            <tbody>{all.slice(0, limit).map((a) => <tr key={a.id}><td className="whitespace-nowrap text-xs">{dateTime(a.created_at)}</td><td className="whitespace-nowrap">{a.user_name}</td><td className="whitespace-nowrap">{a.action}</td><td className="text-xs">{a.entity}</td><td className="whitespace-nowrap text-xs text-slate-500">{a.ip ?? '—'}</td></tr>)}</tbody>
          </table>
        ) : (
          <table className="tbl">
            <thead><tr><th>Time</th><th>Trainee</th><th>Change</th><th>User</th><th>IP</th></tr></thead>
            <tbody>{deps.slice(0, limit).map((l) => <tr key={l.id}><td className="whitespace-nowrap text-xs">{dateTime(l.created_at)}</td><td className="whitespace-nowrap font-medium text-navy-800">{l.ref}</td><td className="whitespace-nowrap">{l.from_status ? `${l.from_status} → ` : ''}<b>{l.to_status}</b></td><td className="whitespace-nowrap">{l.user_name}</td><td className="whitespace-nowrap text-xs text-slate-500">{l.ip ?? '—'}</td></tr>)}</tbody>
          </table>
        )}
        {(tab === 'all' ? all : deps).length === 0 && <Empty>No entries.</Empty>}
      </div>
      {(tab === 'all' ? all : deps).length > limit && <Button variant="ghost" className="mt-2" onClick={() => setLimit(limit + 500)}>Show more</Button>}
    </>
  );
}
