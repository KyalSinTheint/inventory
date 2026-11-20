import { CATEGORIES, PROGRAMS, type DataSet } from './types';

const uniq = (base: readonly string[], more: (string | null | undefined)[]) => {
  const seen = new Set(base.map((x) => x.toLowerCase()));
  const extra = [...new Set(more.map((x) => x?.trim()).filter((x): x is string => !!x && !seen.has(x.toLowerCase())))].sort((a, b) => a.localeCompare(b));
  return [...base, ...extra];
};

/** Standard inventory categories plus any typed for items, main items or assets. */
export const categoriesOf = (d: Pick<DataSet, 'items' | 'item_groups' | 'assets'>) =>
  uniq(CATEGORIES, [...d.items.map((i) => i.category), ...d.item_groups.map((g) => g.category), ...d.assets.map((a) => a.category)]);

/** Standard training programs plus any typed for trainings. */
export const programsOf = (d: Pick<DataSet, 'batches'>) => uniq(PROGRAMS, d.batches.map((b) => b.program));

/** Use the standard spelling when a typed value matches one ignoring case ("refreshments" → "Refreshments"). */
export const tidyChoice = (value: string, options: readonly string[]) => {
  const v = value.trim().replace(/\s+/g, ' ');
  return options.find((o) => o.toLowerCase() === v.toLowerCase()) ?? v;
};
