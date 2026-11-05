import { useId } from 'react';

/** The app mark: three boxes joined by an orthogonal connector, on an indigo-violet tile. */
export function LogoMark({ size = 24 }: { size?: number }) {
  const g = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="System Design Diagram" data-testid="logo-mark">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b5bf7" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${g})`} />
      <g fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5.5" y="6" width="8" height="7" rx="2" />
        <rect x="18.5" y="6" width="8" height="7" rx="2" fill="#fff" fillOpacity=".25" />
        <rect x="12" y="19" width="8" height="7" rx="2" />
        <path d="M13.5 9.5h5" />
        <path d="M9.5 13v2.5a2 2 0 002 2H16V19" />
        <path d="M22.5 13v2.5a2 2 0 01-2 2H16" />
      </g>
    </svg>
  );
}
