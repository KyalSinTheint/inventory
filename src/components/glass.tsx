import type { CSSProperties, ReactNode } from 'react';
import { cx } from './ui';

/** Soft KBZ-blue light placed behind glass cards so the frosted effect is visible. */
export function GlassBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cx('pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[2rem]', className)}>
      {/* repeated down the area so long lists stay on coloured light */}
      <div className="absolute -left-10 top-0 h-72 w-72 rounded-full bg-[#20a0d8]/55 blur-3xl" />
      <div className="absolute right-0 top-[12%] h-80 w-80 rounded-full bg-kbz-navy/40 blur-3xl" />
      <div className="absolute left-1/3 top-[30%] h-72 w-72 rounded-full bg-[#0f7c80]/35 blur-3xl" />
      <div className="absolute -left-10 top-[48%] h-80 w-80 rounded-full bg-kbz-navy/30 blur-3xl" />
      <div className="absolute right-1/4 top-[60%] h-72 w-72 rounded-full bg-[#8fd3f2]/60 blur-3xl" />
      <div className="absolute left-1/4 top-[78%] h-72 w-72 rounded-full bg-[#20a0d8]/45 blur-3xl" />
      <div className="absolute -bottom-10 right-0 h-72 w-72 rounded-full bg-kbz-navy/35 blur-3xl" />
    </div>
  );
}

/** Wrapper that puts glass cards on top of the backdrop. */
export function GlassArea({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="relative isolate">
      <GlassBackdrop />
      <div className={cx('p-1', className)}>{children}</div>
    </div>
  );
}

/** Classes for a frosted-glass surface. */
export const glass = 'border border-white/70 bg-white/50 backdrop-blur-xl shadow-[0_10px_30px_-12px_rgba(0,45,114,0.28),inset_0_1px_0_rgba(255,255,255,0.9)]';

/** CSS mask that cuts half-circle notches into two corners (ticket stub). */
export function notchMask(edge: 'top' | 'bottom', r = 14): CSSProperties {
  const y = edge === 'bottom' ? '100%' : '0';
  const m = `radial-gradient(circle at 0 ${y}, transparent ${r}px, #000 ${r + 0.5}px) left / 50.5% 100% no-repeat,`
    + ` radial-gradient(circle at 100% ${y}, transparent ${r}px, #000 ${r + 0.5}px) right / 50.5% 100% no-repeat`;
  return { WebkitMask: m, mask: m };
}
