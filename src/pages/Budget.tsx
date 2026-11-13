import { useMemo, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { useData } from '../lib/store';
import { BUDGET_CATEGORIES, EXPENSE_TYPES, type BudgetCategory } from '../lib/types';
import { budgetCategory, categoryActuals, monthlySpend, utilizationPct, variancePct, yearActual } from '../lib/logic';
import { date, mmk, num, pct, today } from '../lib/format';
import { exportWorkbook } from '../lib/export';
import { Button, Card, Empty, ErrorNote, Field, Gauge, Modal, PageHeader, cx, useSubmit, useToast } from '../components/ui';
import { varianceRows } from './reportSpecs';

/** The categories the L&D team tracks; the others only show when they have spend or a budget. */
const MAIN: BudgetCategory[] = ['YCP', 'License - YGN', 'License - MDY', 'License - TGI', 'Product & Soft Skills'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function BudgetPage() {
  const { data, can, name, user, actions } = useData();
  const [year, setYear] = useState(new Date().getFullYear());
  const [modal, setModal] = useState<null | 'expense' | 'budget'>(null);
  const [month, setMonth] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const budgetOf = (c: 'Overall' | BudgetCategory) => data.budgets.find((b) => b.fiscal_year === year && (b.category ?? 'Overall') === c);
  const overall = budgetOf('Overall');
  const actual = yearActual(year, data.stock_txns, data.expenses);
  const years = Array.from(new Set([new Date().getFullYear(), ...data.budgets.map((b) => b.fiscal_year)])).sort((a, b) => b - a);
  const months = useMemo(() => monthlySpend(year, data.stock_txns, data.expenses), [year, data.stock_txns, data.expenses]);
  const cats = useMemo(() => categoryActuals(year, data.stock_txns, data.expenses, data.batches), [year, data]);
  const catRows = BUDGET_CATEGORIES
    .map((c) => ({ c, budget: budgetOf(c)?.amount ?? 0, a: cats.get(c) ?? { materials: 0, expenses: 0, total: 0 } }))
    .filter((r) => MAIN.includes(r.c) || r.budget || r.a.total);
  const batchRows = varianceRows(data).filter((r) => r.batch.start_date.startsWith(String(year)) || r.batch.end_date.startsWith(String(year)));
  const expenses = data.expenses
    .filter((e) => e.date.startsWith(month || String(year)) && (!catFilter || e.budget_category === catFilter))
    .sort((a, b) => b.date.localeCompare(a.date));
  const v = variancePct(overall?.amount ?? 0, actual.total);
  const maxMonth = Math.max(1, ...months.map((m) => m.total));
  const batchCode = (id: string | null) => data.batches.find((b) => b.id === id)?.code ?? '';

  const fy = `FY${year}`;
  const monthlyRows = (): (string | number)[][] => [
    ['Month', 'Purchases', 'Other expenses', 'Total spend', 'Cumulative', 'Cumulative % of budget', 'Materials issued to classes'],
    ...months.map((m, i) => [`${MONTHS[i]} ${year}`, m.purchases, m.expenses, m.total, m.cumulative, overall ? `${utilizationPct(overall.amount, m.cumulative).toFixed(1)}%` : '', m.issued]),
    ['Total', actual.purchases, actual.expenses, actual.total, '', '', months.reduce((s, m) => s + m.issued, 0)],
  ];
  const categoryRows = (): (string | number)[][] => [
    ['Category', 'Budget', 'Materials issued', 'Expenses', 'Actual', 'Remaining', 'Used %'],
    ...catRows.map((r) => [r.c, r.budget, r.a.materials, r.a.expenses, r.a.total, r.budget ? r.budget - r.a.total : '', r.budget ? `${utilizationPct(r.budget, r.a.total).toFixed(1)}%` : '']),
    ['Total', catRows.reduce((s, r) => s + r.budget, 0), catRows.reduce((s, r) => s + r.a.materials, 0), catRows.reduce((s, r) => s + r.a.expenses, 0), catRows.reduce((s, r) => s + r.a.total, 0), '', ''],
  ];
  const batchSheetRows = (): (string | number)[][] => [
    ['Batch', 'Name', 'Category', 'Budget', 'Materials', 'Other expenses', 'Actual', 'Variance', 'Variance %'],
    ...batchRows.map((r) => [r.batch.code, r.batch.name, budgetCategory(r.batch), r.batch.budget, r.materials, r.expenses, r.actual, r.variance, r.pct === null ? '' : `${r.pct.toFixed(1)}%`]),
  ];
  const expenseRows = (list: typeof expenses): (string | number)[][] => [
    ['Date', 'Category', 'Type', 'Description', 'Batch', 'Amount', 'Recorded by'],
    ...[...list].sort((a, b) => a.date.localeCompare(b.date)).map((e) => [e.date, e.budget_category, e.category, e.description, batchCode(e.batch_id), e.amount, name(e.created_by)]),
    ['', '', '', '', 'Total', list.reduce((s, e) => s + e.amount, 0), ''],
  ];
  /** Downloads one table as its own Excel file, with a title row, and logs the export. */
  const exportTable = async (title: string, file: string, rows: (string | number)[][]) => {
    await exportWorkbook(`${file}_${fy}_${today()}`, [{ name: title, rows: [[`${title} · ${fy}`], [`Generated ${new Date().toLocaleString('en-GB')} by ${user.name}`], [], ...rows] }]);
    await actions.audit('Export', 'report', null, `${title} ${fy} (Excel, ${rows.length - 1} rows)`);
  };
  const xl = (onClick: () => void) => can('export')
    ? <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onClick(); }}><Download className="h-3.5 w-3.5" />Excel</Button> : null;
  const logTitle = `Expense log${month ? ` ${MONTHS[Number(month.slice(5)) - 1]}` : ''}${catFilter ? ` ${catFilter}` : ''}`;

  const exportExcel = async () => {
    await exportWorkbook(`budget_${fy}_${today()}`, [
      { name: 'Summary', rows: [
        [`L&D Budget & Expense: ${fy}`], [`Generated ${new Date().toLocaleString('en-GB')} by ${user.name}`], [],
        ['Overall budget', overall?.amount ?? 0], ['Purchases (approved stock in)', actual.purchases], ['Other expenses', actual.expenses],
        ['Total actual', actual.total], ['Variance (actual − budget)', overall ? actual.total - overall.amount : ''], ['Variance %', v === null ? '' : `${v.toFixed(1)}%`],
      ] },
      { name: 'Monthly', rows: monthlyRows() },
      { name: 'By category', rows: categoryRows() },
      { name: 'Category by month', rows: categoryMonthMatrix(year, data, catRows.map((r) => r.c)) },
      { name: 'Batches', rows: batchSheetRows() },
      { name: 'Expenses', rows: expenseRows(data.expenses.filter((e) => e.date.startsWith(String(year)))) },
    ]);
    await actions.audit('Export', 'report', null, `Budget workbook ${fy} (Excel)`);
  };

  return (
    <>
      <PageHeader title="Budget & Expenses" subtitle="Overall, category and batch budgets against actual spend"
        actions={<>
          <select className="input w-auto" value={year} onChange={(e) => { setYear(Number(e.target.value)); setMonth(''); }} aria-label="Fiscal year">{years.map((y) => <option key={y} value={y}>FY{y}</option>)}</select>
          {can('export') && <Button variant="secondary" onClick={exportExcel}><Download className="h-4 w-4" />Export all (Excel)</Button>}
          {can('budget.manage') && <Button variant="secondary" onClick={() => setModal('budget')}>Set budgets</Button>}
          {can('expense.create') && <Button onClick={() => setModal('expense')}><Plus className="h-4 w-4" />Record expense</Button>}
        </>} />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card title={`Overall budget FY${year}`}>
          <Gauge value={utilizationPct(overall?.amount ?? 0, actual.total)} label={overall ? mmk(overall.amount) : 'No budget set'} sub={overall?.note} />
        </Card>
        <Card title="Actual spend" className="lg:col-span-2">
          <dl className="grid gap-4 sm:grid-cols-4">
            <div><dt className="text-xs text-slate-500">Purchases (approved stock in)</dt><dd className="text-lg font-semibold tabular-nums">{mmk(actual.purchases)}</dd></div>
            <div><dt className="text-xs text-slate-500">Other expenses</dt><dd className="text-lg font-semibold tabular-nums">{mmk(actual.expenses)}</dd></div>
            <div><dt className="text-xs text-slate-500">Total actual</dt><dd className="text-lg font-semibold tabular-nums">{mmk(actual.total)}</dd></div>
            <div><dt className="text-xs text-slate-500">Variance</dt><dd className={`text-lg font-semibold tabular-nums ${v !== null && v > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{overall ? `${mmk(actual.total - overall.amount)} (${pct(v)})` : '—'}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">Variance = (actual − budget) ÷ budget. Negative means under budget. Opening stock balances are not counted as spend.</p>
        </Card>
      </div>

      <Card title="Category expense" className="mb-6" padded={false} actions={xl(() => exportTable('Category expense', 'category-expense', categoryRows()))}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Category</th><th className="num">Budget</th><th className="num">Materials issued</th><th className="num">Expenses</th><th className="num">Actual</th><th className="num">Remaining</th><th className="min-w-40">Used</th></tr></thead>
            <tbody>{catRows.map((r) => {
              const u = utilizationPct(r.budget, r.a.total);
              return (
                <tr key={r.c} className="cursor-pointer" onClick={() => setCatFilter(catFilter === r.c ? '' : r.c)}>
                  <td className={cx('whitespace-nowrap font-medium', catFilter === r.c ? 'text-navy-700 underline' : 'text-navy-900')}>{r.c}</td>
                  <td className="num">{r.budget ? mmk(r.budget) : '—'}</td>
                  <td className="num">{mmk(r.a.materials)}</td>
                  <td className="num">{mmk(r.a.expenses)}</td>
                  <td className="num font-medium">{mmk(r.a.total)}</td>
                  <td className={cx('num', r.budget && r.budget - r.a.total < 0 ? 'text-red-600' : '')}>{r.budget ? mmk(r.budget - r.a.total) : '—'}</td>
                  <td>{r.budget ? (
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-silver-200"><div className={cx('h-full rounded-full', u > 100 ? 'bg-red-600' : u > 85 ? 'bg-amber-500' : 'bg-navy-700')} style={{ width: `${Math.min(100, u)}%` }} /></div>
                      <span className={cx('w-11 text-right text-xs tabular-nums', u > 100 && 'font-semibold text-red-600')}>{u.toFixed(0)}%</span>
                    </div>) : <span className="text-xs text-slate-400">no budget</span>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-xs text-slate-500">Actual = materials issued to the category's batches (at cost) + expenses tagged to it. License classes are split by branch. Click a category to filter the expense log.</p>
      </Card>

      <Card title={`Monthly preview FY${year}`} className="mb-6" actions={xl(() => exportTable('Monthly preview', 'monthly-preview', monthlyRows()))}>
        <div className="flex h-44 items-end gap-1.5 sm:gap-3" role="group" aria-label="Monthly spend chart">
          {months.map((m, i) => {
            const h = (m.total / maxMonth) * 100;
            const hp = m.total ? (m.purchases / m.total) * h : 0;
            const active = month === m.month;
            return (
              <button key={m.month} onClick={() => setMonth(active ? '' : m.month)} title={`${MONTHS[i]}: ${mmk(m.total)}`} aria-label={`${MONTHS[i]} ${year}: ${mmk(m.total)}`} aria-pressed={active}
                className={cx('flex h-full flex-1 flex-col items-center justify-end gap-1 rounded-md pb-0.5', active && 'bg-navy-50')}>
                <span className="hidden text-[10px] tabular-nums text-slate-500 sm:block">{m.total ? `${(m.total / 1_000_000).toFixed(1)}M` : ''}</span>
                <div className="flex w-full max-w-10 flex-col justify-end overflow-hidden rounded-t" style={{ height: `${h}%` }}>
                  <div className="w-full bg-sky-400" style={{ height: `${h ? ((h - hp) / h) * 100 : 0}%` }} />
                  <div className="w-full bg-navy-700" style={{ height: `${h ? (hp / h) * 100 : 0}%` }} />
                </div>
                <span className={cx('text-[11px]', active ? 'font-semibold text-navy-900' : 'text-slate-500')}>{MONTHS[i]}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-navy-700" />Purchases</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-400" />Other expenses</span>
          <span>Click a month to see its expenses below.</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Month</th><th className="num">Purchases</th><th className="num">Other expenses</th><th className="num">Total</th><th className="num">Cumulative</th><th className="num">% of budget</th><th className="num">Materials issued</th></tr></thead>
            <tbody>{months.map((m, i) => (
              <tr key={m.month} className={cx('cursor-pointer', month === m.month && 'bg-navy-50')} onClick={() => setMonth(month === m.month ? '' : m.month)}>
                <td className="whitespace-nowrap">{MONTHS[i]} {year}</td><td className="num">{num(m.purchases)}</td><td className="num">{num(m.expenses)}</td>
                <td className="num font-medium">{num(m.total)}</td><td className="num">{num(m.cumulative)}</td>
                <td className="num">{overall ? pct(utilizationPct(overall.amount, m.cumulative), 0) : '—'}</td><td className="num text-slate-500">{num(m.issued)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>

      <Card title="Training batch variance" padded={false} className="mb-6" actions={xl(() => exportTable('Training batch variance', 'batch-variance', batchSheetRows()))}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Batch</th><th>Category</th><th className="num">Budget</th><th className="num">Materials issued</th><th className="num">Other expenses</th><th className="num">Actual</th><th className="num">Variance</th><th className="num">Variance %</th></tr></thead>
            <tbody>{batchRows.map((r) => (
              <tr key={r.batch.id}><td className="min-w-48"><div className="whitespace-nowrap font-medium text-navy-800">{r.batch.code}</div><div className="text-xs text-slate-500">{r.batch.name}</div></td>
                <td className="whitespace-nowrap text-sm">{budgetCategory(r.batch)}</td>
                <td className="num">{mmk(r.batch.budget)}</td><td className="num">{mmk(r.materials)}</td><td className="num">{mmk(r.expenses)}</td><td className="num font-medium">{mmk(r.actual)}</td>
                <td className={`num ${r.variance > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{mmk(r.variance)}</td><td className={`num font-medium ${r.pct !== null && r.pct > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{pct(r.pct)}</td></tr>
            ))}</tbody>
          </table>
          {batchRows.length === 0 && <Empty>No batches in FY{year}.</Empty>}
        </div>
      </Card>

      <Card title={`Expense log${month ? ` · ${MONTHS[Number(month.slice(5)) - 1]} ${year}` : ''}${catFilter ? ` · ${catFilter}` : ''}`} padded={false}
        actions={<>
          {(month || catFilter) && <Button size="sm" variant="ghost" onClick={() => { setMonth(''); setCatFilter(''); }}>Show all FY{year}</Button>}
          {expenses.length > 0 && xl(() => exportTable(logTitle, 'expense-log', expenseRows(expenses)))}
        </>}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Category</th><th>Type</th><th>Description</th><th>Batch</th><th className="num">Amount</th><th>By</th></tr></thead>
            <tbody>{expenses.map((e) => <tr key={e.id}><td className="whitespace-nowrap">{date(e.date)}</td><td className="whitespace-nowrap">{e.budget_category}</td><td>{e.category}</td><td>{e.description}</td><td>{batchCode(e.batch_id) || '—'}</td><td className="num">{mmk(e.amount)}</td><td className="text-xs">{name(e.created_by)}</td></tr>)}</tbody>
          </table>
          {expenses.length === 0 && <Empty>No expenses for this selection.</Empty>}
        </div>
        {expenses.length > 0 && <p className="border-t border-silver-100 px-4 py-2 text-right text-sm">Total: <b>{mmk(expenses.reduce((s, e) => s + e.amount, 0))}</b></p>}
      </Card>
      {modal === 'expense' && <ExpenseModal onClose={() => setModal(null)} />}
      {modal === 'budget' && <BudgetModal year={year} onClose={() => setModal(null)} />}
    </>
  );
}

function categoryMonthMatrix(year: number, data: ReturnType<typeof useData>['data'], categories: BudgetCategory[]): (string | number)[][] {
  const rows: (string | number)[][] = [['Category', ...MONTHS.map((m) => `${m} ${year}`), 'Total']];
  for (const c of categories) {
    const vals = MONTHS.map((_, i) => {
      const ym = `${year}-${String(i + 1).padStart(2, '0')}`;
      const inMonth = categoryActuals(year, data.stock_txns.filter((t) => (t.decided_at ?? t.created_at).startsWith(ym)), data.expenses.filter((e) => e.date.startsWith(ym)), data.batches);
      return inMonth.get(c)?.total ?? 0;
    });
    rows.push([c, ...vals, vals.reduce((s, x) => s + x, 0)]);
  }
  return rows;
}

function ExpenseModal({ onClose }: { onClose: () => void }) {
  const { data, actions } = useData();
  const toast = useToast();
  const [f, setF] = useState({ date: today(), batch_id: '', budget_category: 'YCP' as BudgetCategory, category: 'Venue', description: '', amount: '' });
  const { busy, error, run } = useSubmit();
  const batch = data.batches.find((b) => b.id === f.batch_id);
  return (
    <Modal open onClose={onClose} title="Record expense" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { await actions.addExpense({ ...f, batch_id: f.batch_id || null, amount: Number(f.amount) }); toast('Expense recorded'); onClose(); })}>Save</Button>
    </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" required><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Expense type"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{EXPENSE_TYPES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Training batch" className="sm:col-span-2"><select className="input" value={f.batch_id} onChange={(e) => setF({ ...f, batch_id: e.target.value })}><option value="">No batch (choose category below)</option>{data.batches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}</select></Field>
        <Field label="Category" required className="sm:col-span-2" hint={batch ? 'Taken from the batch' : undefined}>
          {batch ? <input className="input" disabled value={budgetCategory(batch)} /> : (
            <select className="input" value={f.budget_category} onChange={(e) => setF({ ...f, budget_category: e.target.value as BudgetCategory })}>{BUDGET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          )}
        </Field>
        <Field label="Description" required className="sm:col-span-2"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Amount (MMK)" required><input className="input" type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}

function BudgetModal({ year, onClose }: { year: number; onClose: () => void }) {
  const { data, actions } = useData();
  const toast = useToast();
  const cur = (c: string) => data.budgets.find((b) => b.fiscal_year === year && (b.category ?? 'Overall') === c);
  const keys = ['Overall', ...BUDGET_CATEGORIES] as const;
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(keys.map((k) => [k, cur(k) ? String(cur(k)!.amount) : ''])));
  const [note, setNote] = useState(cur('Overall')?.note ?? '');
  const { busy, error, run } = useSubmit();
  const sumCats = BUDGET_CATEGORIES.reduce((s, c) => s + (Number(vals[c]) || 0), 0);
  return (
    <Modal open onClose={onClose} title={`Budgets FY${year}`} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => {
        for (const k of keys) {
          const amt = Number(vals[k]);
          if (vals[k] !== '' && amt > 0) await actions.setBudget(year, k, amt, k === 'Overall' ? note : cur(k)?.note ?? '');
        }
        toast('Budgets saved'); onClose();
      })}>Save</Button>
    </>}>
      <div className="grid gap-3">
        <Field label="Overall L&D budget (MMK)" required><input className="input" type="number" min="0" value={vals.Overall} onChange={(e) => setVals({ ...vals, Overall: e.target.value })} /></Field>
        <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Approval reference" /></Field>
        <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Category budgets</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {BUDGET_CATEGORIES.map((c) => (
            <Field key={c} label={c}><input className="input" type="number" min="0" value={vals[c]} onChange={(e) => setVals({ ...vals, [c]: e.target.value })} placeholder="—" /></Field>
          ))}
        </div>
        <p className={cx('text-xs', vals.Overall && sumCats > Number(vals.Overall) ? 'text-red-600' : 'text-slate-500')}>Category total: {mmk(sumCats)}{vals.Overall ? ` of ${mmk(Number(vals.Overall))} overall` : ''}</p>
      </div>
      <p className="mt-2 text-xs text-slate-500">Per-batch training budgets are set on each Training Batch.</p>
      <ErrorNote error={error} />
    </Modal>
  );
}
