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
