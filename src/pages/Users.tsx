import { useState } from 'react';
import { Copy, KeyRound, Plus, RefreshCw } from 'lucide-react';
import { useData } from '../lib/store';
import { ROLE_LABELS, type Profile, type Role } from '../lib/types';
import { date } from '../lib/format';
import { Badge, Button, ErrorNote, Field, Modal, PageHeader, useSubmit, useToast } from '../components/ui';

export default function UsersPage() {
  const { data, actions, db, user } = useData();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<Profile | null>(null);
  const live = db.mode === 'supabase';
  const { error, run } = useSubmit();
  const rows = [...data.profiles].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  return (
    <>
      <PageHeader title="Users & Roles" subtitle={live ? 'Create a login for each person here. It is saved in Supabase Authentication and works straight away.' : 'Demo users. With Supabase, logins you create here are saved in Supabase Authentication.'}
        actions={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Create user</Button>} />
      <ErrorNote error={error} />
      <div className="table-wrap mt-2">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Since</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.name}{p.id === user.id && <span className="ml-1 text-xs text-slate-500">(you)</span>}</td>
                <td className="text-sm">{p.email}</td>
                <td>
                  <select className="input w-auto py-1" value={p.role} disabled={p.id === user.id} aria-label={`Role for ${p.name}`}
                    onChange={(e) => run(async () => { await actions.updateProfile(p.id, { role: e.target.value as Role }); toast(`${p.name} is now ${ROLE_LABELS[e.target.value as Role]}`); })}>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <Badge tone={p.active ? 'green' : 'grey'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                    {p.id !== user.id && <Button size="sm" variant="ghost" onClick={() => run(async () => { await actions.updateProfile(p.id, { active: !p.active }); toast(`${p.name} ${p.active ? 'deactivated' : 'activated'}`); })}>{p.active ? 'Deactivate' : 'Activate'}</Button>}
                    {live && p.id !== user.id && <Button size="sm" variant="ghost" onClick={() => setResetFor(p)}><KeyRound className="h-4 w-4" />Reset password</Button>}
                  </div>
                </td>
                <td className="whitespace-nowrap text-xs">{date(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding && <AddUser onClose={() => setAdding(false)} />}
      {resetFor && <ResetPassword person={resetFor} onClose={() => setResetFor(null)} />}
    </>
  );
}

/** A readable random password, e.g. "Kbz-7hq4-m2xw". */
function makePassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const pick = (n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => abc[v % abc.length]).join('');
  return `Kbz-${pick(4)}-${pick(4)}`;
}

/** Shows the sign-in details once so the administrator can pass them on. */
function Credentials({ email, password }: { email: string; password: string }) {
  const toast = useToast();
  const text = `L&D Portal sign-in\nLink: ${location.origin}\nEmail: ${email}\nPassword: ${password}`;
  return (
    <div className="rounded-2xl bg-emerald-50 p-4 text-sm ring-1 ring-emerald-200">
      <p className="font-semibold text-emerald-800">Ready. Give these sign-in details to the person:</p>
      <dl className="mt-2 grid grid-cols-[5rem_1fr] gap-y-1 text-slate-700">
        <dt className="text-slate-500">Link</dt><dd className="break-all">{location.origin}</dd>
        <dt className="text-slate-500">Email</dt><dd className="break-all font-medium">{email}</dd>
        <dt className="text-slate-500">Password</dt><dd className="font-mono font-semibold">{password}</dd>
      </dl>
      <Button size="sm" variant="secondary" className="mt-3" onClick={() => void navigator.clipboard?.writeText(text).then(() => toast('Copied'))}><Copy className="h-4 w-4" />Copy details</Button>
      <p className="mt-2 text-xs text-slate-500">They can change the password after signing in (key icon at the top).</p>
    </div>
  );
}

function AddUser({ onClose }: { onClose: () => void }) {
  const { actions, db } = useData();
  const toast = useToast();
  const live = db.mode === 'supabase';
  const [f, setF] = useState({ name: '', email: '', role: 'staff' as Role, password: makePassword() });
  const [done, setDone] = useState(false);
  const { busy, error, run } = useSubmit();
  return (
    <Modal open onClose={onClose} title={done ? 'User created' : 'Create user'} footer={done ? <Button onClick={onClose}>Done</Button> : <>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { await actions.createUser(f.name, f.email, f.role, f.password); toast(`${f.name} can now sign in`); if (live) setDone(true); else onClose(); })}>Create user</Button>
    </>}>
      {done ? <Credentials email={f.email.trim().toLowerCase()} password={f.password} /> : (
        <div className="grid gap-3">
          <Field label="Name" required><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email (used to sign in)" required><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Role"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          {live && (
            <Field label="Password" required hint="At least 8 characters. A random one is filled in; you can type your own.">
              <div className="flex gap-2">
                <input className="input min-w-0 flex-1 font-mono" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="off" />
                <Button variant="secondary" type="button" onClick={() => setF({ ...f, password: makePassword() })} aria-label="New random password"><RefreshCw className="h-4 w-4" /></Button>
              </div>
            </Field>
          )}
        </div>
      )}
      <ErrorNote error={error} />
    </Modal>
  );
}

function ResetPassword({ person, onClose }: { person: Profile; onClose: () => void }) {
  const { actions } = useData();
  const [password, setPassword] = useState(makePassword());
  const [done, setDone] = useState(false);
  const { busy, error, run } = useSubmit();
  return (
    <Modal open onClose={onClose} title={`Reset password · ${person.name}`} footer={done ? <Button onClick={onClose}>Done</Button> : <>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { await actions.resetPassword(person.id, password); setDone(true); })}>Set new password</Button>
    </>}>
      {done ? <Credentials email={person.email} password={password} /> : (
        <Field label="New password" required hint="At least 8 characters.">
          <div className="flex gap-2">
            <input className="input min-w-0 flex-1 font-mono" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
            <Button variant="secondary" type="button" onClick={() => setPassword(makePassword())} aria-label="New random password"><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </Field>
      )}
      <ErrorNote error={error} />
    </Modal>
  );
}
