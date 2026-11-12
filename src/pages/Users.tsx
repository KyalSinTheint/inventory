import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useData } from '../lib/store';
import { ROLE_LABELS, type Role } from '../lib/types';
import { date } from '../lib/format';
import { Badge, Button, ErrorNote, Field, Modal, PageHeader, useSubmit, useToast } from '../components/ui';

export default function UsersPage() {
  const { data, actions, db, user } = useData();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const { error, run } = useSubmit();
  const rows = [...data.profiles].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  return (
    <>
      <PageHeader title="Users & Roles" subtitle={db.mode === 'demo' ? 'Demo users. In production people sign up and you then activate them and assign a role.' : 'New sign-ups start inactive as L&D Staff. Activate them and assign the right role.'}
        actions={db.mode === 'demo' && <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add user</Button>} />
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
                  </div>
                </td>
                <td className="whitespace-nowrap text-xs">{date(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding && <AddUser onClose={() => setAdding(false)} />}
    </>
  );
}

function AddUser({ onClose }: { onClose: () => void }) {
  const { actions } = useData();
  const [f, setF] = useState({ name: '', email: '', role: 'staff' as Role });
  const { busy, error, run } = useSubmit();
  return (
    <Modal open onClose={onClose} title="Add demo user" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={() => run(async () => { await actions.addDemoUser(f.name, f.email, f.role); onClose(); })}>Add</Button>
    </>}>
      <div className="grid gap-3">
        <Field label="Name" required><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email" required><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Role"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}
