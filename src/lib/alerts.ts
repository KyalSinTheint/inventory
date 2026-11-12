import { isLowStock, retention } from './logic';
import type { DataSet, Profile, Settings } from './types';

export interface ApprovalCounts { txns: number; requests: number; deposits: number; finance: number; total: number }

export function approvalCounts(data: DataSet, user: Profile): ApprovalCounts {
  const notMine = (by: string | null) => by !== user.id;
  if (user.role === 'hod') {
    const txns = data.stock_txns.filter((t) => t.status === 'Pending' && notMine(t.created_by)).length;
    const requests = data.material_requests.filter((r) => r.status === 'Pending' && notMine(r.created_by)).length;
    const deposits = data.deposits.filter((d) =>
      ((d.status === 'Refund Request' && !d.hod_approved_by) || d.status === 'Forfeiture Request' || d.status === 'Reversal Request') && notMine(d.requested_by)).length;
    return { txns, requests, deposits, finance: 0, total: txns + requests + deposits };
  }
  if (user.role === 'finance') {
    const finance = data.deposits.filter((d) => d.status === 'Refund Request' && d.hod_approved_by).length;
    return { txns: 0, requests: 0, deposits: 0, finance, total: finance };
  }
  return { txns: 0, requests: 0, deposits: 0, finance: 0, total: 0 };
}

export function lowStockItems(data: DataSet) {
  return data.items.filter((i) => i.active && isLowStock(i)).sort((a, b) => a.qty_on_hand / Math.max(1, a.min_level) - b.qty_on_hand / Math.max(1, b.min_level));
}

export function retentionAlerts(data: DataSet, s: Settings, today: string) {
  return data.deposits
    .map((d) => ({ d, r: retention(d, s.retention_alert_months, s.service_term_months, today) }))
    .filter((x) => x.r.level !== 'ok')
    .sort((a, b) => a.r.daysLeft - b.r.daysLeft);
}
