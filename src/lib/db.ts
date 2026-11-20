import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Attachment, DataSet, Profile, StockTxn, TableName, Tables } from './types';
import { stockDelta } from './logic';
import { TABLE_NAMES } from './types';
import { buildSeed } from './seed';

export interface DataAdapter {
  mode: 'demo' | 'supabase';
  /** True when the database itself writes deposit status history and audit metadata (user, IP). */
  serverSideAudit: boolean;
  loadAll(): Promise<DataSet>;
  insert<K extends TableName>(table: K, row: Tables[K]): Promise<Tables[K]>;
  update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>): Promise<Tables[K]>;
  remove(table: TableName, id: string): Promise<void>;
  /** Rows of a table where column = value (used to pick up rows written by database triggers). */
  listBy<K extends TableName>(table: K, column: string, value: string): Promise<Tables[K][]>;
  /**
   * Applies an approved transaction to its item's balance and returns the new quantity on hand.
   * Supabase does this in a database trigger when the transaction is saved as Approved, so here it only re-reads the balance.
   */
  applyStock(txn: StockTxn): Promise<number>;
  upload(file: File): Promise<Attachment>;
  openFile(att: Attachment): Promise<string>;
  currentUser(): Promise<Profile | null>;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** True until the first System Administrator account exists (Supabase only). */
  needsSetup(): Promise<boolean>;
  /** First-time setup: creates the System Administrator login (only while none exists). */
  setupFirstAdmin(name: string, email: string, password: string): Promise<void>;
  /** Administrator creates a ready-to-use login; returns the new profile id. */
  createLogin(name: string, email: string, password: string, role: Profile['role']): Promise<string>;
  /** Administrator sets a new password for someone. */
  setPassword(userId: string, password: string): Promise<void>;
  /** The signed-in person changes their own password. */
  changeOwnPassword(password: string): Promise<void>;
  /** Demo mode only: sign in as a seeded user without a password. */
  demoSignIn?(userId: string): void;
  resetDemo?(): void;
}

// ------------------------------------------------------------------- demo
export const STORE_KEY = 'ld-portal-data-v3';
const USER_KEY = 'ld-portal-user-v1';
const MAX_DEMO_FILE = 1_500_000;

function readStore(): DataSet {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DataSet>;
      for (const t of TABLE_NAMES) if (!Array.isArray(parsed[t])) (parsed as Record<string, unknown>)[t] = [];
      return parsed as DataSet;
    }
  } catch { /* fall through to seed */ }
  const seed = buildSeed();
  writeStore(seed);
  return seed;
}

function writeStore(d: DataSet) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
  } catch {
    throw new Error('Browser storage is full. Remove large attachments or reset the demo data.');
  }
}

export function demoAdapter(): DataAdapter {
  let data = readStore();
  const save = () => writeStore(data);
  return {
    mode: 'demo',
    serverSideAudit: false,
    async loadAll() { data = readStore(); return structuredClone(data); },
    async insert(table, row) {
      const list = data[table] as unknown as { id: string; ref?: string }[];
      const r = row as unknown as { id: string; ref?: string };
      if (r.ref && list.some((x) => x.ref === r.ref)) throw new Error('duplicate key value (ref)');
      list.push(structuredClone(r));
      save();
      return structuredClone(row);
    },
    async update(table, id, patch) {
      const list = data[table] as unknown as { id: string }[];
      const i = list.findIndex((x) => x.id === id);
      if (i < 0) throw new Error('Record not found');
      list[i] = { ...list[i], ...structuredClone(patch) };
      save();
      return structuredClone(list[i]) as never;
    },
    async remove(table, id) {
      const list = data[table] as unknown as { id: string }[];
      (data as Record<string, unknown>)[table] = list.filter((x) => x.id !== id);
      save();
    },
    async listBy(table, column, value) {
      return structuredClone((data[table] as unknown as Record<string, unknown>[]).filter((r) => r[column] === value)) as never;
    },
    async applyStock(txn) {
      const it = data.items.find((i) => i.id === txn.item_id);
      if (!it) throw new Error('Item not found');
      const delta = stockDelta(txn);
      const next = Math.round((it.qty_on_hand + delta) * 1e6) / 1e6;
      if (next < 0) throw new Error(`Not enough stock for "${it.name}" (${it.qty_on_hand} available).`);
      it.qty_on_hand = next;
      save();
      return it.qty_on_hand;
    },
    async upload(file) {
      if (file.size > MAX_DEMO_FILE) throw new Error('Demo mode keeps files in the browser: please use a file under 1.5 MB.');
      const url = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result as string);
        fr.onerror = () => rej(fr.error);
        fr.readAsDataURL(file);
      });
      return { name: file.name, url, size: file.size };
    },
    async openFile(att) { return att.url; },
    async currentUser() {
      const id = localStorage.getItem(USER_KEY);
      return data.profiles.find((p) => p.id === id && p.active) ?? null;
    },
    async signIn(email) {
      const p = data.profiles.find((x) => x.email.toLowerCase() === email.toLowerCase());
      if (!p) throw new Error('No demo user with that email.');
      if (!p.active) throw new Error('This account is deactivated.');
      localStorage.setItem(USER_KEY, p.id);
    },
    async signUp() { throw new Error('Sign-up is not available in demo mode. Pick a demo user instead.'); },
    async needsSetup() { return false; },
    async setupFirstAdmin() { throw new Error('Not used in demo mode.'); },
    async createLogin() { throw new Error('Not used in demo mode.'); },
    async setPassword() { /* demo users have no password */ },
    async changeOwnPassword() { /* demo users have no password */ },
    async signOut() { localStorage.removeItem(USER_KEY); },
    demoSignIn(id) { localStorage.setItem(USER_KEY, id); },
    resetDemo() { localStorage.removeItem(STORE_KEY); data = readStore(); },
  };
}

// ------------------------------------------------------------------- supabase
const BUCKET = 'attachments';
const PAGE = 1000;

function friendly(msg: string): string {
  if (/Could not find the function|schema cache/i.test(msg)) return 'The database needs the latest update: run supabase_setup_all.sql in Supabase → SQL Editor, then reload.';
  if (msg.includes('items_qty_on_hand_check')) return 'Not enough stock: this would make the balance negative.';
  if (msg.includes('row-level security') || msg.includes('0 rows') || msg.includes('JSON object requested')) return 'You do not have permission to do this (or the record changed). Reload and try again.';
  return msg;
}

export function supabaseAdapter(url: string, key: string): DataAdapter {
  const sb: SupabaseClient = createClient(url, key);

  async function selectAll(table: TableName) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      // settings is a single row keyed by id and has no created_at column.
      const { data, error } = await sb.from(table).select('*').order(table === 'settings' ? 'id' : 'created_at', { ascending: true }).range(from, from + PAGE - 1);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    return rows;
  }

  const num = (v: unknown) => (v === null || v === undefined ? v : Number(v));
  // Postgres numeric comes back as a string; normalise the money / quantity columns.
  function normalise(table: TableName, rows: unknown[]) {
    const numeric: Partial<Record<TableName, string[]>> = {
      items: ['unit_cost', 'min_level', 'qty_on_hand', 'pack_qty'], batches: ['budget'], stock_txns: ['qty', 'unit_cost'],
      assets: ['cost'], asset_logs: ['cost'], deposits: ['amount'], expenses: ['amount'], budgets: ['amount', 'fiscal_year'],
      settings: ['retention_alert_months', 'service_term_months', 'low_stock_warning_pct'],
    };
    const cols = numeric[table];
    if (!cols) return rows;
    return rows.map((r) => {
      const o = { ...(r as Record<string, unknown>) };
      for (const c of cols) o[c] = num(o[c]);
      return o;
    });
  }

  return {
    mode: 'supabase',
    serverSideAudit: true,
    async loadAll() {
      const entries = await Promise.all(TABLE_NAMES.map(async (t) => [t, normalise(t, await selectAll(t))] as const));
      return Object.fromEntries(entries) as unknown as DataSet;
    },
    async insert(table, row) {
      const { data, error } = await sb.from(table).insert(row as never).select().single();
      if (error) throw new Error(friendly(error.message));
      return normalise(table, [data])[0] as never;
    },
    async update(table, id, patch) {
      const { data, error } = await sb.from(table).update(patch as never).eq('id', id).select().single();
      if (error) throw new Error(friendly(error.message));
      return normalise(table, [data])[0] as never;
    },
    async remove(table, id) {
      const { error } = await sb.from(table).delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    async listBy(table, column, value) {
      const { data, error } = await sb.from(table).select('*').eq(column, value);
      if (error) throw new Error(error.message);
      return normalise(table, data ?? []) as never;
    },
    async applyStock(txn) {
      const { data, error } = await sb.from('items').select('qty_on_hand').eq('id', txn.item_id).single();
      if (error) throw new Error(error.message);
      return Number(data.qty_on_hand);
    },
    async upload(file) {
      if (file.size > 10_000_000) throw new Error('Files must be under 10 MB.');
      const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (error) throw new Error(error.message);
      return { name: file.name, url: path, size: file.size };
    },
    async openFile(att) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(att.url, 300);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
    async currentUser() {
      const { data } = await sb.auth.getUser();
      if (!data.user) return null;
      const { data: p } = await sb.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
      return (p as Profile | null) ?? null;
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    async signUp(name, email, password) {
      const { error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
      if (error) throw new Error(error.message);
    },
    async signOut() { await sb.auth.signOut(); },
    async needsSetup() {
      const { data, error } = await sb.rpc('portal_needs_setup');
      if (error) throw new Error(friendly(error.message));
      return data === true;
    },
    async setupFirstAdmin(name, email, password) {
      const { error } = await sb.rpc('setup_first_admin', { p_email: email, p_password: password, p_name: name });
      if (error) throw new Error(friendly(error.message));
      await this.signIn(email, password);
    },
    async createLogin(name, email, password, role) {
      const { data, error } = await sb.rpc('admin_create_user', { p_email: email, p_password: password, p_name: name, p_role: role });
      if (error) throw new Error(friendly(error.message));
      return data as string;
    },
    async setPassword(userId, password) {
      const { error } = await sb.rpc('admin_set_password', { p_user: userId, p_password: password });
      if (error) throw new Error(friendly(error.message));
    },
    async changeOwnPassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },
  };
}

export function createAdapter(): DataAdapter {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  // Legacy anon key or the newer publishable key (sb_publishable_…): both are safe in the browser.
  const key = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY
    || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? supabaseAdapter(url, key) : demoAdapter();
}
