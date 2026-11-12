import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useStore } from '../lib/store';
import { buildSeed } from '../lib/seed';
import { ROLE_LABELS } from '../lib/types';
import { Button, ErrorNote, Field, useSubmit } from '../components/ui';

export default function LoginPage({ loadError }: { loadError: string | null }) {
  const { db, signIn, signUp, demoSignIn, user } = useStore();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, run } = useSubmit();
  const demoUsers = db.mode === 'demo' ? (() => {
    try { return JSON.parse(localStorage.getItem('ld-portal-data-v1') ?? 'null')?.profiles ?? buildSeed().profiles; } catch { return buildSeed().profiles; }
  })().filter((p: { active: boolean }) => p.active) : [];

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-silver-200 to-white text-lg font-bold text-navy-900 shadow-lg">L&D</div>
          <h1 className="text-xl font-semibold">Training Resource, Inventory & License Deposit Portal</h1>
          <p className="mt-1 text-sm text-silver-300">KBZ Life Insurance · Learning & Development</p>
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
                    className="flex items-center justify-between rounded-lg border border-silver-200 px-3 py-2.5 text-left hover:border-navy-600 hover:bg-navy-50">
                    <span><span className="block text-sm font-medium text-navy-900">{p.name}</span><span className="text-xs text-slate-500">{p.email}</span></span>
                    <span className="rounded-full bg-navy-100 px-2 py-0.5 text-xs font-medium text-navy-800">{ROLE_LABELS[p.role]}</span>
                  </button>
                ))}
              </div>
              <ErrorNote error={error} />
            </>
          ) : done ? (
            <div className="text-sm text-slate-600">
              <ShieldCheck className="mb-2 h-6 w-6 text-emerald-600" />
              {done}
              <Button variant="secondary" className="mt-4 w-full" onClick={() => { setDone(null); setMode('in'); }}>Back to sign in</Button>
            </div>
          ) : (
            <form onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (mode === 'in') await signIn(email, password);
                else {
                  await signUp(name, email, password);
                  setDone('Account created. Confirm your email if asked, then a System Administrator must activate your account and assign your role before you can use the portal.');
                }
              });
            }} className="space-y-3">
              <h2 className="font-semibold text-navy-900">{mode === 'in' ? 'Sign in' : 'Create an account'}</h2>
              {mode === 'up' && <Field label="Full name" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>}
              <Field label="Work email" required><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
              <Field label="Password" required><input className="input" type="password" minLength={8} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
              <ErrorNote error={error} />
              <Button type="submit" className="w-full" busy={busy}>{mode === 'in' ? 'Sign in' : 'Create account'}</Button>
              <button type="button" className="w-full text-center text-sm text-navy-700 hover:underline" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
                {mode === 'in' ? 'New to the portal? Create an account' : 'Already have an account? Sign in'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
