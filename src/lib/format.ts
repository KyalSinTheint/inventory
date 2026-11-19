export const mmk = (n: number) => `${Math.round(n).toLocaleString('en-US')} MMK`;
export const num = (n: number) => n.toLocaleString('en-US');
export const pct = (n: number | null, digits = 1) => (n === null || !isFinite(n) ? '—' : `${n.toFixed(digits)}%`);
export const date = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const today = () => new Date().toISOString().slice(0, 10);
export const thisMonth = () => new Date().toISOString().slice(0, 7);

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-10' → 'Oct 2026' */
export const monthLabel = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
/** Last day of a 'YYYY-MM' month as 'YYYY-MM-DD'. */
export const monthEnd = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
/** True when [start, end] overlaps the month. */
export const overlapsMonth = (ym: string, start: string | null | undefined, end: string | null | undefined) =>
  (!start || start.slice(0, 10) <= monthEnd(ym)) && (!end || end.slice(0, 10) >= `${ym}-01`);
