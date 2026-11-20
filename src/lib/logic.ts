// Pure business rules. No React and no storage here, so they can be unit tested.
import type {
  ApprovalStatus, Batch, BudgetCategory, Deposit, DepositStatus, Expense, ForfeitReason, Item, MaterialRequest,
  RequestLine, Role, StockTxn,
} from './types';
import { BUDGET_CATEGORIES } from './types';

export class RuleError extends Error {}

// ---------------------------------------------------------------- permissions
export type Permission =
  | 'stock.create' | 'request.create' | 'count.create' | 'deposit.create' | 'deposit.request'
  | 'asset.record' | 'expense.create' | 'approve' | 'deposit.finance' | 'budget.manage'
  | 'batch.manage' | 'batch.create' | 'item.manage' | 'export' | 'users.manage' | 'settings.manage';

const PERMS: Record<Role, Permission[]> = {
  staff: ['stock.create', 'request.create', 'count.create', 'deposit.create', 'deposit.request', 'asset.record', 'expense.create', 'batch.create'],
  hod: [
    'stock.create', 'request.create', 'count.create', 'deposit.create', 'deposit.request', 'asset.record', 'expense.create',
    'approve', 'budget.manage', 'batch.manage', 'batch.create', 'item.manage', 'export',
  ],
  finance: ['deposit.finance', 'export'],
  admin: [
    'stock.create', 'request.create', 'count.create', 'deposit.create', 'deposit.request', 'asset.record', 'expense.create',
    'approve', 'budget.manage', 'batch.manage', 'batch.create', 'item.manage', 'export', 'users.manage', 'settings.manage',
  ],
};

/** The System Administrator has every right of the L&D HOD (approvals included). */
export const actsAsHod = (role: Role | undefined | null): boolean => role === 'hod' || role === 'admin';

export function can(role: Role | undefined, perm: Permission): boolean {
  return !!role && PERMS[role].includes(perm);
}

// ---------------------------------------------------------------- references
/** Next sequential reference such as DEP-2026-0001, unique within prefix + year. */
export function nextRef(prefix: string, existing: string[], now = new Date()): string {
  const year = now.getFullYear();
  const head = `${prefix}-${year}-`;
  let max = 0;
  for (const r of existing) {
    if (r.startsWith(head)) {
      const n = parseInt(r.slice(head.length), 10);
      if (n > max) max = n;
    }
  }
  return `${head}${String(max + 1).padStart(4, '0')}`;
}

// ---------------------------------------------------------------- stock
/** Change in quantity on hand an approved transaction makes. */
export function stockDelta(t: Pick<StockTxn, 'type' | 'qty' | 'condition'>): number {
  switch (t.type) {
    case 'IN': return t.qty;
    case 'OUT': return -t.qty;
    case 'RETURN': return t.condition === 'Good' ? t.qty : 0;
    case 'ADJUST': return t.qty;
  }
}

/** Rule 1: stock may never go below zero. Returns the new balance or throws. */
export function applyDelta(item: Pick<Item, 'name' | 'qty_on_hand'>, delta: number): number {
  const next = r6(item.qty_on_hand + delta);
  if (next < 0) {
    throw new RuleError(`Not enough stock for "${item.name}": ${item.qty_on_hand} available, ${-delta} requested.`);
  }
  return next;
}

/** Checks every line of a request against available stock (lines for the same item are summed). */
export function checkAvailability(lines: RequestLine[], items: Item[]): string[] {
  // Count in pieces for items that are split, so "1 pack + 5 sachets" is compared exactly.
  const need = new Map<string, number>();
  for (const l of lines) {
    if (isCustomLine(l)) continue; // typed items are not taken from the store
    const it = items.find((i) => i.id === l.item_id);
    need.set(l.item_id, (need.get(l.item_id) ?? 0) + (it ? linePieces(l, it) : l.qty));
  }
  const problems: string[] = [];
  for (const [id, n] of need) {
    const it = items.find((i) => i.id === id);
    if (!it) { problems.push('Unknown item'); continue; }
    const have = canSplit(it) ? piecesIn(it, it.qty_on_hand) : it.qty_on_hand;
    if (n <= have) continue;
    problems.push(canSplit(it) ? `${it.name}: ${fmtQty(it, it.qty_on_hand)} available, ${fmtPieces(it, n)} requested` : `${it.name}: ${it.qty_on_hand} available, ${n} requested`);
  }
  return problems;
}

export function validateLines(lines: RequestLine[]): void {
  if (lines.length === 0) throw new RuleError('Add at least one item.');
  for (const l of lines) {
    if (!l.item_id && !l.name?.trim()) throw new RuleError('Type or choose an item on every line.');
    if (l.unit_cost !== undefined && (!Number.isFinite(l.unit_cost) || l.unit_cost < 0)) throw new RuleError('The cost per unit cannot be negative.');
    if (!Number.isInteger(l.qty) || l.qty <= 0) throw new RuleError('Quantities must be whole numbers above zero.');
  }
}

// ---------------------------------------------------------------- packs and pieces
type PackInfo = Pick<Item, 'unit' | 'pack_qty' | 'piece_unit'>;
/** Rounds away floating-point noise; balances are kept to 6 decimals (numeric(14,6) in the database). */
export const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
/** True when single pieces can be taken out of one unit (e.g. 20 sachets in a pack). */
export const canSplit = (i: Pick<Item, 'pack_qty'>): boolean => !!i.pack_qty && i.pack_qty > 1;
/** Whole pieces in a quantity of units (2.25 packs of 20 → 45). */
export const piecesIn = (i: Pick<Item, 'pack_qty'>, qty: number): number => Math.round(qty * (i.pack_qty || 1));
/** Pieces a request line asks for (whole units are converted when the item is split). */
export const linePieces = (l: Pick<RequestLine, 'qty' | 'by_piece'>, i: Pick<Item, 'pack_qty'>): number =>
  canSplit(i) ? (l.by_piece ? l.qty : l.qty * i.pack_qty!) : l.qty;
/** Units a request line takes (5 sachets of a 20-pack → 0.25). */
export const lineUnits = (l: Pick<RequestLine, 'qty' | 'by_piece'>, i: Pick<Item, 'pack_qty'>): number =>
  canSplit(i) && l.by_piece ? l.qty / i.pack_qty! : l.qty;
export const lineValue = (l: Pick<RequestLine, 'qty' | 'by_piece'>, i: Pick<Item, 'pack_qty' | 'unit_cost'>): number => lineUnits(l, i) * i.unit_cost;

/**
 * How many units to move so that `pieces` single pieces leave (negative) or come back (positive)
 * and the balance stays an exact number of pieces. Returns the signed change in units.
 */
export function pieceChange(i: Pick<Item, 'pack_qty'>, onHand: number, pieces: number): number {
  const pk = i.pack_qty || 1;
  const now = piecesIn(i, onHand);
  return r6(r6((now + pieces) / pk) - onHand);
}

const plural = (n: number, w: string) => (n === 1 || /s$/i.test(w) ? w : `${w}s`);
const pieceName = (i: Pick<Item, 'piece_unit'>) => i.piece_unit || 'piece';
/** "45 sachets" */
export const fmtPieces = (i: Pick<Item, 'piece_unit'>, n: number) => `${n.toLocaleString('en-US')} ${plural(n, pieceName(i))}`;

/** A balance or movement in words: "12 Pack", or "2 Pack + 5 sachets" when part of a pack is involved. */
export function fmtQty(i: PackInfo, qty: number): string {
  const neg = qty < 0;
  const q = Math.abs(qty);
  if (!canSplit(i)) return `${neg ? '−' : ''}${r6(q).toLocaleString('en-US')} ${i.unit}`;
  const total = piecesIn(i, q);
  const whole = Math.floor(total / i.pack_qty!);
  const rest = total - whole * i.pack_qty!;
  const parts = [whole || !rest ? `${whole.toLocaleString('en-US')} ${i.unit}` : '', rest ? fmtPieces(i, rest) : ''].filter(Boolean);
  return `${neg ? '−' : ''}${parts.join(' + ')}`;
}
/** A request line in words: "5 sachets" or "2 Pack". */
export const fmtLine = (l: Pick<RequestLine, 'qty' | 'by_piece'>, i: PackInfo) =>
  canSplit(i) && l.by_piece ? fmtPieces(i, l.qty) : `${l.qty.toLocaleString('en-US')} ${i.unit}`;

export function isLowStock(item: Pick<Item, 'qty_on_hand' | 'min_level'>): boolean {
  return item.qty_on_hand <= item.min_level;
}

/** Quantity issued to a batch, net of good returns, per item. */
export function netIssuedByItem(txns: StockTxn[], batchId: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of txns) {
    if (t.status !== 'Approved' || t.batch_id !== batchId) continue;
    if (t.type === 'OUT') m.set(t.item_id, (m.get(t.item_id) ?? 0) + t.qty);
    if (t.type === 'RETURN' && t.condition === 'Good') m.set(t.item_id, (m.get(t.item_id) ?? 0) - t.qty);
  }
  return m;
}

// ---------------------------------------------------------------- deposits
export type DepositAction =
  | { kind: 'requestRefund'; note: string; hasAttachment: boolean }
  | { kind: 'requestForfeit'; reason: ForfeitReason | null; note: string; hasAttachment: boolean }
  | { kind: 'hodApprove' }
  | { kind: 'financeApprove'; voucherRef: string }
  | { kind: 'reject'; note: string }
  | { kind: 'requestReversal'; reason: string }
  | { kind: 'approveReversal' }
  | { kind: 'rejectReversal'; note: string };

export const OPEN_STATUSES: DepositStatus[] = ['Held', 'Refund Request', 'Forfeiture Request'];
export const FINAL_STATUSES: DepositStatus[] = ['Refunded', 'Forfeited'];

/**
 * The deposit state machine. Returns the patch to apply, or throws RuleError.
 * Held → Refund Request → (HOD) → (Finance) → Refunded
 * Held → Forfeiture Request → (HOD) → Forfeited
 * Refunded / Forfeited are immutable; the only way back is Reversal Request → (HOD) → Held.
 */
export function depositTransition(d: Deposit, a: DepositAction, role: Role, userId: string, now: string): Partial<Deposit> {
  const need = (ok: boolean, msg: string) => { if (!ok) throw new RuleError(msg); };
  const isRequester = d.requested_by === userId;

  switch (a.kind) {
    case 'requestRefund':
      need(can(role, 'deposit.request'), 'Your role cannot request refunds.');
      need(d.status === 'Held', 'Only a Held deposit can be submitted for refund.');
      need(a.hasAttachment, 'Attach the Exam Pass Certificate (required for a refund).');
      return {
        status: 'Refund Request', request_note: a.note.trim() || null, forfeit_reason: null,
        requested_by: userId, requested_at: now, hod_approved_by: null, hod_approved_at: null,
        finance_approved_by: null, finance_approved_at: null,
      };

    case 'requestForfeit':
      need(can(role, 'deposit.request'), 'Your role cannot request forfeiture.');
      need(d.status === 'Held', 'Only a Held deposit can be submitted for forfeiture.');
      need(!!a.reason, 'Choose a forfeiture reason: Course Incomplete or Service Period Not Met.');
      need(a.note.trim().length >= 5, 'Add an evidence note explaining the forfeiture.');
      need(a.hasAttachment, 'Attach the forfeiture notice / evidence document.');
      return {
        status: 'Forfeiture Request', forfeit_reason: a.reason, request_note: a.note.trim(),
        requested_by: userId, requested_at: now, hod_approved_by: null, hod_approved_at: null,
      };

    case 'hodApprove':
      need(actsAsHod(role), 'Only the L&D HOD can approve.');
      need(!isRequester, 'You cannot approve a request you submitted.');
      if (d.status === 'Refund Request') {
        need(!d.hod_approved_by, 'HOD has already approved; waiting for Finance.');
        return { hod_approved_by: userId, hod_approved_at: now };
      }
      need(d.status === 'Forfeiture Request', 'Nothing to approve on this deposit.');
      return { status: 'Forfeited', hod_approved_by: userId, hod_approved_at: now, closed_at: now };

    case 'financeApprove':
      need(role === 'finance', 'Only Finance can confirm a refund payment.');
      need(d.status === 'Refund Request', 'This deposit is not waiting for a refund.');
      need(!!d.hod_approved_by, 'The HOD must approve the refund first.');
      need(a.voucherRef.trim().length > 0, 'Enter the Finance payment voucher reference.');
      return {
        status: 'Refunded', finance_approved_by: userId, finance_approved_at: now,
        finance_voucher_ref: a.voucherRef.trim(), closed_at: now,
      };

    case 'reject':
      need(d.status === 'Refund Request' || d.status === 'Forfeiture Request', 'Nothing to reject.');
      need(actsAsHod(role) || (role === 'finance' && d.status === 'Refund Request' && !!d.hod_approved_by),
        'You cannot reject this request.');
      need(a.note.trim().length > 0, 'Give a reason for rejecting so staff can correct it.');
      return {
        status: 'Held', hod_approved_by: null, hod_approved_at: null, forfeit_reason: null,
        request_note: `Rejected: ${a.note.trim()}`,
      };

    case 'requestReversal':
      need(can(role, 'deposit.request'), 'Your role cannot request a reversal.');
      need(FINAL_STATUSES.includes(d.status), 'Only Refunded or Forfeited deposits can be reversed.');
      need(a.reason.trim().length >= 5, 'Explain why this approved transaction must be reversed.');
      return { status: 'Reversal Request', reversal_from: d.status, reversal_reason: a.reason.trim(), requested_by: userId, requested_at: now };

    case 'approveReversal':
      need(actsAsHod(role), 'Only the L&D HOD can approve a reversal.');
      need(d.status === 'Reversal Request', 'No reversal is pending.');
      need(!isRequester, 'You cannot approve a reversal you requested.');
      return {
        status: 'Held', reversal_from: null, forfeit_reason: null, hod_approved_by: null, hod_approved_at: null,
        finance_approved_by: null, finance_approved_at: null, finance_voucher_ref: null, closed_at: null,
        attachment: null, request_note: `Reversed: ${d.reversal_reason ?? ''}`,
      };

    case 'rejectReversal':
      need(actsAsHod(role), 'Only the L&D HOD can reject a reversal.');
      need(d.status === 'Reversal Request' && !!d.reversal_from, 'No reversal is pending.');
      need(a.note.trim().length > 0, 'Give a reason for rejecting.');
      return { status: d.reversal_from!, reversal_from: null, reversal_reason: `Reversal rejected: ${a.note.trim()}` };
  }
}

// ---------------------------------------------------------------- NRC
const MM_DIGITS = '၀၁၂၃၄၅၆၇၈၉';
/** Canonical form for comparing NRC numbers: no spaces, Myanmar digits → 0-9, Latin letters upper-case. */
export function normalizeNrc(nrc: string): string {
  return nrc.replace(/\s+/g, '').replace(/[၀-၉]/g, (c) => String(MM_DIGITS.indexOf(c))).toUpperCase();
}

/** Myanmar NRC, in English (12/MaYaKa(N)123456) or Myanmar script (၁၂/မရက(နိုင်)၁၂၃၄၅၆). */
export function isValidNrc(nrc: string): boolean {
  return /^([1-9]|1[0-4])\/[^/()]{2,12}\([^()]{1,8}\)\d{6}$/.test(normalizeNrc(nrc));
}

export function validateTrainingDates(start: string, end: string | null): void {
  if (!start) throw new RuleError('Training start date is required.');
  if (!end) throw new RuleError('Training end date is required.');
  if (end < start) throw new RuleError('Training end date cannot be before the start date.');
}

/** "System auto check" run when a deposit is registered. */
export function validateNewDeposit(
  input: Pick<Deposit, 'trainee_name' | 'nrc' | 'trainee_type' | 'batch_id' | 'training_date' | 'training_end_date' | 'amount' | 'payment_date'>,
  existing: Deposit[], batches: Batch[],
): void {
  if (!input.trainee_name.trim()) throw new RuleError('Trainee name is required.');
  if (!input.nrc.trim()) throw new RuleError('NRC number is required.');
  if (!isValidNrc(input.nrc)) throw new RuleError('NRC format looks wrong. Example: 12/MaYaKa(N)123456 or ၁၂/မရက(နိုင်)၁၂၃၄၅၆');
  if (input.trainee_type !== 'Internal' && input.trainee_type !== 'External') throw new RuleError('Choose Internal or External.');
  const b = batches.find((x) => x.id === input.batch_id);
  if (!b) throw new RuleError('Choose a license course batch.');
  if (b.program !== 'License' || b.status === 'Completed') throw new RuleError('The batch must be an active License class.');
  validateTrainingDates(input.training_date, input.training_end_date);
  if (!(input.amount > 0)) throw new RuleError('Deposit amount must be above zero.');
  if (!input.payment_date) throw new RuleError('Payment date is required.');
  if (input.payment_date > new Date().toISOString().slice(0, 10)) throw new RuleError('Payment date cannot be in the future.');
  const nrc = normalizeNrc(input.nrc);
  const dup = existing.find((d) => normalizeNrc(d.nrc) === nrc && d.status !== 'Refunded' && d.status !== 'Forfeited');
  if (dup) throw new RuleError(`NRC ${input.nrc} already has an open deposit (${dup.ref}).`);
}

export function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export type RetentionLevel = 'ok' | 'warning' | 'expired';

/** Retention alert for a Held deposit: warning from month N (e.g. 11), expired at the service term (e.g. 12). */
export function retention(d: Pick<Deposit, 'status' | 'payment_date'>, alertMonths: number, termMonths: number, today: string): { level: RetentionLevel; dueDate: string; daysLeft: number } {
  const dueDate = addMonths(d.payment_date, termMonths);
  const warnDate = addMonths(d.payment_date, alertMonths);
  const daysLeft = Math.round((Date.parse(dueDate) - Date.parse(today)) / 86_400_000);
  if (d.status !== 'Held') return { level: 'ok', dueDate, daysLeft };
  if (today >= dueDate) return { level: 'expired', dueDate, daysLeft };
  if (today >= warnDate) return { level: 'warning', dueDate, daysLeft };
  return { level: 'ok', dueDate, daysLeft };
}

export function depositTotals(deposits: Deposit[]) {
  const t = { held: 0, refunded: 0, forfeited: 0, pending: 0, heldCount: 0, refundedCount: 0, forfeitedCount: 0 };
  for (const d of deposits) {
    if (d.status === 'Refunded') { t.refunded += d.amount; t.refundedCount++; }
    else if (d.status === 'Forfeited') { t.forfeited += d.amount; t.forfeitedCount++; }
    else {
      // Held, pending requests and pending reversals are still money held by the company.
      t.held += d.amount; t.heldCount++;
      if (d.status !== 'Held') t.pending += d.amount;
    }
  }
  return t;
}

// ---------------------------------------------------------------- budget
export function txnValue(t: StockTxn): number {
  return Math.abs(t.qty) * t.unit_cost;
}

/** Actual spend for a training batch: materials issued (net of good returns) at cost + expenses tagged to it. */
export function batchActual(batchId: string, txns: StockTxn[], expenses: Expense[]): { materials: number; expenses: number; total: number } {
  let materials = 0;
  for (const t of txns) {
    if (t.status !== 'Approved' || t.batch_id !== batchId) continue;
    if (t.type === 'OUT') materials += txnValue(t);
    if (t.type === 'RETURN' && t.condition === 'Good') materials -= txnValue(t);
  }
  const ex = expenses.filter((e) => e.batch_id === batchId).reduce((s, e) => s + e.amount, 0);
  return { materials, expenses: ex, total: materials + ex };
}

/** Department spend in a fiscal (calendar) year: approved purchases + all recorded expenses. */
export function yearActual(year: number, txns: StockTxn[], expenses: Expense[]): { purchases: number; expenses: number; total: number } {
  const y = String(year);
  const purchases = txns
    .filter((t) => t.type === 'IN' && t.status === 'Approved' && effectiveDate(t).startsWith(y) && t.supplier !== 'Opening balance')
    .reduce((s, t) => s + txnValue(t), 0);
  const ex = expenses.filter((e) => e.date.startsWith(y)).reduce((s, e) => s + e.amount, 0);
  return { purchases, expenses: ex, total: purchases + ex };
}

/** Variance % of actual against budget: positive = over budget. */
export function variancePct(budget: number, actual: number): number | null {
  if (!budget) return null;
  return ((actual - budget) / budget) * 100;
}

export function utilizationPct(budget: number, actual: number): number {
  return budget ? (actual / budget) * 100 : 0;
}

export function pendingCount(statuses: { status: ApprovalStatus }[]): number {
  return statuses.filter((s) => s.status === 'Pending').length;
}

export function requestValue(r: MaterialRequest, items: Item[]): number {
  return r.lines.reduce((s, l) => {
    if (isCustomLine(l)) return s + l.qty * (l.unit_cost ?? 0);
    const it = items.find((i) => i.id === l.item_id);
    return s + (it ? lineValue(l, it) : 0);
  }, 0);
}

// ---------------------------------------------------------------- categories & months
export function budgetCategory(b: Pick<Batch, 'program' | 'location'> | undefined | null): BudgetCategory {
  if (!b) return 'General';
  if (b.program === 'License') return b.location ? (`License - ${b.location}` as BudgetCategory) : 'General';
  // Programs people typed themselves are budgeted under General.
  return (BUDGET_CATEGORIES as readonly string[]).includes(b.program) ? (b.program as BudgetCategory) : 'General';
}

const effectiveDate = (t: StockTxn) => (t.decided_at ?? t.created_at).slice(0, 10);

export interface CategoryActual { materials: number; expenses: number; total: number }

/** Spend per budget category in a year: materials issued to its batches (net of good returns) + expenses tagged to it. */
export function categoryActuals(year: number, txns: StockTxn[], expenses: Expense[], batches: Batch[]): Map<BudgetCategory, CategoryActual> {
  const y = String(year);
  const m = new Map<BudgetCategory, CategoryActual>();
  const add = (c: BudgetCategory, k: 'materials' | 'expenses', v: number) => {
    const cur = m.get(c) ?? { materials: 0, expenses: 0, total: 0 };
    cur[k] += v; cur.total += v; m.set(c, cur);
  };
  const batchCat = new Map(batches.map((b) => [b.id, budgetCategory(b)]));
  for (const t of txns) {
    if (t.status !== 'Approved' || !t.batch_id || !effectiveDate(t).startsWith(y)) continue;
    const c = batchCat.get(t.batch_id) ?? 'General';
    if (t.type === 'OUT') add(c, 'materials', txnValue(t));
    if (t.type === 'RETURN' && t.condition === 'Good') add(c, 'materials', -txnValue(t));
  }
  for (const e of expenses) if (e.date.startsWith(y)) add(e.budget_category ?? 'General', 'expenses', e.amount);
  return m;
}

export interface MonthSpend { month: string; purchases: number; issued: number; expenses: number; total: number; cumulative: number }

/** Department spend per month (purchases + expenses), plus materials issued to classes for reference. */
export function monthlySpend(year: number, txns: StockTxn[], expenses: Expense[]): MonthSpend[] {
  const rows: MonthSpend[] = Array.from({ length: 12 }, (_, i) => ({
    month: `${year}-${String(i + 1).padStart(2, '0')}`, purchases: 0, issued: 0, expenses: 0, total: 0, cumulative: 0,
  }));
  const at = (d: string) => (d.startsWith(String(year)) ? rows[Number(d.slice(5, 7)) - 1] : null);
  for (const t of txns) {
    if (t.status !== 'Approved') continue;
    const r = at(effectiveDate(t));
    if (!r) continue;
    if (t.type === 'IN' && t.supplier !== 'Opening balance') r.purchases += txnValue(t);
    if (t.type === 'OUT') r.issued += txnValue(t);
    if (t.type === 'RETURN' && t.condition === 'Good') r.issued -= txnValue(t);
  }
  for (const e of expenses) { const r = at(e.date); if (r) r.expenses += e.amount; }
  let cum = 0;
  for (const r of rows) { r.total = r.purchases + r.expenses; cum += r.total; r.cumulative = cum; }
  return rows;
}

// ---------------------------------------------------------------- pieces in a pack
/** Price of one piece when a unit holds several (1 Pack = 20 sachets → unit_cost / 20); null when not split. */
export function piecePrice(item: { unit_cost: number; pack_qty: number | null }): number | null {
  return item.pack_qty && item.pack_qty > 1 ? item.unit_cost / item.pack_qty : null;
}

/** True when a request line asks for more than is on hand (compared in pieces for split items). */
export function lineShort(l: Pick<RequestLine, 'item_id' | 'qty' | 'by_piece'>, it: Item | undefined): boolean {
  if (isCustomLine(l)) return false;
  if (!it) return true;
  return linePieces(l, it) > (canSplit(it) ? piecesIn(it, it.qty_on_hand) : it.qty_on_hand);
}
/** A stock movement in words, using the pieces it was entered in when there are any. */
export function fmtTxnQty(t: Pick<StockTxn, 'qty' | 'piece_qty'>, it: Pick<Item, 'unit' | 'pack_qty' | 'piece_unit'>): string {
  return t.piece_qty ? fmtPieces(it, t.piece_qty) : fmtQty(it, Math.abs(t.qty));
}

/** A typed item that is not in the store (no stock is issued for it). */
export const isCustomLine = (l: Pick<RequestLine, 'item_id'>) => !l.item_id;
/** Name of a request line's item, store item or typed. */
export const lineName = (l: Pick<RequestLine, 'item_id' | 'name'>, items: Item[]) =>
  l.item_id ? items.find((i) => i.id === l.item_id)?.name ?? 'Item' : l.name?.trim() || 'Item';
/** Quantity of a request line in words, store item or typed ("3 boxes"). */
export function lineQtyText(l: RequestLine, items: Item[]): string {
  const it = l.item_id ? items.find((i) => i.id === l.item_id) : undefined;
  if (it) return fmtLine(l, it);
  return `${l.qty.toLocaleString('en-US')}${l.unit?.trim() ? ` ${l.unit.trim()}` : ''}`;
}
/** Value of one request line (typed items use their estimated cost per unit). */
export function lineAmount(l: RequestLine, items: Item[]): number {
  if (isCustomLine(l)) return l.qty * (l.unit_cost ?? 0);
  const it = items.find((i) => i.id === l.item_id);
  return it ? lineValue(l, it) : 0;
}

/** The training a request is for: its own typed name and date, or (older requests) the saved training's. */
export function requestTraining(r: Pick<MaterialRequest, 'batch_id' | 'training_name' | 'training_date'>, batches: Batch[]) {
  const b = r.batch_id ? batches.find((x) => x.id === r.batch_id) : undefined;
  return { name: r.training_name?.trim() || b?.name || 'Training', date: r.training_date || b?.start_date || null };
}

/** Training name for a stock movement: its saved training, or the training typed on the request it issued. */
export function txnTraining(t: Pick<StockTxn, 'batch_id' | 'request_id'>, d: { batches: Batch[]; material_requests: MaterialRequest[] }): string {
  if (t.batch_id) { const b = d.batches.find((x) => x.id === t.batch_id); if (b) return b.name; }
  const r = t.request_id ? d.material_requests.find((x) => x.id === t.request_id) : undefined;
  return r ? requestTraining(r, d.batches).name : '';
}
