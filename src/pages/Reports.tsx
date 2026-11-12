import { useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { useData } from '../lib/store';
import { CATEGORIES, DEPOSIT_STATUSES } from '../lib/types';
import { exportExcel, exportPdf, type ReportSpec } from '../lib/export';
import { today } from '../lib/format';
import { Button, Card, ErrorNote, Field, PageHeader } from '../components/ui';
import { assetReport, depositMasterReport, forfeitureReport, stockMovementReport, varianceReport } from './reportSpecs';

const firstOfMonth = () => today().slice(0, 8) + '01';
const startOfYear = () => `${new Date().getFullYear()}-01-01`;

export default function ReportsPage() {
  const { data, user, actions } = useData();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stock, setStock] = useState({ from: firstOfMonth(), to: today(), category: '' });
  const [dep, setDep] = useState({ status: '', batch: '' });
  const [forf, setForf] = useState({ from: startOfYear(), to: today() });

  async function go<T>(key: string, kind: 'xlsx' | 'pdf', spec: ReportSpec<T>) {
    setErr(null);
    setBusy(key + kind);
    try {
      await (kind === 'xlsx' ? exportExcel(spec) : exportPdf(spec));
      await actions.audit('Export', 'report', null, `${spec.title} (${kind.toUpperCase()}, ${spec.rows.length} rows)`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  const btns = (key: string, make: () => ReportSpec<never>) => (
    <div className="flex gap-2">
      <Button variant="secondary" busy={busy === key + 'xlsx'} onClick={() => go(key, 'xlsx', make())}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
      <Button variant="secondary" busy={busy === key + 'pdf'} onClick={() => go(key, 'pdf', make())}><FileText className="h-4 w-4" />PDF</Button>
    </div>
  );

  return (
    <>
      <PageHeader title="Reports" subtitle="Standard reports for management, finance and audit. Every export is recorded in the audit log." />
      <ErrorNote error={err} />
      <div className="mt-2 grid gap-4 lg:grid-cols-2">
        <Card title="1. Stock movement & valuation" actions={btns('stock', () => stockMovementReport(data, stock.from, stock.to, user.name, stock.category) as never)}>
          <p className="mb-3 text-sm text-slate-600">Opening, in, out, returns, adjustments and closing balance per item with value. Pick a single day for a daily report.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="From"><input className="input" type="date" value={stock.from} onChange={(e) => setStock({ ...stock, from: e.target.value })} /></Field>
            <Field label="To"><input className="input" type="date" value={stock.to} onChange={(e) => setStock({ ...stock, to: e.target.value })} /></Field>
            <Field label="Category"><select className="input" value={stock.category} onChange={(e) => setStock({ ...stock, category: e.target.value })}><option value="">All</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          </div>
        </Card>
        <Card title="2. License class deposit master" actions={btns('dep', () => depositMasterReport(data, data.deposits.filter((d) => (!dep.status || d.status === dep.status) && (!dep.batch || d.batch_id === dep.batch)), user.name) as never)}>
          <p className="mb-3 text-sm text-slate-600">Trainee, batch, amount and status (Held / Refunded / Forfeited) with totals.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status"><select className="input" value={dep.status} onChange={(e) => setDep({ ...dep, status: e.target.value })}><option value="">All</option>{DEPOSIT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Batch"><select className="input" value={dep.batch} onChange={(e) => setDep({ ...dep, batch: e.target.value })}><option value="">All</option>{data.batches.filter((b) => b.program === 'License').map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select></Field>
          </div>
        </Card>
        <Card title="3. Deposit forfeiture statement" actions={btns('forf', () => forfeitureReport(data, user.name, forf.from, forf.to) as never)}>
          <p className="mb-3 text-sm text-slate-600">Forfeited deposits with reason, evidence note and approver, split into the Course Incomplete and Service Term Not Met ledgers.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Approved from"><input className="input" type="date" value={forf.from} onChange={(e) => setForf({ ...forf, from: e.target.value })} /></Field>
            <Field label="To"><input className="input" type="date" value={forf.to} onChange={(e) => setForf({ ...forf, to: e.target.value })} /></Field>
          </div>
        </Card>
        <Card title="4. Training batch expense & budget variance" actions={btns('var', () => varianceReport(data, user.name) as never)}>
          <p className="text-sm text-slate-600">Budget against materials issued and other expenses for every batch, with variance in MMK and %, plus deposit totals per batch.</p>
        </Card>
        <Card title="5. Asset register & condition log" actions={btns('asset', () => assetReport(data, user.name) as never)}>
          <p className="text-sm text-slate-600">Every reusable asset with status, condition, current holder, cost, maintenance spend and last activity.</p>
        </Card>
      </div>
    </>
  );
}
