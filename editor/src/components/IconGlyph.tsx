import { useEffect } from 'react';
import { useIcon } from '../data/icons';
import { GENERIC_ICONS } from '../data/icons/generic';

const warned = new Set<string>();

/** Neutral generic glyph used when an icon is unknown or failed to load (never leave a blank). */
function FallbackGlyph({ id, size }: { id?: string; size: number }) {
  useEffect(() => {
    if (import.meta.env?.DEV && id && !warned.has(id)) {
      warned.add(id);
      console.warn(`[icons] "${id}" has no usable icon; showing the generic fallback`);
    }
  }, [id]);
  const g = GENERIC_ICONS.service;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={id ?? 'icon'} data-fallback="true" fill="none" stroke="#8a93a3" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {g.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

export function IconGlyph({ iconId, size = 48 }: { iconId?: string; size?: number }) {
  const icon = useIcon(iconId);
  if (icon.kind === 'brand') {
    // wide wordmarks (e.g. 3:1) get a wider tile (up to 3x) so they stay legible instead of shrinking into a square
    const vb = icon.viewBox.trim().split(/[\s,]+/).map(Number);
    const aspect = vb.length === 4 && vb[3] > 0 ? vb[2] / vb[3] : 1;
    const width = aspect > 1.6 ? Math.round(size * Math.min(aspect, 3)) : size;
    return (
      <svg
        width={width}
        height={size}
        viewBox={icon.viewBox}
        role="img"
        aria-label={icon.title}
        preserveAspectRatio="xMidYMid meet"
        dangerouslySetInnerHTML={{ __html: icon.body }}
      />
    );
  }
  if (icon.kind === 'generic') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        role="img"
        aria-label={icon.title}
        fill="none"
        stroke={`#${icon.hex}`}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon.paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
    );
  }
  if (icon.kind === 'asset') return <img src={icon.src} width={size} height={size} alt={icon.title} style={{ objectFit: 'contain' }} draggable={false} />;
  if (icon.kind === 'pending') return <span className="skeleton icon-pending" style={{ width: size, height: size }} aria-hidden />;
  return <FallbackGlyph id={iconId} size={size} />;
}
