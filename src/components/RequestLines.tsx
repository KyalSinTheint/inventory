import type { Item, RequestLine } from '../lib/types';
import { canSplit, fmtQty, isCustomLine, lineAmount, lineName, lineQtyText, lineShort } from '../lib/logic';
import { num } from '../lib/format';
import { cx } from './ui';

/** Everything an approver needs about one request line: unit, price per unit and per piece, amount, stock. */
export function lineInfo(l: RequestLine, items: Item[]) {
  const it = l.item_id ? items.find((i) => i.id === l.item_id) : undefined;
  const custom = isCustomLine(l);
  const unit = it ? it.unit : l.unit?.trim() || 'unit';
  const unitPrice = it ? it.unit_cost : l.unit_cost ?? 0;
  const pack = it ? (canSplit(it) ? it.pack_qty! : null) : l.pack_qty && l.pack_qty > 1 ? l.pack_qty : null;
  const pieceUnit = (it ? it.piece_unit : l.piece_unit) || 'piece';
  return {
    it, custom, unit, unitPrice, pack, pieceUnit,
    name: lineName(l, items),
    qtyText: lineQtyText(l, items),
    // Qty column: the number only (the unit has its own column), or pieces when taken out of a pack.
    qtyShort: it && canSplit(it) && l.by_piece ? `${num(l.qty)} ${pieceUnit}${l.qty === 1 ? '' : 's'}` : num(l.qty),
    piecePrice: pack && unitPrice ? unitPrice / pack : null,
    amount: lineAmount(l, items),
    short: !custom && lineShort(l, it),
  };
}

const money = (n: number) => (n % 1 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : num(n));

/** The request's items as a table: item, qty, unit, price per unit, price per piece, amount, and stock while pending. */
export function RequestLinesTable({ lines, items, pending }: { lines: RequestLine[]; items: Item[]; pending: boolean }) {
  const rows = lines.map((l) => ({ l, ...lineInfo(l, items) }));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 text-right font-medium">Qty</th>
            <th className="px-3 py-2 font-medium">Unit</th>
            <th className="px-3 py-2 text-right font-medium">Price / unit</th>
            <th className="px-3 py-2 text-right font-medium">Price / piece</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            {pending && <th className="px-3 py-2 text-right font-medium">In store</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i} className={r.short ? 'bg-rose-50/60' : undefined}>
              <td className="px-3 py-2 font-medium text-kbz-dark">
                {r.name}
                {r.custom && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Not in store</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{r.qtyShort}</td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.unit}{r.pack ? <span className="text-slate-400"> of {r.pack} {r.pieceUnit}s</span> : null}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.unitPrice ? `${money(r.unitPrice)} MMK` : '—'}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">{r.piecePrice !== null ? `${money(Math.round(r.piecePrice * 100) / 100)} MMK / ${r.pieceUnit}` : '—'}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-kbz-blue">{num(Math.round(r.amount))} MMK</td>
              {pending && (
                <td className={cx('whitespace-nowrap px-3 py-2 text-right text-xs', r.short ? 'font-semibold text-kbz-red' : 'text-slate-500')}>
                  {r.it ? fmtQty(r.it, r.it.qty_on_hand) : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50">
            <td colSpan={5} className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Total</td>
            <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums text-kbz-blue">{num(Math.round(total))} MMK</td>
            {pending && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
