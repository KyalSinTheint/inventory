import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useData } from '../lib/store';
import { EXPENSE_CATEGORIES } from '../lib/types';
import { utilizationPct, variancePct, yearActual } from '../lib/logic';
import { date, mmk, pct, today } from '../lib/format';
import { Button, Card, Empty, ErrorNote, Field, Gauge, Modal, PageHeader, useSubmit, useToast } from '../components/ui';
import { varianceRows } from './reportSpecs';

export default function BudgetPage() {
  const { data, can, name } = useData();
  const [year, setYear] = useState(new Date().getFullYear());
  const [modal, setModal] = useState<null | 'expense' | 'budget'>(null);
  const budget = data.budgets.find((b) => b.fiscal_year === year);
  const actual = yearActual(year, data.stock_txns, data.expenses);
  const years = Array.from(new Set([new Date().getFullYear(), ...data.budgets.map((b) => b.fiscal_year)])).sort((a, b) => b - a);
  const rows = varianceRows(data).filter((r) => r.batch.start_date.startsWith(String(year)) || r.batch.end_date.startsWith(String(year)));
  const expenses = data.expenses.filter((e) => e.date.startsWith(String(year))).sort((a, b) => b.date.localeCompare(a.date));
  const v = variancePct(budget?.amount ?? 0, actual.total);
  return (
    <>
      <PageHeader title="Budget & Expenses" subtitle="Overall and per-batch training budgets against actual spend"
        actions={<>
          <select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Fiscal year">{years.map((y) => <option key={y} value={y}>FY{y}</option>)}</select>
          {can('budget.manage') && <Button variant="secondary" onClick={() => setModal('budget')}>Set FY budget</Button>}
          {can('expense.create') && <Button onClick={() => setModal('expense')}><Plus className="h-4 w-4" />Record expense</Button>}
        </>} />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card title={`Overall budget FY${year}`}>
          <Gauge value={utilizationPct(budget?.amount ?? 0, actual.total)} label={budget ? mmk(budget.amount) : 'No budget set'} sub={budget?.note} />
        </Card>
        <Card title="Actual spend" className="lg:col-span-2">
          <dl className="grid gap-4 sm:grid-cols-4">
            <div><dt className="text-xs text-slate-500">Purchases (approved stock in)</dt><dd className="text-lg font-semibold tabular-nums">{mmk(actual.purchases)}</dd></div>
            <div><dt className="text-xs text-slate-500">Other expenses</dt><dd className="text-lg font-semibold tabular-nums">{mmk(actual.expenses)}</dd></div>
            <div><dt className="text-xs text-slate-500">Total actual</dt><dd className="text-lg font-semibold tabular-nums">{mmk(actual.total)}</dd></div>
            <div><dt className="text-xs text-slate-500">Variance</dt><dd className={`text-lg font-semibold tabular-nums ${v !== null && v > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{budget ? `${mmk(actual.total - budget.amount)} (${pct(v)})` : '—'}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">Variance = (actual − budget) ÷ budget. Negative means under budget. Opening stock balances are not counted as spend.</p>
        </Card>
      </div>

      <Card title="Training batch variance" padded={false} className="mb-6">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Batch</th><th className="num">Budget</th><th className="num">Materials issued</th><th className="num">Other expenses</th><th className="num">Actual</th><th className="num">Variance</th><th className="num">Variance %</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.batch.id}><td><div className="font-medium text-navy-800">{r.batch.code}</div><div className="text-xs text-slate-500">{r.batch.name}</div></td>
                <td className="num">{mmk(r.batch.budget)}</td><td className="num">{mmk(r.materials)}</td><td className="num">{mmk(r.expenses)}</td><td className="num font-medium">{mmk(r.actual)}</td>
                <td className={`num ${r.variance > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{mmk(r.variance)}</td><td className={`num font-medium ${r.pct !== null && r.pct > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{pct(r.pct)}</td></tr>
            ))}</tbody>
          </table>
          {rows.length === 0 && <Empty>No batches in FY{year}.</Empty>}
        </div>
      </Card>

      <Card title="Expense log" padded={false}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Batch</th><th className="num">Amount</th><th>By</th></tr></thead>
            <tbody>{expenses.map((e) => <tr key={e.id}><td className="whitespace-nowrap">{date(e.date)}</td><td>{e.category}</td><td>{e.description}</td><td>{data.batches.find((b) => b.id === e.batch_id)?.code ?? 'General'}</td><td className="num">{mmk(e.amount)}</td><td className="text-xs">{name(e.created_by)}</td></tr>)}</tbody>
          </table>
          {expenses.length === 0 && <Empty>No expenses recorded for FY{year}.</Empty>}
        </div>
      </Card>
      {modal === 'expense' && <ExpenseModal onClose={() => setModal(null)} />}
      {modal === 'budget' && <BudgetModal year={year} current={budget?.amount} note={budget?.note} onClose={() => setModal(null)} />}
    </>
  );
}

function ExpenseModal({ onClose }: { onClose: () => void }) {
  const { data, actions } = useData();
  const toast = useToast();
  const [f, setF] = useState({ date: today(), batch_id: '', category: 'Venue', description: '', amount: '' });
  const { busy, error, run } = useSubmit();
  return (
    <Modal open onClose={onClose} title="Record expense" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { await actions.addExpense({ ...f, batch_id: f.batch_id || null, amount: Number(f.amount) }); toast('Expense recorded'); onClose(); })}>Save</Button>
    </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" required><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Category"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Training batch" className="sm:col-span-2"><select className="input" value={f.batch_id} onChange={(e) => setF({ ...f, batch_id: e.target.value })}><option value="">General department expense</option>{data.batches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}</select></Field>
        <Field label="Description" required className="sm:col-span-2"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Amount (MMK)" required><input className="input" type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}

function BudgetModal({ year, current, note: n, onClose }: { year: number; current?: number; note?: string; onClose: () => void }) {
  const { actions } = useData();
  const toast = useToast();
  const [amount, setAmount] = useState(String(current ?? ''));
  const [note, setNote] = useState(n ?? '');
  const { busy, error, run } = useSubmit();
  return (
    <Modal open onClose={onClose} title={`Overall L&D budget FY${year}`} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { await actions.setBudget(year, Number(amount), note); toast('Budget saved'); onClose(); })}>Save</Button>
    </>}>
      <div className="grid gap-3">
        <Field label="Budget (MMK)" required><input className="input" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Approval reference" /></Field>
      </div>
      <p className="mt-2 text-xs text-slate-500">Per-batch training budgets are set on each Training Batch.</p>
      <ErrorNote error={error} />
    </Modal>
  );
}
