export type Role = 'staff' | 'hod' | 'finance' | 'admin';

export const ROLE_LABELS: Record<Role, string> = {
  staff: 'L&D Staff',
  hod: 'L&D HOD',
  finance: 'Finance / Auditor',
  admin: 'System Administrator',
};

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  created_at: string;
}

export const CATEGORIES = ['Refreshments', 'Training Materials', 'YCP Program', 'Office Supplies'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CLASSIFICATIONS = ['Consumable', 'Reusable Asset', 'Merchandise'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export interface Item {
  id: string;
  code: string;
  name: string;
  category: Category;
  classification: Classification;
  unit: string;
  unit_cost: number;
  min_level: number;
  qty_on_hand: number;
  active: boolean;
  created_at: string;
}

export const PROGRAMS = ['Corporate', 'Agency', 'YCP', 'License'] as const;
export type Program = (typeof PROGRAMS)[number];
export type BatchStatus = 'Planned' | 'Active' | 'Completed';

export interface Batch {
  id: string;
  code: string;
  name: string;
  program: Program;
  start_date: string;
  end_date: string;
  budget: number;
  status: BatchStatus;
  created_at: string;
}

export type TxnType = 'IN' | 'OUT' | 'RETURN' | 'ADJUST';
export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected';
export type ReturnCondition = 'Good' | 'Damaged' | 'Lost';

export const TXN_LABELS: Record<TxnType, string> = {
  IN: 'Stock In',
  OUT: 'Stock Out (Issue)',
  RETURN: 'Return',
  ADJUST: 'Adjustment / Write-off',
};

export interface StockTxn {
  id: string;
  ref: string;
  type: TxnType;
  item_id: string;
  /** Always positive except ADJUST, where the sign is the direction of the change. */
  qty: number;
  unit_cost: number;
  batch_id: string | null;
  request_id: string | null;
  supplier: string | null;
  invoice_no: string | null;
  condition: ReturnCondition | null;
  reason: string | null;
  status: ApprovalStatus;
  created_by: string;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface RequestLine {
  item_id: string;
  qty: number;
}

export interface MaterialRequest {
  id: string;
  ref: string;
  batch_id: string;
  purpose: string;
  lines: RequestLine[];
  status: ApprovalStatus;
  created_by: string;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface CountLine {
  item_id: string;
  system_qty: number;
  counted_qty: number;
}

export interface PhysicalCount {
  id: string;
  ref: string;
  month: string; // YYYY-MM
  lines: CountLine[];
  note: string;
  created_by: string;
  created_at: string;
}

export type AssetStatus = 'Available' | 'Checked Out' | 'Maintenance' | 'Damaged' | 'Lost' | 'Retired';
export type AssetCondition = 'Good' | 'Fair' | 'Damaged';

export interface Asset {
  id: string;
  asset_tag: string;
  name: string;
  serial_no: string;
  category: Category;
  purchase_date: string;
  cost: number;
  condition: AssetCondition;
  status: AssetStatus;
  location: string;
  holder: string | null;
  batch_id: string | null;
  created_at: string;
}

export type AssetAction = 'Registered' | 'Check Out' | 'Check In' | 'Maintenance Start' | 'Maintenance Done' | 'Reported Damaged' | 'Reported Lost' | 'Retired';

export interface AssetLog {
  id: string;
  asset_id: string;
  action: AssetAction;
  condition: AssetCondition | null;
  holder: string | null;
  batch_id: string | null;
  cost: number;
  note: string;
  created_by: string;
  created_at: string;
}

export const DEPOSIT_STATUSES = ['Held', 'Refund Request', 'Refunded', 'Forfeiture Request', 'Forfeited', 'Reversal Request'] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

export const FORFEIT_REASONS = ['Course Incomplete', 'Service Period Not Met'] as const;
export type ForfeitReason = (typeof FORFEIT_REASONS)[number];

export interface Attachment {
  name: string;
  /** Storage path (Supabase) or data URL (demo mode). */
  url: string;
  size: number;
}

export interface Deposit {
  id: string;
  ref: string;
  trainee_name: string;
  agent_code: string;
  batch_id: string;
  amount: number;
  payment_date: string;
  voucher_ref: string;
  status: DepositStatus;
  forfeit_reason: ForfeitReason | null;
  request_note: string | null;
  attachment: Attachment | null;
  requested_by: string | null;
  requested_at: string | null;
  hod_approved_by: string | null;
  hod_approved_at: string | null;
  finance_approved_by: string | null;
  finance_approved_at: string | null;
  finance_voucher_ref: string | null;
  closed_at: string | null;
  /** Status the deposit had before a reversal was requested. */
  reversal_from: DepositStatus | null;
  reversal_reason: string | null;
  created_by: string;
  created_at: string;
}

export interface DepositStatusLog {
  id: string;
  deposit_id: string;
  from_status: DepositStatus | null;
  to_status: DepositStatus;
  note: string | null;
  attachment_name: string | null;
  user_id: string;
  user_name: string;
  ip: string | null;
  created_at: string;
}

export const EXPENSE_CATEGORIES = ['Refreshments', 'Training Materials', 'Venue', 'Transport', 'Printing', 'Other'] as const;

export interface Expense {
  id: string;
  date: string;
  batch_id: string | null;
  category: string;
  description: string;
  amount: number;
  created_by: string;
  created_at: string;
}

export interface Budget {
  id: string;
  fiscal_year: number;
  amount: number;
  note: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  entity: string;
  entity_id: string | null;
  details: string;
  ip: string | null;
  created_at: string;
}

export interface Settings {
  id: string;
  retention_alert_months: number;
  service_term_months: number;
  low_stock_warning_pct: number;
  updated_at: string;
}

export interface Tables {
  profiles: Profile;
  items: Item;
  batches: Batch;
  stock_txns: StockTxn;
  material_requests: MaterialRequest;
  physical_counts: PhysicalCount;
  assets: Asset;
  asset_logs: AssetLog;
  deposits: Deposit;
  deposit_status_log: DepositStatusLog;
  expenses: Expense;
  budgets: Budget;
  audit_logs: AuditLog;
  settings: Settings;
}

export type TableName = keyof Tables;
export const TABLE_NAMES: TableName[] = [
  'profiles', 'items', 'batches', 'stock_txns', 'material_requests', 'physical_counts', 'assets',
  'asset_logs', 'deposits', 'deposit_status_log', 'expenses', 'budgets', 'audit_logs', 'settings',
];

export type DataSet = { [K in TableName]: Tables[K][] };
