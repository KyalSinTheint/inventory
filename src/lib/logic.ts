// Pure business rules. No React and no storage here, so they can be unit tested.
import type {
  ApprovalStatus, Batch, BudgetCategory, Deposit, DepositStatus, Expense, ForfeitReason, Item, MaterialRequest,
  RequestLine, Role, StockTxn,
} from './types';

export class RuleError extends Error {}

// ---------------------------------------------------------------- permissions
export type Permission =
  | 'stock.create' | 'request.create' | 'count.create' | 'deposit.create' | 'deposit.request'
  | 'asset.record' | 'expense.create' | 'approve' | 'deposit.finance' | 'budget.manage'
  | 'batch.manage' | 'item.manage' | 'export' | 'users.manage' | 'settings.manage';

const PERMS: Record<Role, Permission[]> = {
  staff: ['stock.create', 'request.create', 'count.create', 'deposit.create', 'deposit.request', 'asset.record', 'expense.create'],
  hod: [
    'stock.create', 'request.create', 'count.create', 'deposit.create', 'deposit.request', 'asset.record', 'expense.create',
    'approve', 'budget.manage', 'batch.manage', 'item.manage', 'export',
  ],
  finance: ['deposit.finance', 'export'],
  admin: [
    'stock.create', 'request.create', 'count.create', 'deposit.create', 'deposit.request', 'asset.record', 'expense.create',
    'budget.manage', 'batch.manage', 'item.manage', 'export', 'users.manage', 'settings.manage',
  ],
};

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
  const next = item.qty_on_hand + delta;
  if (next < 0) {
    throw new RuleError(`Not enough stock for "${item.name}": ${item.qty_on_hand} available, ${-delta} requested.`);
  }
  return next;
}

/** Checks every line of a request against available stock (lines for the same item are summed). */
export function checkAvailability(lines: RequestLine[], items: Item[]): string[] {
  const need = new Map<string, number>();
  for (const l of lines) need.set(l.item_id, (need.get(l.item_id) ?? 0) + l.qty);
  const problems: string[] = [];
  for (const [id, qty] of need) {
    const it = items.find((i) => i.id === id);
    if (!it) problems.push('Unknown item');
    else if (qty > it.qty_on_hand) problems.push(`${it.name}: ${it.qty_on_hand} available, ${qty} requested`);
  }
  return problems;
}

export function validateLines(lines: RequestLine[]): void {
  if (lines.length === 0) throw new RuleError('Add at least one item.');
  for (const l of lines) {
    if (!l.item_id) throw new RuleError('Choose an item on every line.');
    if (!Number.isInteger(l.qty) || l.qty <= 0) throw new RuleError('Quantities must be whole numbers above zero.');
  }
}

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
      need(role === 'hod', 'Only the L&D HOD can approve.');
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
      need(role === 'hod' || (role === 'finance' && d.status === 'Refund Request' && !!d.hod_approved_by),
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
      need(role === 'hod', 'Only the L&D HOD can approve a reversal.');
      need(d.status === 'Reversal Request', 'No reversal is pending.');
      need(!isRequester, 'You cannot approve a reversal you requested.');
      return {
        status: 'Held', reversal_from: null, forfeit_reason: null, hod_approved_by: null, hod_approved_at: null,
        finance_approved_by: null, finance_approved_at: null, finance_voucher_ref: null, closed_at: null,
        attachment: null, request_note: `Reversed: ${d.reversal_reason ?? ''}`,
      };

    case 'rejectReversal':
      need(role === 'hod', 'Only the L&D HOD can reject a reversal.');
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

/** "System auto check" run when a deposit is registered. */
export function validateNewDeposit(
  input: Pick<Deposit, 'trainee_name' | 'nrc' | 'trainee_type' | 'batch_id' | 'training_date' | 'amount' | 'payment_date' | 'voucher_ref'>,
  existing: Deposit[], batches: Batch[],
): void {
  if (!input.trainee_name.trim()) throw new RuleError('Trainee name is required.');
  if (!input.nrc.trim()) throw new RuleError('NRC number is required.');
  if (!isValidNrc(input.nrc)) throw new RuleError('NRC format looks wrong. Example: 12/MaYaKa(N)123456 or ၁၂/မရက(နိုင်)၁၂၃၄၅၆');
  if (input.trainee_type !== 'Internal' && input.trainee_type !== 'External') throw new RuleError('Choose Internal or External.');
  const b = batches.find((x) => x.id === input.batch_id);
  if (!b) throw new RuleError('Choose a license course batch.');
  if (b.program !== 'License' || b.status === 'Completed') throw new RuleError('The batch must be an active License class.');
  if (!input.training_date) throw new RuleError('Training date is required.');
  if (!(input.amount > 0)) throw new RuleError('Deposit amount must be above zero.');
  if (!input.payment_date) throw new RuleError('Payment date is required.');
  if (input.payment_date > new Date().toISOString().slice(0, 10)) throw new RuleError('Payment date cannot be in the future.');
  if (!input.voucher_ref.trim()) throw new RuleError('Voucher reference is required.');
  const nrc = normalizeNrc(input.nrc);
  const dup = existing.find((d) => normalizeNrc(d.nrc) === nrc && d.status !== 'Refunded' && d.status !== 'Forfeited');
  if (dup) throw new RuleError(`NRC ${input.nrc} already has an open deposit (${dup.ref}).`);
  const v = input.voucher_ref.trim().toLowerCase();
  const vdup = existing.find((d) => d.voucher_ref.trim().toLowerCase() === v);
  if (vdup) throw new RuleError(`Voucher ${input.voucher_ref} is already recorded on ${vdup.ref}.`);
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
  return r.lines.reduce((s, l) => s + l.qty * (items.find((i) => i.id === l.item_id)?.unit_cost ?? 0), 0);
}

// ---------------------------------------------------------------- categories & months
export function budgetCategory(b: Pick<Batch, 'program' | 'location'> | undefined | null): BudgetCategory {
  if (!b) return 'General';
  if (b.program === 'License') return b.location ? (`License - ${b.location}` as BudgetCategory) : 'General';
  return b.program;
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
