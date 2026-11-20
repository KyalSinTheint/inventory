import { useEffect, useRef, useState } from 'react';
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
 * Type the training name. Existing trainings are suggested as you type; any other name is a new training,
 * added when the form is saved (or with "Add this training"). Program, branch and dates are optional.
 */
export function TrainingPicker({ value, onChange, batches, program, none, required, onDraft }: {
  value: string;
  onChange: (id: string, batch?: Batch) => void;
  /** Trainings to suggest (already filtered by the caller). */
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
  const allowed = can('batch.create');
  const programs = programsOf(data);
  const current = data.batches.find((b) => b.id === value);
  const [text, setText] = useState(current?.name ?? '');
  const [more, setMore] = useState(false);
  const [f, setF] = useState({ program: program ?? '', location: 'YGN' as Location, start_date: today(), end_date: '' });
  const { busy, error, run } = useSubmit();
  // A program is optional: a typed training without one is filed under "Other".
  const prog = program ?? (tidyChoice(f.program, programs) || 'Other');
  const match = (t: string) => batches.find((b) => b.name.trim().toLowerCase() === t.trim().toLowerCase());

  // Follow a value chosen elsewhere (e.g. the form was reset).
  useEffect(() => {
    if (current && current.name !== text) setText(current.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Typing an existing training's name chooses it; a name that now exists (just added on save) is chosen too.
  const matched = match(text);
  useEffect(() => {
    if (matched && matched.id !== value) onChange(matched.id, matched);
    if (!matched && value) onChange('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched?.id]);

  const typedNew = text.trim() !== '' && !matched;
  const draft: TrainingDraft | null = typedNew && allowed ? {
    name: text.trim(), program: prog, location: prog === 'License' ? f.location : null, start_date: f.start_date || today(), end_date: f.end_date,
  } : null;
  const draftKey = JSON.stringify(draft);
  useEffect(() => { onDraft?.(draft); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [draftKey]);

  return (
    <div>
      <input className="input" value={text} required={required} aria-label="Training"
        placeholder={none ?? 'Type the training name…'} onChange={(e) => setText(e.target.value)} />
      {matched && (
        <p className="mt-1 text-xs text-emerald-700">{[matched.program, matched.location, matched.start_date && `${date(matched.start_date)}${matched.end_date ? ` – ${date(matched.end_date)}` : ''}`].filter(Boolean).join(' · ')}</p>
      )}
      {typedNew && (allowed ? (
        <div className="mt-1 text-xs text-slate-500">
          <span>New training · saved with the form.</span>{' '}
          <button type="button" className="font-semibold text-kbz-blue hover:underline" onClick={() => setMore(!more)}>{more ? 'Hide details' : 'Add program / dates (optional)'}</button>
          {more && (
            <div className="mt-2 rounded-2xl bg-sky-50/80 p-3 ring-1 ring-sky-200">
              <div className="flex gap-2">
                {!program && <div className="min-w-0 flex-1"><ComboInput value={f.program} onChange={(v) => setF({ ...f, program: v })} options={programs} placeholder="Program (optional)" label="Program" /></div>}
                {prog === 'License' && (
                  <select className="input min-w-0 flex-1" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value as Location })} aria-label="Branch">
                    {LOCATIONS.map((l) => <option key={l} value={l}>{l} · {LOCATION_LABELS[l]}</option>)}
                  </select>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-500">Start date<input className="input mt-0.5" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></label>
                <label className="text-xs text-slate-500">End date<input className="input mt-0.5" type="date" min={f.start_date} value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></label>
              </div>
              <div className="mt-2 flex justify-end">
                <Button size="sm" type="button" busy={busy} onClick={() => run(async () => {
                  const b = await actions.saveBatch({ ...draft!, budget: 0, status: 'Active' });
                  toast(`Training "${b.name}" added`);
                  setText(b.name);
                  onChange(b.id, b);
                })}><Check className="h-4 w-4" />Add this training</Button>
              </div>
              <ErrorNote error={error} />
            </div>
          )}
        </div>
      ) : <p className="mt-1 text-xs text-amber-700">Choose a training from the list.</p>)}
    </div>
  );
}
