import { useMemo, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  BarChart3, Bell, Boxes, CheckSquare, ClipboardList, FileText, GraduationCap, LayoutDashboard, LogOut, Menu, PiggyBank,
  RefreshCw, ScrollText, Settings as SettingsIcon, Users, Wallet, Wrench, X,
} from 'lucide-react';
import { StoreProvider, useStore } from './lib/store';
import { approvalCounts, lowStockItems, retentionAlerts } from './lib/alerts';
import { ROLE_LABELS, type Role } from './lib/types';
import { ToastProvider, cx } from './components/ui';
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
import SettingsPage from './pages/Settings';

interface NavItem { to: string; label: string; icon: ReactNode; roles?: Role[]; badge?: number }

function Shell({ children }: { children: ReactNode }) {
  const { user, data, settings, signOut, refresh, db } = useStore();
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loc = useLocation();
  const counts = useMemo(() => (data && user ? approvalCounts(data, user) : null), [data, user]);
  const alertCount = useMemo(
    () => (data ? lowStockItems(data).length + retentionAlerts(data, settings, today()).length : 0),
    [data, settings],
  );
  if (!user || !data) return null;

  const allNav: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: '/approvals', label: 'Approvals', icon: <CheckSquare className="h-4 w-4" />, roles: ['hod', 'finance'], badge: counts?.total },
    { to: '/deposits', label: 'License Deposits', icon: <Wallet className="h-4 w-4" /> },
    { to: '/inventory', label: 'Inventory', icon: <Boxes className="h-4 w-4" /> },
    { to: '/requests', label: 'Material Requests', icon: <ClipboardList className="h-4 w-4" />, roles: ['staff', 'hod', 'admin'] },
    { to: '/assets', label: 'Assets', icon: <Wrench className="h-4 w-4" /> },
    { to: '/batches', label: 'Training Batches', icon: <GraduationCap className="h-4 w-4" /> },
    { to: '/budget', label: 'Budget & Expenses', icon: <PiggyBank className="h-4 w-4" /> },
    { to: '/reports', label: 'Reports', icon: <BarChart3 className="h-4 w-4" />, roles: ['hod', 'finance', 'admin'] },
    { to: '/audit', label: 'Audit Log', icon: <ScrollText className="h-4 w-4" />, roles: ['hod', 'finance', 'admin'] },
    { to: '/users', label: 'Users & Roles', icon: <Users className="h-4 w-4" />, roles: ['admin'] },
    { to: '/settings', label: 'Settings', icon: <SettingsIcon className="h-4 w-4" />, roles: ['admin'] },
  ];
  const nav = allNav.filter((n) => !n.roles || n.roles.includes(user.role));

  const navList = (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="Main">
      {nav.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setOpen(false)}
          className={({ isActive }) => cx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
            isActive ? 'bg-white/12 text-white' : 'text-navy-100/80 hover:bg-white/6 hover:text-white')}>
          {n.icon}<span className="flex-1">{n.label}</span>
          {!!n.badge && <span className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-navy-950">{n.badge}</span>}
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2.5 px-5 py-4">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-silver-200 to-white text-sm font-bold text-navy-900">L&D</div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-white">KBZ Life L&D</div>
        <div className="text-xs text-silver-300">Resource & Deposit Portal</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy-900 lg:flex">
        {brand}
        <div className="flex-1 overflow-y-auto">{navList}</div>
        <div className="border-t border-white/10 p-4 text-xs text-silver-300">
          {db.mode === 'demo' ? 'Demo mode: data is saved in this browser only.' : 'Connected to Supabase'}
        </div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-navy-950/50" />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-navy-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pr-3">{brand}<button className="p-2 text-white" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button></div>
            <div className="flex-1 overflow-y-auto">{navList}</div>
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-silver-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:px-6">
        <button className="rounded-md p-1.5 text-navy-900 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        <div className="flex-1 truncate text-sm text-slate-500">{db.mode === 'demo' && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">DEMO</span>}</div>
        <button title="Reload data" aria-label="Reload data" className="rounded-md p-2 text-slate-500 hover:bg-silver-100"
          onClick={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }}>
          <RefreshCw className={cx('h-4 w-4', refreshing && 'animate-spin')} />
        </button>
        <NavLink to="/" state={{ focus: 'alerts' }} className="relative rounded-md p-2 text-slate-500 hover:bg-silver-100" aria-label={`${alertCount} alerts`}>
          <Bell className="h-4 w-4" />
          {alertCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">{alertCount}</span>}
        </NavLink>
        <div className="ml-1 hidden text-right leading-tight sm:block">
          <div className="text-sm font-medium text-navy-900">{user.name}</div>
          <div className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</div>
        </div>
        <button onClick={signOut} className="rounded-md p-2 text-slate-500 hover:bg-silver-100" title="Sign out" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
      </header>
      <main key={loc.pathname} className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
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
        <Route path="/settings" element={<Guard roles={['admin']}><SettingsPage /></Guard>} />
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
