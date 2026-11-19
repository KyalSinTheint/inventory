// Soft, glassy pastel illustrations for the dashboard cards (pure SVG, no image files).
import { useId } from 'react';

const RAINBOW = ['#ff6fae', '#ff9f6b', '#ffd36e', '#8fd3ff', '#9b8cff'];

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-rb`} x1="0" y1="0" x2="1" y2="1">
        {RAINBOW.map((c, i) => <stop key={c} offset={i / (RAINBOW.length - 1)} stopColor={c} />)}
      </linearGradient>
      <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0.35" />
      </linearGradient>
      <radialGradient id={`${id}-orb`} cx="0.35" cy="0.3" r="0.75">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.35" stopColor="#ffd6ec" />
        <stop offset="0.7" stopColor="#b9c8ff" />
        <stop offset="1" stopColor="#ffc6a8" />
      </radialGradient>
      <radialGradient id={`${id}-orbg`} cx="0.35" cy="0.3" r="0.75">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.4" stopColor="#e9ffd0" />
        <stop offset="0.8" stopColor="#9fe3b4" />
        <stop offset="1" stopColor="#ffe38a" />
      </radialGradient>
      <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14" /></filter>
      <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5" /></filter>
    </defs>
  );
}

const Svg = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <svg viewBox="0 0 220 200" className="h-full w-full" role="img" aria-label={label}>{children}</svg>
);

/** 01 Deposits: a fan of stacked glass panes. */
export function PanesArt() {
  const id = useId().replace(/:/g, '');
  return (
    <Svg label="">
      <Defs id={id} />
      <ellipse cx="140" cy="120" rx="70" ry="50" fill={`url(#${id}-rb)`} opacity="0.35" filter={`url(#${id}-blur)`} />
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i} transform={`translate(${64 + i * 12} ${118 - i * 10}) skewY(-28)`}>
          <rect width="58" height="78" rx="6" fill={`url(#${id}-rb)`} opacity={0.35 + i * 0.07} />
          <rect width="58" height="78" rx="6" fill="none" stroke="#fff" strokeOpacity="0.7" />
        </g>
      ))}
    </Svg>
  );
}

/** 02 Inventory: a glass orb linked to small labels. */
export function OrbArt({ labels = ['In', 'Out', 'Count'] }: { labels?: string[] }) {
  const id = useId().replace(/:/g, '');
  return (
    <Svg label="">
      <Defs id={id} />
      <circle cx="74" cy="112" r="56" fill="#ffb3d9" opacity="0.45" filter={`url(#${id}-blur)`} />
      <path d="M74 168 V186 H130 M128 60 V150" stroke="#ffffff" strokeWidth="1.5" fill="none" opacity="0.9" />
      {labels.map((l, i) => (
        <g key={l} transform={`translate(128 ${52 + i * 34})`}>
          <line x1="0" y1="10" x2="10" y2="10" stroke="#fff" strokeWidth="1.5" />
          <rect x="10" width="56" height="20" rx="10" fill="#ffffff" opacity="0.75" />
          <circle cx="22" cy="10" r="3.5" fill={RAINBOW[i]} />
          <text x="30" y="14" fontSize="9" fill="#9b5b72" fontFamily="Inter, sans-serif">{l}</text>
        </g>
      ))}
      <circle cx="74" cy="112" r="40" fill={`url(#${id}-orb)`} />
      <circle cx="74" cy="112" r="40" fill="none" stroke="#fff" strokeOpacity="0.9" />
      <ellipse cx="60" cy="96" rx="14" ry="9" fill="#fff" opacity="0.85" filter={`url(#${id}-soft)`} />
    </Svg>
  );
}

/** 03 Assets: a translucent carry case. */
export function CaseArt() {
  const id = useId().replace(/:/g, '');
  return (
    <Svg label="">
      <Defs id={id} />
      <ellipse cx="130" cy="130" rx="70" ry="48" fill="#f5b7ff" opacity="0.45" filter={`url(#${id}-blur)`} />
      <path d="M100 70 C100 36 160 36 160 70" fill="none" stroke={`url(#${id}-rb)`} strokeWidth="9" strokeLinecap="round" opacity="0.8" />
      <g transform="translate(70 66) rotate(-6)">
        <rect width="120" height="110" rx="12" fill={`url(#${id}-rb)`} opacity="0.55" />
        <rect width="120" height="110" rx="12" fill={`url(#${id}-glass)`} opacity="0.55" />
        <rect width="120" height="110" rx="12" fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="1.5" />
        <rect x="14" y="14" width="34" height="80" rx="8" fill="#fff" opacity="0.35" />
      </g>
    </Svg>
  );
}

/** 04 Approvals: a glass window with a check mark. */
export function WindowArt() {
  const id = useId().replace(/:/g, '');
  return (
    <Svg label="">
      <Defs id={id} />
      <ellipse cx="130" cy="110" rx="80" ry="60" fill="#9fd6ff" opacity="0.45" filter={`url(#${id}-blur)`} />
      <g transform="translate(64 40)">
        <rect width="150" height="120" rx="14" fill={`url(#${id}-glass)`} />
        <rect width="150" height="120" rx="14" fill="none" stroke="#fff" strokeWidth="1.5" />
        <line x1="0" y1="24" x2="150" y2="24" stroke="#fff" />
        {[14, 26, 38].map((x) => <circle key={x} cx={x} cy="12" r="3.5" fill="#c9d3e6" />)}
        <rect x="14" y="38" width="40" height="64" rx="6" fill="#fff" opacity="0.7" />
        <rect x="64" y="38" width="72" height="12" rx="6" fill="#fff" opacity="0.7" />
        <rect x="64" y="58" width="56" height="12" rx="6" fill="#fff" opacity="0.55" />
        <circle cx="112" cy="94" r="18" fill={`url(#${id}-rb)`} opacity="0.85" />
        <path d="M104 94 l6 6 l11 -12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </Svg>
  );
}

/** 05 Budget: stacked isometric layers. */
export function LayersArt() {
  const id = useId().replace(/:/g, '');
  return (
    <Svg label="">
      <Defs id={id} />
      <ellipse cx="130" cy="130" rx="76" ry="46" fill="#ffc29e" opacity="0.5" filter={`url(#${id}-blur)`} />
      {Array.from({ length: 5 }, (_, i) => {
        const y = 150 - i * 22;
        return (
          <g key={i} opacity={0.45 + i * 0.12}>
            <path d={`M70 ${y} L135 ${y - 32} L205 ${y} L140 ${y + 32} Z`} fill={`url(#${id}-rb)`} />
            <path d={`M70 ${y} L135 ${y - 32} L205 ${y} L140 ${y + 32} Z`} fill={`url(#${id}-glass)`} opacity="0.45" />
            <path d={`M70 ${y} L135 ${y - 32} L205 ${y} L140 ${y + 32} Z`} fill="none" stroke="#fff" strokeOpacity="0.9" />
          </g>
        );
      })}
    </Svg>
  );
}

/** 06 Audit / batches: a green glass orb over a soft wave. */
export function WaveOrbArt() {
  const id = useId().replace(/:/g, '');
  return (
    <Svg label="">
      <Defs id={id} />
      <path d="M0 170 C50 140 90 190 140 160 S210 150 220 140 V200 H0 Z" fill="#bff0c8" opacity="0.55" filter={`url(#${id}-soft)`} />
      <path d="M0 182 C60 160 110 196 160 172 S210 166 220 160 V200 H0 Z" fill="#fff3b0" opacity="0.6" />
      <circle cx="130" cy="92" r="52" fill="#b6f5c5" opacity="0.55" filter={`url(#${id}-blur)`} />
      <circle cx="130" cy="92" r="38" fill={`url(#${id}-orbg)`} />
      <circle cx="130" cy="92" r="38" fill="none" stroke="#fff" strokeOpacity="0.9" />
      <ellipse cx="117" cy="77" rx="13" ry="8" fill="#fff" opacity="0.9" filter={`url(#${id}-soft)`} />
    </Svg>
  );
}
