import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useStore } from '../lib/store';
import { buildSeed } from '../lib/seed';
import { STORE_KEY } from '../lib/db';
import { ROLE_LABELS } from '../lib/types';
import { Button, ErrorNote, Field, useSubmit } from '../components/ui';

export default function LoginPage({ loadError }: { loadError: string | null }) {
  const { db, signIn, setupFirstAdmin, demoSignIn, user } = useStore();
  // Accounts are made by the System Administrator; the very first visit sets up that administrator.
  const [setup, setSetup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const { busy, error, run } = useSubmit();
  useEffect(() => {
    if (db.mode === 'supabase') db.needsSetup().then(setSetup).catch(() => setSetup(false));
  }, [db]);
  const demoUsers = db.mode === 'demo' ? (() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null')?.profiles ?? buildSeed().profiles; } catch { return buildSeed().profiles; }
  })().filter((p: { active: boolean }) => p.active) : [];

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-kbz-dark via-kbz-navy to-kbz-blue px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 inline-flex rounded-2xl bg-white px-4 py-2.5 shadow-lg"><img src="/kbz-life-logo.png" alt="KBZ Life Insurance" className="h-16 w-auto" /></div>
          <br />
          <div className="mb-2 inline-block rounded bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-200">L&amp;D Portal</div>
          <h1 className="text-xl font-semibold">Training Resource, Inventory & License Deposit Portal</h1>
          <p className="mt-1 text-sm text-slate-300">KBZ Life Insurance · Learning & Development</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          {user && !user.active && <ErrorNote error="Your account is not active. New accounts must be activated by the System Administrator, who also assigns your role." />}
          {loadError && <ErrorNote error={`Could not load data: ${loadError}`} />}
          {db.mode === 'demo' ? (
            <>
              <h2 className="font-semibold text-navy-900">Choose a demo user</h2>
              <p className="mt-1 text-sm text-slate-500">Demo mode keeps data in this browser. Each role sees and can do different things.</p>
              <div className="mt-4 grid gap-2">
                {demoUsers.map((p: { id: string; name: string; role: keyof typeof ROLE_LABELS; email: string }) => (
                  <button key={p.id} onClick={() => run(() => demoSignIn(p.id))}
                    className="flex items-center justify-between rounded-xl border-2 border-slate-200 px-3 py-2.5 text-left transition hover:border-kbz-navy hover:bg-navy-50">
                    <span><span className="block text-sm font-medium text-navy-900">{p.name}</span><span className="text-xs text-slate-500">{p.email}</span></span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-kbz-navy">{ROLE_LABELS[p.role]}</span>
                  </button>
                ))}
              </div>
              <ErrorNote error={error} />
            </>
          ) : (
            <form onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (!setup) return signIn(email, password);
                if (password !== password2) throw new Error('The two passwords do not match.');
                await setupFirstAdmin(name, email, password);
              });
            }} className="space-y-3">
              {setup ? (
                <>
                  <h2 className="font-semibold text-navy-900">Set up the System Administrator</h2>
                  <p className="text-sm text-slate-500">First-time setup. This account manages the portal and creates the logins for L&amp;D staff, HOD and Finance.</p>
                  <Field label="Full name" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
                </>
              ) : <h2 className="font-semibold text-navy-900">Sign in</h2>}
              <Field label="Work email" required><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
              <Field label="Password" required hint={setup ? 'At least 8 characters' : undefined}><input className="input" type="password" minLength={setup ? 8 : undefined} autoComplete={setup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
              {setup && <Field label="Repeat password" required><input className="input" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required /></Field>}
              <ErrorNote error={error} />
              <Button type="submit" className="w-full" busy={busy}>{setup ? 'Create administrator and sign in' : 'Sign in'}</Button>
              {!setup && <p className="flex items-start gap-2 text-xs text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />No account yet? Ask the System Administrator to create one for you.</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
