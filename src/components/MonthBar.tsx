import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLabel, thisMonth } from '../lib/format';
import { Button } from './ui';

/** The selected month lives in the URL (?month=YYYY-MM) so it survives Back and page reloads. */
export function useMonthParam(): [string, (m: string) => void] {
  const [params, setParams] = useSearchParams();
  const month = params.get('month') ?? '';
  const set = (m: string) => {
    const p = new URLSearchParams(params);
    if (m) p.set('month', m); else p.delete('month');
    setParams(p, { replace: true });
  };
  return [month, set];
}

/** Month picker used at the top of every tab. Empty value = all months. */
export function MonthBar({ month, onChange, dates, note, allLabel = 'All months' }: {
  month: string; onChange: (m: string) => void; dates: (string | null | undefined)[]; note?: string; allLabel?: string;
}) {
  const months = useMemo(() => {
    const set = new Set<string>([thisMonth()]);
    for (const d of dates) if (d && /^\d{4}-\d{2}/.test(d)) set.add(d.slice(0, 7));
    if (month) set.add(month);
    return [...set].sort().reverse();
  }, [dates, month]);
  const i = months.indexOf(month);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xs">
      <CalendarDays className="h-4 w-4 text-kbz-navy" />
      <span className="text-sm font-semibold text-kbz-dark">View month</span>
      <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Previous month"
        disabled={month ? i === months.length - 1 : months.length === 0} onClick={() => onChange(month ? months[i + 1] : months[0])}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <select className="input w-auto" value={month} onChange={(e) => onChange(e.target.value)} aria-label="Month">
        <option value="">{allLabel}</option>
        {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </select>
      <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Next month"
        disabled={!month || i <= 0} onClick={() => onChange(months[i - 1])}>
        <ChevronRight className="h-4 w-4" />
      </button>
      {month && <Button size="sm" variant="ghost" onClick={() => onChange('')}>Show all</Button>}
      {note && <span className="ml-auto text-xs text-slate-500">{note}</span>}
    </div>
  );
}
