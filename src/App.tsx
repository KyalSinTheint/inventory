import { useMemo, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, Bell, Boxes, CheckSquare, ClipboardList, FileText, GraduationCap, LayoutDashboard, Lock, LogOut, PiggyBank,
  RefreshCw, ScrollText, Users, Wallet, Wrench,
  KeyRound,
} from 'lucide-react';
import { StoreProvider, useStore } from './lib/store';
import { approvalCounts, lowStockItems, retentionAlerts } from './lib/alerts';
import { ROLE_LABELS, type Role } from './lib/types';
import { Button, ErrorNote, Field, Modal, PageBandContext, ToastProvider, cx, useSubmit, useToast } from './components/ui';
import { today } from './lib/format';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import InventoryPage from './pages/Inventory';
import RequestsPage from './pages/Requests';
import DepositsPage from './pages/Deposits';
import DepositDetail from './pages/DepositDetail';
import AssetsPage from './pages/Assets';
import BatchesPage from './pages/Batches';
import BudgetPage from './pages/Budget';
import ApprovalsPage from './pages/Approvals';
import ReportsPage from './pages/Reports';
import AuditPage from './pages/Audit';
import UsersPage from './pages/Users';

interface NavItem { to: string; label: string; icon: ReactNode; roles?: Role[]; badge?: number; tone?: 'count' | 'red' | 'amber' }

const ROLE_DESC: Record<Role, { option: string; perm: string }> = {
  staff: { option: 'L&D Staff (Maker / Entry)', perm: 'Maker: Stock & Deposit Requests' },
  hod: { option: 'L&D HOD (Approver & Budget)', perm: 'Approver: Refunds, Forfeitures & Stock' },
  finance: { option: 'Finance / Auditor (Read-Only)', perm: 'Read-Only: Audit & Ledger Verification' },
  admin: { option: 'System Administrator (Full Access)', perm: 'Full Access: Users & Governance' },
};

function Shell({ children }: { children: ReactNode }) {
  const { user, data, settings, signOut, refresh, db, demoSignIn } = useStore();
  const [pwOpen, setPwOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [band, setBand] = useState<HTMLDivElement | null>(null);
  const loc = useLocation();
  const navigate = useNavigate();
  const counts = useMemo(() => (data && user ? approvalCounts(data, user) : null), [data, user]);
  const low = useMemo(() => (data ? lowStockItems(data).length : 0), [data]);
  const alertCount = useMemo(() => (data ? low + retentionAlerts(data, settings, today()).length : 0), [data, settings, low]);
  if (!user || !data) return null;
  const openDeposits = data.deposits.filter((d) => d.status !== 'Refunded' && d.status !== 'Forfeited').length;

  const allNav: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: '/deposits', label: 'License Deposits', icon: <Wallet className="h-4 w-4" />, badge: openDeposits, tone: 'count' },
    { to: '/inventory', label: 'Inventory', icon: <Boxes className="h-4 w-4" />, badge: low, tone: 'red' },
    { to: '/approvals', label: 'Approvals', icon: <CheckSquare className="h-4 w-4" />, roles: ['hod', 'finance'], badge: counts?.total, tone: 'amber' },
    { to: '/requests', label: 'Requests', icon: <ClipboardList className="h-4 w-4" />, roles: ['staff', 'hod', 'admin'] },
    { to: '/assets', label: 'Assets', icon: <Wrench className="h-4 w-4" /> },
    { to: '/batches', label: 'Batches', icon: <GraduationCap className="h-4 w-4" /> },
    { to: '/budget', label: 'Budget & Expenses', icon: <PiggyBank className="h-4 w-4" /> },
    { to: '/reports', label: 'Reports', icon: <BarChart3 className="h-4 w-4" />, roles: ['hod', 'finance', 'admin'] },
    { to: '/audit', label: 'Audit Log', icon: <ScrollText className="h-4 w-4" />, roles: ['hod', 'finance', 'admin'] },
    { to: '/users', label: 'Users', icon: <Users className="h-4 w-4" />, roles: ['admin'] },
  ];
  const nav = allNav.filter((n) => !n.roles || n.roles.includes(user.role));
  const badgeCls = { count: 'bg-white/15 text-white font-mono', red: 'bg-kbz-red text-white font-bold', amber: 'bg-amber-400 text-slate-950 font-bold font-mono' };
  const demoUsers = db.mode === 'demo' ? data.profiles.filter((p) => p.active) : [];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="z-30 bg-kbz-dark text-white shadow-md md:sticky md:top-0">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <NavLink to="/" className="flex min-w-0 items-center gap-3" aria-label="KBZ Life Insurance L&D Portal: home">
            <span className="flex h-12 shrink-0 items-center rounded-xl bg-white px-2.5 py-1 shadow-md">
              <img src="/kbz-life-logo.png" alt="KBZ Life Insurance" className="h-10 w-auto" />
            </span>
            <div className="min-w-0">
              <span className="rounded bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-200">L&amp;D Portal</span>
              <p className="mt-1 hidden text-[11px] leading-tight text-slate-300 sm:block">Training Resource, Inventory &amp; License Deposit Management</p>
            </div>
          </NavLink>
          <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
            {db.mode === 'demo' && <span className="hidden rounded-lg bg-amber-400/20 sm:inline px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200">Demo</span>}
            {user.role === 'finance' && (
              <span className="hidden items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-200 md:inline-flex">
                <Lock className="h-3.5 w-3.5" />Read-Only Audit Mode
              </span>
            )}
            <div className="hidden flex-col border-r border-white/15 pr-3 text-right xl:flex">
              <span className="text-xs font-semibold text-white">{user.name}</span>
              <span className="text-[11px] text-emerald-300">{ROLE_DESC[user.role].perm}</span>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/15 bg-white/10 p-1.5 sm:flex-none">
              <label htmlFor="role-switcher" className="hidden pl-2 text-xs font-semibold text-slate-200 md:inline">Active Role:</label>
              {demoUsers.length ? (
                <select id="role-switcher" value={user.id} className="w-full min-w-0 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-kbz-navy focus:outline-none focus:ring-2 focus:ring-blue-400 sm:text-sm"
                  onChange={async (e) => { await demoSignIn(e.target.value); navigate('/'); }}>
                  {demoUsers.map((p) => <option key={p.id} value={p.id}>{ROLE_DESC[p.role].option} · {p.name}</option>)}
                </select>
              ) : (
                <span id="role-switcher" className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-kbz-navy sm:text-sm">{ROLE_LABELS[user.role]}</span>
              )}
            </div>
            <div className="flex shrink-0 items-center">
              <button title="Reload data" aria-label="Reload data" className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white"
                onClick={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }}>
                <RefreshCw className={cx('h-4 w-4', refreshing && 'animate-spin')} />
              </button>
              <NavLink to="/" state={{ focus: 'alerts' }} className="relative rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label={`${alertCount} alerts`}>
                <Bell className="h-4 w-4" />
                {alertCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-kbz-red px-1 text-center text-[10px] font-semibold leading-4 text-white">{alertCount}</span>}
              </NavLink>
              {db.mode === 'supabase' && (
                <button onClick={() => setPwOpen(true)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white" title="Change my password" aria-label="Change my password"><KeyRound className="h-4 w-4" /></button>
              )}
              {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
              <button onClick={signOut} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white" title="Sign out" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
        <nav className="border-t border-white/10 bg-kbz-navy" aria-label="Main">
          <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
            <div className="-mx-4 flex gap-1 overflow-x-auto px-4 py-2 sm:mx-0 sm:px-0 lg:justify-between lg:gap-0.5 2xl:gap-1">
              {nav.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'}
                  className={({ isActive }) => cx('flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2.5 text-xs transition-all sm:text-[13px] lg:gap-1 lg:px-2 2xl:flex-1 2xl:gap-1.5 2xl:px-3',
                    isActive ? 'bg-white font-semibold text-kbz-navy shadow-sm' : 'font-medium text-blue-100 hover:bg-white/10 hover:text-white')}>
                  {n.icon}<span className="whitespace-nowrap">{n.label}</span>
                  {!!n.badge && <span className={cx('rounded-full px-1.5 py-0.5 text-[11px] leading-none', badgeCls[n.tone ?? 'count'])}>{n.badge}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        </nav>
      </header>
      <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3">
          {loc.pathname !== '/' && (
            <button className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-2 text-xs font-semibold text-kbz-navy hover:bg-slate-200" aria-label="Back"
              onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))}>
              <ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Back</span>
            </button>
          )}
          <div ref={setBand} className="min-w-0 flex-1" />
        </div>
      </div>
      <PageBandContext.Provider value={band}>
        <main key={loc.pathname} className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </PageBandContext.Provider>
      <footer className="border-t border-slate-200 bg-white px-4 py-3 text-center text-[11px] text-slate-400">
        KBZ Life Insurance Co., Ltd. · Learning &amp; Development Department{db.mode === 'demo' ? ' · Demo mode: data is saved in this browser only' : ''}
      </footer>
    </div>
  );
}

function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useStore();
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Gate() {
  const { user, data, loading, error } = useStore();
  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-slate-500"><FileText className="mb-2 h-6 w-6 animate-pulse text-navy-700" /></div>;
  if (!user || !data) return <LoginPage loadError={error} />;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/approvals" element={<Guard roles={['hod', 'finance']}><ApprovalsPage /></Guard>} />
        <Route path="/deposits" element={<DepositsPage />} />
        <Route path="/deposits/:id" element={<DepositDetail />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/requests" element={<Guard roles={['staff', 'hod', 'admin']}><RequestsPage /></Guard>} />
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="/batches" element={<BatchesPage />} />
        <Route path="/budget" element={<BudgetPage />} />
        <Route path="/reports" element={<Guard roles={['hod', 'finance', 'admin']}><ReportsPage /></Guard>} />
        <Route path="/audit" element={<Guard roles={['hod', 'finance', 'admin']}><AuditPage /></Guard>} />
        <Route path="/users" element={<Guard roles={['admin']}><UsersPage /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <StoreProvider>
          <Gate />
        </StoreProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const { changePassword } = useStore();
  const toast = useToast();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const { busy, error, run } = useSubmit();
  return (
    <Modal open onClose={onClose} title="Change my password" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => {
        if (a !== b) throw new Error('The two passwords do not match.');
        await changePassword(a); toast('Password changed'); onClose();
      })}>Save password</Button>
    </>}>
      <div className="grid gap-3">
        <Field label="New password" required hint="At least 8 characters."><input className="input" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} /></Field>
        <Field label="Repeat new password" required><input className="input" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} /></Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}
