import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createAdapter, type DataAdapter } from './db';
import { compressImage } from './files';
import {
  applyDelta, budgetCategory, can, checkAvailability, depositTransition, isValidNrc, nextRef, validateTrainingDates, normalizeNrc, RuleError, stockDelta, validateLines, validateNewDeposit,
  type DepositAction, type Permission,
} from './logic';
import type {
  Asset, AssetAction, AssetCondition, Attachment, Batch, Budget, CountLine, DataSet, Deposit, Expense, Item, MaterialRequest, PhysicalCount,
  Profile, RequestLine, ReturnCondition, Role, Settings, StockTxn, TableName, Tables,
} from './types';

const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

interface StoreValue {
  db: DataAdapter;
  data: DataSet | null;
  user: Profile | null;
  loading: boolean;
  error: string | null;
  settings: Settings;
  can: (p: Permission) => boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  demoSignIn: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
  name: (userId: string | null | undefined) => string;
  actions: ReturnType<typeof makeActions>;
}

const Ctx = createContext<StoreValue | null>(null);

export const DEFAULT_SETTINGS: Settings = { id: 'settings', retention_alert_months: 11, service_term_months: 12, low_stock_warning_pct: 0, updated_at: '' };

function makeActions(
  db: DataAdapter,
  get: () => { data: DataSet; user: Profile },
  set: (fn: (d: DataSet) => DataSet) => void,
  reload: () => Promise<void>,
) {
  const need = (p: Permission) => {
    if (!can(get().user.role, p)) throw new RuleError('Your role does not allow this action.');
  };
  const put = <K extends TableName>(table: K, row: Tables[K]) =>
    set((d) => {
      const list = d[table] as unknown as { id: string }[];
      const r = row as unknown as { id: string };
      const i = list.findIndex((x) => x.id === r.id);
      const next = i >= 0 ? list.map((x) => (x.id === r.id ? r : x)) : [...list, r];
      return { ...d, [table]: next };
    });

  async function insert<K extends TableName>(table: K, row: Tables[K]) {
    const saved = await db.insert(table, row);
    put(table, saved);
    return saved;
  }
  async function update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>) {
    const saved = await db.update(table, id, patch);
    put(table, saved);
    return saved;
  }
  /** Insert a row whose ref is sequential; retry if another user took the same number. */
  async function insertWithRef<K extends 'stock_txns' | 'material_requests' | 'physical_counts' | 'deposits'>(
    table: K, prefix: string, build: (ref: string) => Tables[K],
  ): Promise<Tables[K]> {
    for (let attempt = 0; ; attempt++) {
      const refs = (get().data[table] as { ref: string }[]).map((r) => r.ref);
      try {
        return await insert(table, build(nextRef(prefix, refs)));
      } catch (e) {
        if (attempt < 2 && /duplicate|unique/i.test(String((e as Error).message))) { await reload(); continue; }
        throw e;
      }
    }
  }
  async function audit(action: string, entity: string, entityId: string | null, details: string) {
    const { user } = get();
    await insert('audit_logs', {
      id: uid(), user_id: user.id, user_name: user.name, action, entity, entity_id: entityId, details,
      ip: db.mode === 'demo' ? 'local (demo)' : null, created_at: nowIso(),
    });
  }
  /** Call after a transaction is saved as Approved: updates the balance (demo) or reads the trigger's result (Supabase). */
  async function syncStock(t: StockTxn) {
    const qty = await db.applyStock(t);
    const it = get().data.items.find((i) => i.id === t.item_id);
    if (it) put('items', { ...it, qty_on_hand: qty });
  }
  const item = (id: string) => {
    const it = get().data.items.find((i) => i.id === id);
    if (!it) throw new RuleError('Item not found.');
    return it;
  };
  const baseTxn = (): Omit<StockTxn, 'ref' | 'type' | 'item_id' | 'qty' | 'unit_cost'> => ({
    id: uid(), batch_id: null, request_id: null, supplier: null, invoice_no: null, condition: null, reason: null, attachment: null,
    status: 'Pending', created_by: get().user.id, created_at: nowIso(), decided_by: null, decided_at: null, decision_note: null,
  });
  const notSelf = (createdBy: string) => {
    if (createdBy === get().user.id) throw new RuleError('You cannot approve a transaction you created (maker-checker rule).');
  };

  return {
    // ------------------------------------------------------------ master data
    /** photo: a File to upload, null to remove the photo, undefined to keep it. */
    async saveItem(input: Omit<Item, 'id' | 'created_at' | 'qty_on_hand' | 'photo'> & { id?: string }, photo?: File | null) {
      need('item.manage');
      if (!input.name.trim() || !input.code.trim()) throw new RuleError('Item code and name are required.');
      if (input.unit_cost < 0 || input.min_level < 0) throw new RuleError('Cost and minimum level cannot be negative.');
      const dup = get().data.items.find((i) => i.code.toLowerCase() === input.code.trim().toLowerCase() && i.id !== input.id);
      if (dup) throw new RuleError(`Item code ${input.code} is already used by ${dup.name}.`);
      const photoPatch: Partial<Item> = photo === undefined ? {} : { photo: photo ? await db.upload(await compressImage(photo)) : null };
      if (input.id) {
        const { id, ...patch } = input;
        const saved = await update('items', id, { ...patch, ...photoPatch, code: patch.code.trim(), name: patch.name.trim() });
        await audit('Update', 'item', id, `${saved.code} ${saved.name}`);
        return saved;
      }
      const saved = await insert('items', { ...input, photo: null, ...photoPatch, id: uid(), code: input.code.trim(), name: input.name.trim(), qty_on_hand: 0, created_at: nowIso() });
      await audit('Create', 'item', saved.id, `${saved.code} ${saved.name}`);
      return saved;
    },
    async saveBatch(input: Omit<Batch, 'id' | 'created_at'> & { id?: string }) {
      need('batch.manage');
      if (!input.code.trim() || !input.name.trim()) throw new RuleError('Batch code and name are required.');
      if (input.end_date && input.start_date && input.end_date < input.start_date) throw new RuleError('End date is before the start date.');
      if (input.budget < 0) throw new RuleError('Budget cannot be negative.');
      if (input.program === 'License' && !input.location) throw new RuleError('Choose the branch (YGN / MDY / TGI) for a License batch.');
      const dup = get().data.batches.find((b) => b.code.toLowerCase() === input.code.trim().toLowerCase() && b.id !== input.id);
      if (dup) throw new RuleError(`Batch code ${input.code} already exists.`);
      if (input.id) {
        const { id, ...patch } = input;
        const saved = await update('batches', id, patch);
        await audit('Update', 'batch', id, `${saved.code} budget ${saved.budget}`);
        return saved;
      }
      const saved = await insert('batches', { ...input, id: uid(), created_at: nowIso() });
      await audit('Create', 'batch', saved.id, `${saved.code} ${saved.name}`);
      return saved;
    },

    // ------------------------------------------------------------ inventory
    async stockIn(input: { item_id: string; qty: number; unit_cost: number; reason: string }, invoice?: File | null) {
      need('stock.create');
      const it = item(input.item_id);
      if (!Number.isInteger(input.qty) || input.qty <= 0) throw new RuleError('Quantity must be a whole number above zero.');
      if (!(input.unit_cost >= 0)) throw new RuleError('Unit cost cannot be negative.');
      const attachment = invoice ? await db.upload(invoice) : null;
      const t = await insertWithRef('stock_txns', 'STK', (ref) => ({
        ...baseTxn(), ref, type: 'IN', item_id: it.id, qty: input.qty, unit_cost: input.unit_cost, attachment,
        reason: input.reason.trim() || null,
      }));
      await audit('Stock In requested', 'stock_txn', t.id, `${t.ref}: ${t.qty} × ${it.name} @ ${t.unit_cost}${attachment ? ` (invoice ${attachment.name})` : ''}`);
      return t;
    },
    async stockAdjust(input: { item_id: string; qty: number; reason: string }) {
      need('stock.create');
      const it = item(input.item_id);
      if (!Number.isInteger(input.qty) || input.qty === 0) throw new RuleError('Enter a whole-number change (negative to write off).');
      if (input.reason.trim().length < 3) throw new RuleError('A reason is required for every adjustment.');
      applyDelta(it, input.qty);
      const t = await insertWithRef('stock_txns', 'STK', (ref) => ({
        ...baseTxn(), ref, type: 'ADJUST', item_id: it.id, qty: input.qty, unit_cost: it.unit_cost, reason: input.reason.trim(),
      }));
      await audit('Adjustment requested', 'stock_txn', t.id, `${t.ref}: ${t.qty > 0 ? '+' : ''}${t.qty} ${it.name} (${t.reason})`);
      return t;
    },
    /** Returns are recorded immediately: good items go back on the shelf, damaged / lost are logged only. */
    async stockReturn(input: { item_id: string; qty: number; batch_id: string; condition: ReturnCondition; reason: string }) {
      need('stock.create');
      const it = item(input.item_id);
      if (!Number.isInteger(input.qty) || input.qty <= 0) throw new RuleError('Quantity must be a whole number above zero.');
      const { stock_txns } = get().data;
      let outstanding = 0;
      for (const t of stock_txns) {
        if (t.status !== 'Approved' || t.batch_id !== input.batch_id || t.item_id !== it.id) continue;
        if (t.type === 'OUT') outstanding += t.qty;
        if (t.type === 'RETURN') outstanding -= t.qty;
      }
      if (input.qty > outstanding) throw new RuleError(`Only ${outstanding} ${it.unit} of ${it.name} are still out with this batch.`);
      if (input.condition !== 'Good' && input.reason.trim().length < 3) throw new RuleError('Describe the damage or loss.');
      const t = await insertWithRef('stock_txns', 'STK', (ref) => ({
        ...baseTxn(), ref, type: 'RETURN', item_id: it.id, qty: input.qty, unit_cost: it.unit_cost, batch_id: input.batch_id,
        condition: input.condition, reason: input.reason.trim() || null, status: 'Approved', decided_by: get().user.id, decided_at: nowIso(),
      }));
      await syncStock(t);
      await audit('Return', 'stock_txn', t.id, `${t.ref}: ${t.qty} ${it.name} returned (${t.condition})`);
      return t;
    },
    async decideTxn(id: string, approve: boolean, note: string) {
      need('approve');
      const t = get().data.stock_txns.find((x) => x.id === id);
      if (!t || t.status !== 'Pending') throw new RuleError('This transaction is no longer pending.');
      notSelf(t.created_by);
      if (!approve && !note.trim()) throw new RuleError('Give a reason for rejecting.');
      if (approve) applyDelta(item(t.item_id), stockDelta(t)); // Rule 1: no negative stock
      const saved = await update('stock_txns', id, { status: approve ? 'Approved' : 'Rejected', decided_by: get().user.id, decided_at: nowIso(), decision_note: note.trim() || null });
      if (approve) {
        await syncStock(saved);
        const it = item(t.item_id);
        if (t.type === 'IN' && t.unit_cost > 0 && it.unit_cost !== t.unit_cost) await update('items', it.id, { unit_cost: t.unit_cost });
      }
      await audit(approve ? 'Approve' : 'Reject', 'stock_txn', id, `${t.ref} ${t.type}${note ? `: ${note}` : ''}`);
      return saved;
    },
    /** file: a new attachment, null to remove it, undefined to keep the current one. */
    async saveRequest(input: { id?: string; batch_id: string; purpose: string; remarks: string; lines: RequestLine[] }, file?: File | null) {
      need('request.create');
      const lines = input.lines.filter((l) => l.item_id);
      validateLines(lines);
      if (!get().data.batches.some((b) => b.id === input.batch_id)) throw new RuleError('Choose a training batch.');
      const short = checkAvailability(lines, get().data.items);
      if (short.length) throw new RuleError(`Not enough stock: ${short.join('; ')}`);
      const filePatch: Partial<MaterialRequest> = file === undefined ? {} : { attachment: file ? await db.upload(file) : null };
      if (input.id) {
        const r = get().data.material_requests.find((x) => x.id === input.id);
        if (!r || r.status === 'Approved') throw new RuleError('Approved requests cannot be edited.');
        const saved = await update('material_requests', input.id, {
          batch_id: input.batch_id, purpose: input.purpose.trim(), remarks: input.remarks.trim(), lines, ...filePatch,
          status: 'Pending', decided_by: null, decided_at: null, decision_note: null,
        });
        await audit('Resubmit', 'material_request', saved.id, `${saved.ref} (${lines.length} lines)`);
        return saved;
      }
      const saved = await insertWithRef('material_requests', 'MR', (ref) => ({
        id: uid(), ref, batch_id: input.batch_id, purpose: input.purpose.trim(), remarks: input.remarks.trim(), lines, attachment: null, ...filePatch, status: 'Pending',
        created_by: get().user.id, created_at: nowIso(), decided_by: null, decided_at: null, decision_note: null,
      }));
      await audit('Create', 'material_request', saved.id, `${saved.ref} (${lines.length} lines)`);
      return saved;
    },
    async decideRequest(id: string, approve: boolean, note: string) {
      need('approve');
      const r = get().data.material_requests.find((x) => x.id === id);
      if (!r || r.status !== 'Pending') throw new RuleError('This request is no longer pending.');
      notSelf(r.created_by);
      if (!approve) {
        if (!note.trim()) throw new RuleError('Tell staff what to change.');
        const saved = await update('material_requests', id, { status: 'Rejected', decided_by: get().user.id, decided_at: nowIso(), decision_note: note.trim() });
        await audit('Reject', 'material_request', id, `${r.ref}: ${note}`);
        return saved;
      }
      const short = checkAvailability(r.lines, get().data.items);
      if (short.length) throw new RuleError(`Cannot issue, stock has changed: ${short.join('; ')}`);
      for (const l of r.lines) {
        const it = item(l.item_id);
        const t = await insertWithRef('stock_txns', 'STK', (ref) => ({
          ...baseTxn(), ref, type: 'OUT', item_id: it.id, qty: l.qty, unit_cost: it.unit_cost, batch_id: r.batch_id, request_id: r.id,
          reason: r.ref, status: 'Approved', created_by: r.created_by, decided_by: get().user.id, decided_at: nowIso(),
        }));
        await syncStock(t);
      }
      const saved = await update('material_requests', id, { status: 'Approved', decided_by: get().user.id, decided_at: nowIso(), decision_note: note.trim() || null });
      await audit('Approve & issue', 'material_request', id, `${r.ref}: ${r.lines.length} lines issued`);
      return saved;
    },
    async submitCount(input: { month: string; lines: CountLine[]; note: string }) {
      need('count.create');
      if (!/^\d{4}-\d{2}$/.test(input.month)) throw new RuleError('Choose the count month.');
      for (const l of input.lines) {
        if (!Number.isInteger(l.counted_qty) || l.counted_qty < 0) throw new RuleError('Counted quantities must be whole numbers, zero or more.');
      }
      const pc: PhysicalCount = await insertWithRef('physical_counts', 'PC', (ref) => ({
        id: uid(), ref, month: input.month, lines: input.lines, note: input.note.trim(), created_by: get().user.id, created_at: nowIso(),
      }));
      let created = 0;
      for (const l of input.lines) {
        const diff = l.counted_qty - l.system_qty;
        if (diff === 0) continue;
        const it = item(l.item_id);
        await insertWithRef('stock_txns', 'STK', (ref) => ({
          ...baseTxn(), ref, type: 'ADJUST', item_id: it.id, qty: diff, unit_cost: it.unit_cost, reason: `Physical count ${pc.ref} (${input.month})`,
        }));
        created++;
      }
      await audit('Physical count', 'physical_count', pc.id, `${pc.ref}: ${input.lines.length} items counted, ${created} variances sent for approval`);
      return { count: pc, adjustments: created };
    },

    // ------------------------------------------------------------ deposits
    async registerDeposit(
      input: Pick<Deposit, 'trainee_name' | 'nrc' | 'agent_code' | 'trainee_type' | 'batch_id' | 'training_date' | 'training_end_date' | 'amount' | 'payment_date'>,
      files: File[] = [],
    ) {
      need('deposit.create');
      validateNewDeposit(input, get().data.deposits, get().data.batches);
      const documents: Attachment[] = [];
      for (const f of files) documents.push(await db.upload(f));
      const saved = await insertWithRef('deposits', 'DEP', (ref) => ({
        id: uid(), ref, trainee_name: input.trainee_name.trim(), nrc: input.nrc.trim(), agent_code: input.agent_code?.trim().toUpperCase() || null,
        trainee_type: input.trainee_type, batch_id: input.batch_id, training_date: input.training_date, training_end_date: input.training_end_date,
        amount: input.amount, payment_date: input.payment_date, voucher_ref: null, status: 'Held',
        forfeit_reason: null, request_note: null, attachment: null, documents, requested_by: null, requested_at: null,
        hod_approved_by: null, hod_approved_at: null, finance_approved_by: null, finance_approved_at: null,
        finance_voucher_ref: null, closed_at: null, reversal_from: null, reversal_reason: null, created_by: get().user.id, created_at: nowIso(),
      }));
      await logDeposit(saved, null, 'Deposit registered', null);
      await audit('Register deposit', 'deposit', saved.id, `${saved.ref}: ${saved.trainee_name} (NRC ${saved.nrc}, ${saved.trainee_type}) ${saved.amount} MMK${documents.length ? `, ${documents.length} document(s)` : ''}`);
      return saved;
    },
    async editDeposit(id: string, patch: Pick<Deposit, 'trainee_name' | 'nrc' | 'agent_code' | 'trainee_type' | 'training_date' | 'training_end_date' | 'amount' | 'payment_date'>) {
      need('deposit.create');
      const d = get().data.deposits.find((x) => x.id === id);
      if (!d || d.status !== 'Held') throw new RuleError('Only Held deposits can be corrected. Approved ones need a reversal.');
      if (!(patch.amount > 0) || !patch.trainee_name.trim()) throw new RuleError('Name and amount are required.');
      validateTrainingDates(patch.training_date, patch.training_end_date);
      if (!isValidNrc(patch.nrc)) throw new RuleError('NRC format looks wrong. Example: 12/MaYaKa(N)123456');
      const others = get().data.deposits.filter((x) => x.id !== id && x.status !== 'Refunded' && x.status !== 'Forfeited');
      if (others.some((x) => normalizeNrc(x.nrc) === normalizeNrc(patch.nrc))) throw new RuleError('Another open deposit already uses this NRC.');
      const clean = { ...patch, nrc: patch.nrc.trim(), agent_code: patch.agent_code?.trim().toUpperCase() || null };
      const saved = await update('deposits', id, clean);
      const changed = (Object.keys(clean) as (keyof typeof clean)[]).filter((k) => clean[k] !== d[k]);
      await audit('Edit deposit', 'deposit', id, `${d.ref}: ${changed.map((k) => `${k}: ${String(d[k])} → ${String(clean[k])}`).join('; ')}`);
      return saved;
    },
    /** Supporting documents can be added while the deposit is still open (not after Refunded / Forfeited). */
    async addDepositDocuments(id: string, files: File[]) {
      need('deposit.create');
      const d = get().data.deposits.find((x) => x.id === id);
      if (!d) throw new RuleError('Deposit not found.');
      if (d.status === 'Refunded' || d.status === 'Forfeited' || d.status === 'Reversal Request') throw new RuleError('This deposit is closed; documents can no longer be added.');
      if (!files.length) throw new RuleError('Choose at least one file.');
      const added: Attachment[] = [];
      for (const f of files) added.push(await db.upload(f));
      const saved = await update('deposits', id, { documents: [...(d.documents ?? []), ...added] });
      await audit('Add documents', 'deposit', id, `${d.ref}: ${added.map((a) => a.name).join(', ')}`);
      return saved;
    },
    async depositAction(id: string, action: DepositAction, file?: File | null) {
      const { user, data } = get();
      const d = data.deposits.find((x) => x.id === id);
      if (!d) throw new RuleError('Deposit not found.');
      const withFile = (action.kind === 'requestRefund' || action.kind === 'requestForfeit') ? { ...action, hasAttachment: !!file } : action;
      const patch = depositTransition(d, withFile, user.role as Role, user.id, nowIso());
      if (file) patch.attachment = await db.upload(file);
      const saved = await update('deposits', id, patch);
      const note = 'note' in action ? action.note : 'reason' in action && typeof action.reason === 'string' && action.kind === 'requestReversal' ? action.reason
        : action.kind === 'financeApprove' ? `Paid on ${action.voucherRef}` : action.kind === 'hodApprove' ? 'Approved by HOD' : null;
      if (saved.status !== d.status || action.kind === 'hodApprove') await logDeposit(saved, d.status, note, patch.attachment?.name ?? null);
      await audit(labelFor(action.kind), 'deposit', id, `${d.ref}: ${d.status} → ${saved.status}${note ? ` (${note})` : ''}`);
      return saved;
    },

    // ------------------------------------------------------------ assets
    async registerAsset(input: Omit<Asset, 'id' | 'asset_tag' | 'created_at' | 'status' | 'holder' | 'batch_id'>) {
      need('asset.record');
      if (!input.name.trim() || !input.serial_no.trim()) throw new RuleError('Asset name and serial number are required.');
      const assets = get().data.assets;
      if (assets.some((a) => a.serial_no.toLowerCase() === input.serial_no.trim().toLowerCase())) throw new RuleError('That serial number is already registered.');
      const max = assets.reduce((m, a) => Math.max(m, parseInt(a.asset_tag.replace(/\D/g, ''), 10) || 0), 0);
      const saved = await insert('assets', {
        ...input, id: uid(), asset_tag: `AST-${String(max + 1).padStart(4, '0')}`, serial_no: input.serial_no.trim(), status: 'Available',
        holder: null, batch_id: null, created_at: nowIso(),
      });
      await insert('asset_logs', { id: uid(), asset_id: saved.id, action: 'Registered', condition: saved.condition, holder: null, batch_id: null, cost: 0, note: 'Asset registered', created_by: get().user.id, created_at: nowIso() });
      await audit('Register asset', 'asset', saved.id, `${saved.asset_tag} ${saved.name}`);
      return saved;
    },
    async assetAction(id: string, action: AssetAction, opts: { holder?: string; batch_id?: string | null; condition?: AssetCondition; cost?: number; note?: string }) {
      need('asset.record');
      const a = get().data.assets.find((x) => x.id === id);
      if (!a) throw new RuleError('Asset not found.');
      const allowed: Record<AssetAction, Asset['status'][]> = {
        'Registered': [], 'Check Out': ['Available'], 'Check In': ['Checked Out'], 'Maintenance Start': ['Available', 'Damaged', 'Checked Out'],
        'Maintenance Done': ['Maintenance'], 'Reported Damaged': ['Available', 'Checked Out', 'Maintenance'],
        'Reported Lost': ['Available', 'Checked Out', 'Maintenance', 'Damaged'], 'Retired': ['Available', 'Damaged', 'Lost'],
      };
      if (!allowed[action].includes(a.status)) throw new RuleError(`Cannot "${action}" an asset that is ${a.status}.`);
      if (action === 'Check Out' && !opts.holder?.trim()) throw new RuleError('Who is taking the asset?');
      if ((action === 'Reported Damaged' || action === 'Reported Lost') && !opts.note?.trim()) throw new RuleError('Describe what happened.');
      const next: Record<AssetAction, Partial<Asset>> = {
        'Registered': {},
        'Check Out': { status: 'Checked Out', holder: opts.holder!.trim(), batch_id: opts.batch_id ?? null },
        'Check In': { status: opts.condition === 'Damaged' ? 'Damaged' : 'Available', holder: null, batch_id: null, condition: opts.condition ?? a.condition },
        'Maintenance Start': { status: 'Maintenance', holder: null, batch_id: null },
        'Maintenance Done': { status: 'Available', condition: opts.condition ?? 'Good' },
        'Reported Damaged': { status: 'Damaged', condition: 'Damaged' },
        'Reported Lost': { status: 'Lost', holder: null },
        'Retired': { status: 'Retired', holder: null, batch_id: null },
      };
      const saved = await update('assets', id, next[action]);
      await insert('asset_logs', {
        id: uid(), asset_id: id, action, condition: saved.condition, holder: opts.holder?.trim() || a.holder, batch_id: opts.batch_id ?? a.batch_id,
        cost: opts.cost ?? 0, note: opts.note?.trim() ?? '', created_by: get().user.id, created_at: nowIso(),
      });
      await audit(action, 'asset', id, `${a.asset_tag}: ${a.status} → ${saved.status}${opts.note ? ` (${opts.note})` : ''}`);
      return saved;
    },

    // ------------------------------------------------------------ budget
    async addExpense(input: Omit<Expense, 'id' | 'created_by' | 'created_at'>) {
      need('expense.create');
      if (!(input.amount > 0) || !input.description.trim() || !input.date) throw new RuleError('Date, description and a positive amount are required.');
      if (input.batch_id) input = { ...input, budget_category: budgetCategory(get().data.batches.find((b) => b.id === input.batch_id)) };
      const saved = await insert('expenses', { ...input, description: input.description.trim(), id: uid(), created_by: get().user.id, created_at: nowIso() });
      await audit('Record expense', 'expense', saved.id, `${saved.budget_category} / ${saved.category}: ${saved.description} ${saved.amount} MMK`);
      return saved;
    },
    async setBudget(year: number, category: Budget['category'], amount: number, note: string) {
      need('budget.manage');
      if (!(amount > 0)) throw new RuleError('Budget must be above zero.');
      const existing = get().data.budgets.find((b) => b.fiscal_year === year && (b.category ?? 'Overall') === category);
      if (existing && existing.amount === amount && existing.note === note) return existing;
      const saved: Budget = existing
        ? await update('budgets', existing.id, { amount, note })
        : await insert('budgets', { id: uid(), fiscal_year: year, category, amount, note, created_at: nowIso() });
      await audit('Set budget', 'budget', saved.id, `FY${year} ${category}: ${existing ? `${existing.amount} → ` : ''}${amount} MMK`);
      return saved;
    },

    // ------------------------------------------------------------ admin
    async updateProfile(id: string, patch: Partial<Pick<Profile, 'role' | 'active' | 'name'>>) {
      need('users.manage');
      if (id === get().user.id && (patch.active === false || (patch.role && patch.role !== 'admin'))) {
        throw new RuleError('You cannot deactivate or demote your own administrator account.');
      }
      const before = get().data.profiles.find((p) => p.id === id);
      const saved = await update('profiles', id, patch);
      await audit('Update user', 'profile', id, `${saved.email}: ${JSON.stringify({ from: { role: before?.role, active: before?.active }, to: patch })}`);
      return saved;
    },
    async addDemoUser(name: string, email: string, role: Role) {
      need('users.manage');
      if (db.mode !== 'demo') throw new RuleError('In production, users sign up themselves and you then assign a role.');
      if (!name.trim() || !/^\S+@\S+$/.test(email)) throw new RuleError('Enter a name and a valid email.');
      if (get().data.profiles.some((p) => p.email.toLowerCase() === email.toLowerCase())) throw new RuleError('That email already exists.');
      const saved = await insert('profiles', { id: uid(), name: name.trim(), email: email.trim(), role, active: true, created_at: nowIso() });
      await audit('Create user', 'profile', saved.id, `${saved.email} as ${role}`);
      return saved;
    },
    async saveSettings(patch: Pick<Settings, 'retention_alert_months' | 'service_term_months'>) {
      need('settings.manage');
      if (!(patch.retention_alert_months > 0) || !(patch.service_term_months > patch.retention_alert_months)) {
        throw new RuleError('The alert month must be above zero and before the service term.');
      }
      const existing = get().data.settings[0];
      const saved = existing
        ? await update('settings', existing.id, { ...patch, updated_at: nowIso() })
        : await insert('settings', { ...DEFAULT_SETTINGS, ...patch, updated_at: nowIso() });
      await audit('Update settings', 'settings', saved.id, JSON.stringify(patch));
      return saved;
    },
    audit,
  };

  async function logDeposit(d: Deposit, from: Deposit['status'] | null, note: string | null, attachmentName: string | null) {
    // In Supabase the database trigger writes this history itself (with the real user and IP); fetch what it wrote.
    if (db.serverSideAudit) {
      const rows = await db.listBy('deposit_status_log', 'deposit_id', d.id);
      set((data) => ({ ...data, deposit_status_log: [...data.deposit_status_log.filter((l) => l.deposit_id !== d.id), ...rows] }));
      return;
    }
    const { user } = get();
    await insert('deposit_status_log', {
      id: uid(), deposit_id: d.id, from_status: from, to_status: d.status, note, attachment_name: attachmentName,
      user_id: user.id, user_name: user.name, ip: 'local (demo)', created_at: nowIso(),
    });
  }
}

function labelFor(kind: DepositAction['kind']): string {
  return {
    requestRefund: 'Refund requested', requestForfeit: 'Forfeiture requested', hodApprove: 'HOD approved', financeApprove: 'Finance confirmed refund',
    reject: 'Request rejected', requestReversal: 'Reversal requested', approveReversal: 'Reversal approved', rejectReversal: 'Reversal rejected',
  }[kind];
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const db = useMemo(() => createAdapter(), []);
  const [data, setData] = useState<DataSet | null>(null);
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<{ data: DataSet | null; user: Profile | null }>({ data: null, user: null });
  useEffect(() => { ref.current = { data, user }; }, [data, user]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const u = await db.currentUser();
      const d = u && u.active ? await db.loadAll() : null;
      ref.current = { data: d, user: u };
      setUser(u);
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { void refresh(); }, [refresh]);

  const actions = useMemo(() => makeActions(
    db,
    () => {
      const { data: d, user: u } = ref.current;
      if (!d || !u) throw new RuleError('Please sign in again.');
      return { data: d, user: u };
    },
    (fn) => {
      // Keep the ref as the synchronous source of truth so consecutive awaits in one action see each other's writes.
      const d = ref.current.data;
      if (!d) return;
      const next = fn(d);
      ref.current = { ...ref.current, data: next };
      setData(next);
    },
    refresh,
  ), [db, refresh]);

  const value: StoreValue = {
    db, data, user, loading, error, actions, refresh,
    settings: data?.settings[0] ?? DEFAULT_SETTINGS,
    can: (p) => can(user?.role, p),
    signIn: async (e, p) => { await db.signIn(e, p); setLoading(true); await refresh(); },
    signUp: async (n, e, p) => { await db.signUp(n, e, p); await refresh(); },
    demoSignIn: async (id) => { db.demoSignIn?.(id); setLoading(true); await refresh(); },
    signOut: async () => { await db.signOut(); setUser(null); setData(null); },
    name: (id) => data?.profiles.find((p) => p.id === id)?.name ?? (id ? 'Unknown user' : '—'),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}

/** Data is guaranteed once the user is inside the app shell. */
export function useData() {
  const s = useStore();
  if (!s.data || !s.user) throw new Error('Data not loaded');
  return { ...s, data: s.data, user: s.user };
}
