import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths, applyDelta, batchActual, can, checkAvailability, depositTotals, depositTransition, nextRef, retention, RuleError,
  stockDelta, validateNewDeposit, variancePct,
} from './logic';
import type { Batch, Deposit, Expense, Item, StockTxn } from './types';
import { buildSeed } from './seed';

const NOW = '2026-11-12T00:00:00.000Z';
const dep = (p: Partial<Deposit> = {}): Deposit => ({
  id: 'd1', ref: 'DEP-2026-0001', trainee_name: 'A', agent_code: 'AG-1', batch_id: 'b1', amount: 250000, payment_date: '2026-01-10',
  voucher_ref: 'RV-1', status: 'Held', forfeit_reason: null, request_note: null, attachment: null, requested_by: null, requested_at: null,
  hod_approved_by: null, hod_approved_at: null, finance_approved_by: null, finance_approved_at: null, finance_voucher_ref: null,
  closed_at: null, reversal_from: null, reversal_reason: null, created_by: 'staff', created_at: NOW, ...p,
});
const apply = (d: Deposit, patch: Partial<Deposit>) => ({ ...d, ...patch });

test('refund: staff request with certificate → HOD → Finance → Refunded', () => {
  let d = dep();
  assert.throws(() => depositTransition(d, { kind: 'requestRefund', note: '', hasAttachment: false }, 'staff', 'staff', NOW), RuleError);
  d = apply(d, depositTransition(d, { kind: 'requestRefund', note: '', hasAttachment: true }, 'staff', 'staff', NOW));
  assert.equal(d.status, 'Refund Request');
  // Finance cannot act before the HOD.
  assert.throws(() => depositTransition(d, { kind: 'financeApprove', voucherRef: 'PV-1' }, 'finance', 'fin', NOW), /HOD must approve/);
  // Staff cannot approve.
  assert.throws(() => depositTransition(d, { kind: 'hodApprove' }, 'staff', 'staff2', NOW), RuleError);
  d = apply(d, depositTransition(d, { kind: 'hodApprove' }, 'hod', 'hod', NOW));
  assert.equal(d.status, 'Refund Request');
  assert.equal(d.hod_approved_by, 'hod');
  assert.throws(() => depositTransition(d, { kind: 'financeApprove', voucherRef: ' ' }, 'finance', 'fin', NOW), /voucher/);
  d = apply(d, depositTransition(d, { kind: 'financeApprove', voucherRef: 'PV-1' }, 'finance', 'fin', NOW));
  assert.equal(d.status, 'Refunded');
  assert.ok(d.closed_at);
});

test('forfeiture requires a reason, evidence note and attachment; HOD closes it', () => {
  let d = dep();
  assert.throws(() => depositTransition(d, { kind: 'requestForfeit', reason: null, note: 'missed classes', hasAttachment: true }, 'staff', 'staff', NOW), /reason/);
  assert.throws(() => depositTransition(d, { kind: 'requestForfeit', reason: 'Course Incomplete', note: '', hasAttachment: true }, 'staff', 'staff', NOW), /evidence/);
  assert.throws(() => depositTransition(d, { kind: 'requestForfeit', reason: 'Course Incomplete', note: 'missed classes', hasAttachment: false }, 'staff', 'staff', NOW), /Attach/);
  d = apply(d, depositTransition(d, { kind: 'requestForfeit', reason: 'Service Period Not Met', note: 'Resigned after 7 months', hasAttachment: true }, 'staff', 'staff', NOW));
  assert.equal(d.status, 'Forfeiture Request');
  assert.throws(() => depositTransition(d, { kind: 'hodApprove' }, 'finance', 'fin', NOW), RuleError);
  d = apply(d, depositTransition(d, { kind: 'hodApprove' }, 'hod', 'hod', NOW));
  assert.equal(d.status, 'Forfeited');
  assert.equal(d.forfeit_reason, 'Service Period Not Met');
});

test('maker-checker: an HOD cannot approve a request they submitted', () => {
  let d = dep();
  d = apply(d, depositTransition(d, { kind: 'requestRefund', note: '', hasAttachment: true }, 'hod', 'hod', NOW));
  assert.throws(() => depositTransition(d, { kind: 'hodApprove' }, 'hod', 'hod', NOW), /cannot approve/);
});

test('approved transactions are immutable; only a HOD-approved reversal reopens them', () => {
  let d = dep({ status: 'Forfeited', forfeit_reason: 'Course Incomplete', closed_at: NOW });
  assert.throws(() => depositTransition(d, { kind: 'requestRefund', note: '', hasAttachment: true }, 'staff', 'staff', NOW), RuleError);
  assert.throws(() => depositTransition(d, { kind: 'reject', note: 'x' }, 'hod', 'hod', NOW), RuleError);
  d = apply(d, depositTransition(d, { kind: 'requestReversal', reason: 'Wrong trainee selected' }, 'staff', 'staff', NOW));
  assert.equal(d.status, 'Reversal Request');
  const rejected = apply(d, depositTransition(d, { kind: 'rejectReversal', note: 'Evidence is correct' }, 'hod', 'hod', NOW));
  assert.equal(rejected.status, 'Forfeited');
  d = apply(d, depositTransition(d, { kind: 'approveReversal' }, 'hod', 'hod', NOW));
  assert.equal(d.status, 'Held');
  assert.equal(d.forfeit_reason, null);
});

test('reject sends a request back to Held', () => {
  let d = dep();
  d = apply(d, depositTransition(d, { kind: 'requestRefund', note: '', hasAttachment: true }, 'staff', 'staff', NOW));
  assert.throws(() => depositTransition(d, { kind: 'reject', note: '' }, 'hod', 'hod', NOW), /reason/);
  d = apply(d, depositTransition(d, { kind: 'reject', note: 'Certificate unreadable' }, 'hod', 'hod', NOW));
  assert.equal(d.status, 'Held');
});

test('registration auto-check: required fields, license batch, duplicates', () => {
  const batches: Batch[] = [
    { id: 'b1', code: 'LIC', name: 'L', program: 'License', start_date: '', end_date: '', budget: 0, status: 'Active', created_at: NOW },
    { id: 'b2', code: 'CORP', name: 'C', program: 'Corporate', start_date: '', end_date: '', budget: 0, status: 'Active', created_at: NOW },
  ];
  const input = { trainee_name: 'B', agent_code: 'ag-1', batch_id: 'b1', amount: 1000, payment_date: '2026-01-01', voucher_ref: 'RV-9' };
  assert.throws(() => validateNewDeposit(input, [dep()], batches), /open deposit/);
  assert.doesNotThrow(() => validateNewDeposit(input, [dep({ status: 'Refunded' })], batches));
  assert.throws(() => validateNewDeposit({ ...input, agent_code: 'AG-2', voucher_ref: 'rv-1' }, [dep()], batches), /Voucher/);
  assert.throws(() => validateNewDeposit({ ...input, batch_id: 'b2' }, [], batches), /License/);
  assert.throws(() => validateNewDeposit({ ...input, amount: 0 }, [], batches), /amount/);
});

test('retention warning in month 11, expired at month 12', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  const d = dep({ payment_date: '2025-12-01' });
  assert.equal(retention(d, 11, 12, '2026-10-30').level, 'ok');
  assert.equal(retention(d, 11, 12, '2026-11-01').level, 'warning');
  assert.equal(retention(d, 11, 12, '2026-12-01').level, 'expired');
  assert.equal(retention({ ...d, status: 'Refunded' }, 11, 12, '2026-12-05').level, 'ok');
});

test('stock: deltas, negative prevention and availability', () => {
  assert.equal(stockDelta({ type: 'IN', qty: 5, condition: null }), 5);
  assert.equal(stockDelta({ type: 'OUT', qty: 5, condition: null }), -5);
  assert.equal(stockDelta({ type: 'RETURN', qty: 5, condition: 'Good' }), 5);
  assert.equal(stockDelta({ type: 'RETURN', qty: 5, condition: 'Damaged' }), 0);
  assert.equal(stockDelta({ type: 'ADJUST', qty: -2, condition: null }), -2);
  assert.throws(() => applyDelta({ name: 'Tea', qty_on_hand: 3 }, -4), /Not enough stock/);
  assert.equal(applyDelta({ name: 'Tea', qty_on_hand: 3 }, -3), 0);
  const items = [{ id: 'i1', name: 'Tea', qty_on_hand: 5 }] as Item[];
  assert.deepEqual(checkAvailability([{ item_id: 'i1', qty: 3 }, { item_id: 'i1', qty: 3 }], items), ['Tea: 5 available, 6 requested']);
});

test('budget: batch actual and variance %', () => {
  const t = (p: Partial<StockTxn>): StockTxn => ({ id: 'x', ref: '', type: 'OUT', item_id: 'i', qty: 10, unit_cost: 100, batch_id: 'b', request_id: null, supplier: null, invoice_no: null, condition: null, reason: null, status: 'Approved', created_by: '', created_at: NOW, decided_by: null, decided_at: null, decision_note: null, ...p });
  const ex: Expense[] = [{ id: 'e', date: '2026-01-01', batch_id: 'b', category: 'Venue', description: '', amount: 500, created_by: '', created_at: NOW }];
  const a = batchActual('b', [t({}), t({ type: 'RETURN', qty: 2, condition: 'Good' }), t({ type: 'RETURN', qty: 1, condition: 'Lost' }), t({ status: 'Pending' })], ex);
  assert.deepEqual(a, { materials: 800, expenses: 500, total: 1300 });
  assert.equal(variancePct(1000, 1300), 30);
  assert.equal(variancePct(0, 10), null);
});

test('deposit totals: held includes pending requests', () => {
  const t = depositTotals([dep(), dep({ status: 'Refund Request' }), dep({ status: 'Refunded' }), dep({ status: 'Forfeited', amount: 100 })]);
  assert.equal(t.held, 500000);
  assert.equal(t.pending, 250000);
  assert.equal(t.refunded, 250000);
  assert.equal(t.forfeited, 100);
});

test('permissions: finance is read-only except refund confirmation; staff cannot approve', () => {
  assert.equal(can('finance', 'stock.create'), false);
  assert.equal(can('finance', 'deposit.finance'), true);
  assert.equal(can('staff', 'approve'), false);
  assert.equal(can('staff', 'export'), false);
  assert.equal(can('hod', 'approve'), true);
  assert.equal(can('admin', 'users.manage'), true);
});

test('references are sequential per prefix and year', () => {
  assert.equal(nextRef('DEP', ['DEP-2026-0009', 'DEP-2025-0040', 'MR-2026-0099'], new Date(NOW)), 'DEP-2026-0010');
  assert.equal(nextRef('DEP', [], new Date(NOW)), 'DEP-2026-0001');
});

test('seed data is internally consistent: balances match transaction history and never go negative', () => {
  const s = buildSeed();
  for (const it of s.items) {
    const sum = s.stock_txns.filter((t) => t.item_id === it.id && t.status === 'Approved').reduce((a, t) => a + stockDelta(t), 0);
    assert.equal(it.qty_on_hand, sum, it.name);
    assert.ok(it.qty_on_hand >= 0, it.name);
  }
  assert.equal(new Set(s.stock_txns.map((t) => t.ref)).size, s.stock_txns.length);
  assert.equal(new Set(s.deposits.map((d) => d.ref)).size, s.deposits.length);
  assert.equal(s.items.filter((i) => i.category === 'Refreshments').length, 26);
  assert.equal(s.items.filter((i) => i.category === 'Training Materials').length, 22);
  assert.equal(s.items.filter((i) => i.category === 'YCP Program').length, 9);
});
