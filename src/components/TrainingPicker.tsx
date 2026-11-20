import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useData } from '../lib/store';
import { LOCATIONS, LOCATION_LABELS, PROGRAMS, type Batch, type Location, type Program } from '../lib/types';
import { today } from '../lib/format';
import { Button, ErrorNote, useSubmit, useToast } from './ui';

const NEW = '__new__';

/**
 * Choose a training, or type a new training name right here ("+ New training…").
 * The new training is saved (with its program, branch and dates) and selected.
 */
export function TrainingPicker({ value, onChange, batches, program, none, required }: {
  value: string;
  onChange: (id: string, batch?: Batch) => void;
  /** Trainings to offer (already filtered by the caller). */
  batches: Batch[];
  /** Lock new trainings to one program, e.g. 'License' for deposits. */
  program?: Program;
  /** Label of an empty choice, e.g. "No training"; omit when a training is required. */
  none?: string;
  required?: boolean;
}) {
  const { actions, can } = useData();
  const toast = useToast();
  const allowed = can('batch.create');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', program: program ?? ('Product & Soft Skills' as Program), location: 'YGN' as Location, start_date: today(), end_date: '' });
  const { busy, error, run } = useSubmit();
  const prog = program ?? f.program;
  const list = [...batches].sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''));

  return (
    <div>
      <select className="input" value={adding ? NEW : value} required={required} aria-label="Training"
        onChange={(e) => {
          if (e.target.value === NEW) { setAdding(true); return; }
          setAdding(false);
          onChange(e.target.value, batches.find((b) => b.id === e.target.value));
        }}>
        {(none !== undefined || !value) && <option value="">{none ?? 'Choose training…'}</option>}
        {list.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        {allowed && <option value={NEW}>+ New training (type a name)…</option>}
      </select>
      {adding && (
        <div className="mt-2 rounded-2xl bg-sky-50/80 p-3 ring-1 ring-sky-200">
          <input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="Training name, e.g. Sales Skills Workshop (Dec)" aria-label="New training name" />
          {(!program || prog === 'License') && (
            <div className="mt-2 flex gap-2">
              {!program && (
                <select className="input min-w-0 flex-1" value={f.program} onChange={(e) => setF({ ...f, program: e.target.value as Program })} aria-label="Program">
                  {PROGRAMS.map((p) => <option key={p}>{p}</option>)}
                </select>
              )}
              {prog === 'License' && (
                <select className="input min-w-0 flex-1" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value as Location })} aria-label="Branch">
                  {LOCATIONS.map((l) => <option key={l} value={l}>{l} · {LOCATION_LABELS[l]}</option>)}
                </select>
              )}
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">Start date<input className="input mt-0.5" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></label>
            <label className="text-xs text-slate-500">End date<input className="input mt-0.5" type="date" min={f.start_date} value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></label>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" type="button" onClick={() => { setAdding(false); setF({ ...f, name: '' }); }}><X className="h-4 w-4" />Cancel</Button>
            <Button size="sm" type="button" busy={busy} onClick={() => run(async () => {
              const b = await actions.saveBatch({
                name: f.name, program: prog, location: prog === 'License' ? f.location : null,
                start_date: f.start_date || today(), end_date: f.end_date, budget: 0, status: 'Active',
              });
              toast(`Training "${b.name}" added`);
              setAdding(false); setF({ ...f, name: '' });
              onChange(b.id, b);
            })}><Check className="h-4 w-4" />Add training</Button>
          </div>
          <ErrorNote error={error} />
        </div>
      )}
    </div>
  );
}
