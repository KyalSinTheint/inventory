import { useEffect, useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useData } from '../lib/store';
import { LOCATIONS, LOCATION_LABELS, type Batch, type Location, type Program } from '../lib/types';
import { date, today } from '../lib/format';
import { Button, ErrorNote, useSubmit, useToast } from './ui';
import { programsOf, tidyChoice } from '../lib/choices';
import { ComboInput } from './ComboInput';

/** A training typed in the picker but not added yet; the form adds it when it is saved (see useTrainingDraft). */
export type TrainingDraft = Pick<Batch, 'name' | 'program' | 'location' | 'start_date' | 'end_date'>;

/**
 * Keeps the picker's not-yet-added training, and on save returns the training id to use:
 * the chosen one, or the typed one, which is added first.
 */
export function useTrainingDraft() {
  const { actions } = useData();
  const draft = useRef<TrainingDraft | null>(null);
  return {
    onDraft: (d: TrainingDraft | null) => { draft.current = d; },
    resolve: async (id: string): Promise<string> => {
      if (id || !draft.current) return id;
      const b = await actions.saveBatch({ ...draft.current, budget: 0, status: 'Active' });
      draft.current = null;
      return b.id;
    },
  };
}

/**
 * Type a training name, or pick one of the existing trainings from the list that appears as you type.
 * A name that is not in the list can be added on the spot (program, branch and dates), then it is selected.
 */
export function TrainingPicker({ value, onChange, batches, program, none, required, onDraft }: {
  value: string;
  onChange: (id: string, batch?: Batch) => void;
  /** Trainings to offer (already filtered by the caller). */
  batches: Batch[];
  /** Lock new trainings to one program, e.g. 'License' for deposits. */
  program?: Program;
  /** Placeholder when no training is chosen, e.g. "No training"; when set, leaving it empty is allowed. */
  none?: string;
  required?: boolean;
  /** Told about a new training name typed but not added yet, so saving the form can add it. */
  onDraft?: (d: TrainingDraft | null) => void;
}) {
  const { data, actions, can } = useData();
  const toast = useToast();
  const listId = useId();
  const allowed = can('batch.create');
  const nameOf = (id: string) => data.batches.find((b) => b.id === id)?.name ?? '';
  const [text, setText] = useState(() => nameOf(value));
  const [f, setF] = useState({ program: program ?? ('Product & Soft Skills' as Program), location: 'YGN' as Location, start_date: today(), end_date: '' });
  const { busy, error, run } = useSubmit();
  const prog = program ?? tidyChoice(f.program, programsOf(data));
  const list = [...batches].sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''));
  const match = (t: string) => batches.find((b) => b.name.trim().toLowerCase() === t.trim().toLowerCase());

  // Follow a value chosen elsewhere (e.g. the form was reset).
  useEffect(() => {
    if (value && nameOf(value) && nameOf(value) !== text) setText(nameOf(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // A typed name that now exists (e.g. it was just added on save) becomes the chosen training.
  const matched = match(text);
  useEffect(() => {
    if (matched && matched.id !== value) onChange(matched.id, matched);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched?.id]);
  const typedNew = text.trim() !== '' && !matched;
  const sameNameElsewhere = typedNew && data.batches.some((b) => b.name.trim().toLowerCase() === text.trim().toLowerCase());
  const canAdd = typedNew && !sameNameElsewhere && allowed;
  const draftKey = canAdd ? JSON.stringify([text.trim(), prog, f.location, f.start_date, f.end_date]) : '';
  useEffect(() => {
    onDraft?.(canAdd ? { name: text.trim(), program: prog, location: prog === 'License' ? f.location : null, start_date: f.start_date || today(), end_date: f.end_date } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  return (
    <div>
      <input className="input" list={listId} value={text} required={required} aria-label="Training"
        placeholder={none ?? 'Type or choose a training…'}
        onChange={(e) => {
          setText(e.target.value);
          const m = match(e.target.value);
          onChange(m?.id ?? '', m);
        }} />
      <datalist id={listId}>
        {list.map((b) => <option key={b.id} value={b.name}>{[b.program, b.location, b.start_date && date(b.start_date)].filter(Boolean).join(' · ')}</option>)}
      </datalist>
      {value && !typedNew && (() => { const b = data.batches.find((x) => x.id === value); return b ? (
        <p className="mt-1 text-xs text-emerald-700">{[b.program, b.location, b.start_date && `${date(b.start_date)}${b.end_date ? ` – ${date(b.end_date)}` : ''}`].filter(Boolean).join(' · ')}</p>
      ) : null; })()}
      {typedNew && (sameNameElsewhere ? (
        <p className="mt-1 text-xs text-amber-700">“{text.trim()}” exists but cannot be used here (completed, or another program).</p>
      ) : allowed ? (
        <div className="mt-2 rounded-2xl bg-sky-50/80 p-3 ring-1 ring-sky-200">
          <p className="text-xs font-semibold text-kbz-navy">New training: “{text.trim()}”</p>
          <p className="text-[11px] text-slate-500">It is added when you save the form, or add it now.</p>
          {(!program || prog === 'License') && (
            <div className="mt-2 flex gap-2">
              {!program && (
                <div className="min-w-0 flex-1"><ComboInput value={f.program} onChange={(v) => setF({ ...f, program: v })} options={programsOf(data)} placeholder="Program (type or choose)" label="Program" /></div>
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
          <div className="mt-2 flex justify-end">
            <Button size="sm" type="button" busy={busy} onClick={() => run(async () => {
              const b = await actions.saveBatch({
                name: text, program: prog, location: prog === 'License' ? f.location : null,
                start_date: f.start_date || today(), end_date: f.end_date, budget: 0, status: 'Active',
              });
              toast(`Training "${b.name}" added`);
              setText(b.name);
              onChange(b.id, b);
            })}><Check className="h-4 w-4" />Add this training</Button>
          </div>
          <ErrorNote error={error} />
        </div>
      ) : <p className="mt-1 text-xs text-amber-700">Choose a training from the list.</p>)}
    </div>
  );
}
