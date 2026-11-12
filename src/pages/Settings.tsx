import { useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import { useData } from '../lib/store';
import { downloadJson } from '../lib/export';
import { dateTime } from '../lib/format';
import { Button, Card, ErrorNote, Field, PageHeader, useSubmit, useToast } from '../components/ui';

export default function SettingsPage() {
  const { data, settings, actions, db, refresh, user } = useData();
  const toast = useToast();
  const [f, setF] = useState({ retention_alert_months: String(settings.retention_alert_months), service_term_months: String(settings.service_term_months) });
  const { busy, error, run } = useSubmit();
  return (
    <>
      <PageHeader title="Settings" subtitle="Business rules, backup and system configuration" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Deposit retention rules">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Warn staff from month" hint="e.g. 11 = warn in the 11th month after payment"><input className="input" type="number" min="1" value={f.retention_alert_months} onChange={(e) => setF({ ...f, retention_alert_months: e.target.value })} /></Field>
            <Field label="Service term (months)" hint="Deposit term before forfeiture applies"><input className="input" type="number" min="2" value={f.service_term_months} onChange={(e) => setF({ ...f, service_term_months: e.target.value })} /></Field>
          </div>
          <ErrorNote error={error} />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">Last changed {dateTime(settings.updated_at || null)}</span>
            <Button busy={busy} onClick={() => run(async () => { await actions.saveSettings({ retention_alert_months: Number(f.retention_alert_months), service_term_months: Number(f.service_term_months) }); toast('Settings saved'); })}>Save</Button>
          </div>
        </Card>
        <Card title="Backup">
          <p className="text-sm text-slate-600">
            {db.mode === 'supabase'
              ? 'Supabase takes automatic daily database backups (Project Settings → Database → Backups). You can also download a full JSON snapshot here at any time.'
              : 'Demo data lives in this browser. Download a JSON snapshot to keep a copy.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={async () => { downloadJson(`ld-portal-backup_${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`, data); await actions.audit('Backup download', 'system', null, 'Full JSON snapshot'); }}><Download className="h-4 w-4" />Download snapshot</Button>
            {db.mode === 'demo' && <Button variant="danger" onClick={async () => { if (confirm('Reset all demo data to the original sample?')) { db.resetDemo?.(); db.demoSignIn?.(user.id); await refresh(); toast('Demo data reset'); } }}><RotateCcw className="h-4 w-4" />Reset demo data</Button>}
          </div>
        </Card>
      </div>
    </>
  );
}
