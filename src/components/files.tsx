import { useEffect, useState } from 'react';
import { FileUp, ImageOff, Paperclip, X } from 'lucide-react';
import { useStore } from '../lib/store';
import type { Attachment } from '../lib/types';
import { cx } from './ui';

const urlCache = new Map<string, { url: string; at: number }>();

/** Resolves an attachment to a viewable URL (signed URL in Supabase, data URL in demo), cached for 4 minutes. */
export function useFileUrl(att: Attachment | null | undefined) {
  const { db } = useStore();
  const [url, setUrl] = useState<string | null>(() => (att?.url.startsWith('data:') ? att.url : null));
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    setError(false);
    if (!att) { setUrl(null); return; }
    if (att.url.startsWith('data:')) { setUrl(att.url); return; }
    const hit = urlCache.get(att.url);
    if (hit && Date.now() - hit.at < 240_000) { setUrl(hit.url); return; }
    db.openFile(att).then((u) => { urlCache.set(att.url, { url: u, at: Date.now() }); if (live) setUrl(u); }).catch(() => live && setError(true));
    return () => { live = false; };
  }, [att, db]);
  return { url, error };
}

function openDataUrl(url: string, name: string) {
  // Browsers block navigating to data: URLs, so open them as a blob instead.
  const [head, b64] = url.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const opened = window.open(blobUrl, '_blank', 'noopener');
  if (!opened) {
    const a = document.createElement('a');
    a.href = blobUrl; a.download = name; a.click();
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

/** A link that opens an attachment in a new tab. */
export function FileLink({ att, className }: { att: Attachment; className?: string }) {
  const { db } = useStore();
  const [err, setErr] = useState<string | null>(null);
  const open = async () => {
    setErr(null);
    try {
      const url = await db.openFile(att);
      if (url.startsWith('data:')) openDataUrl(url, att.name);
      else window.open(url, '_blank', 'noopener');
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1', className)}>
      <button type="button" onClick={(e) => { e.stopPropagation(); void open(); }} className="inline-flex min-w-0 items-center gap-1 text-navy-700 hover:underline" title={att.name}>
        <Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{att.name}</span>
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  );
}

/** Square photo thumbnail with a placeholder when there is no photo. */
export function Thumb({ att, size = 40, alt }: { att: Attachment | null | undefined; size?: number; alt: string }) {
  const { url, error } = useFileUrl(att);
  return (
    <div className="grid shrink-0 place-items-center overflow-hidden rounded-lg border border-silver-200 bg-silver-100" style={{ width: size, height: size }}>
      {url && !error ? <img src={url} alt={alt} className="h-full w-full object-cover" loading="lazy" /> : <ImageOff className="h-1/2 w-1/2 text-silver-300" aria-hidden />}
    </div>
  );
}

/** File chooser that keeps a list of chosen files (single or multiple). */
export function FilePicker({ files, onChange, multiple, accept, label = 'Choose file…' }: {
  files: File[]; onChange: (f: File[]) => void; multiple?: boolean; accept?: string; label?: string;
}) {
  return (
    <div className="space-y-1.5">
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg bg-silver-100 px-2.5 py-1.5 text-sm">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <span className="text-xs text-slate-500">{Math.max(1, Math.round(f.size / 1024))} KB</span>
          <button type="button" className="rounded p-0.5 text-slate-500 hover:bg-silver-200" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
        </div>
      ))}
      {(multiple || files.length === 0) && (
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-silver-300 px-3 py-2.5 text-sm text-slate-600 hover:border-navy-600">
          <FileUp className="h-4 w-4" /><span>{files.length && multiple ? 'Add another file…' : label}</span>
          <input type="file" accept={accept} multiple={multiple} className="sr-only"
            onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.target.value = ''; onChange(multiple ? [...files, ...picked] : picked.slice(0, 1)); }} />
        </label>
      )}
    </div>
  );
}
