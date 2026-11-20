import { useId } from 'react';

/** A text box with suggestions: pick one from the list that appears, or type a new value. */
export function ComboInput({ value, onChange, options, placeholder, label, className }: {
  value: string; onChange: (v: string) => void; options: readonly string[]; placeholder?: string; label?: string; className?: string;
}) {
  const id = useId();
  return (
    <>
      <input className={className ?? 'input'} list={id} value={value} placeholder={placeholder ?? 'Type or choose…'} aria-label={label}
        onChange={(e) => onChange(e.target.value)} />
      <datalist id={id}>{options.map((o) => <option key={o} value={o} />)}</datalist>
    </>
  );
}
