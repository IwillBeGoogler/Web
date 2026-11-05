import type { MarkerKind } from '../../types';

/**
 * SVG <marker> definitions for the arrowhead shapes, in user-space px (`length` along the line, `width` across it).
 * The marker's BASE sits on the path end (refX = 0): the router trims the drawn line by `length`, so the line stops at the
 * arrowhead base and the tip lands exactly on the attach point. The start marker uses auto-start-reverse.
 */
export function EdgeMarker({ id, kind, color, length = 8, width = 6, bg }: { id: string; kind: MarkerKind; color: string; length?: number; width?: number; bg?: string }) {
  if (kind === 'none') return null;
  const L = length;
  const W = width;
  const h = W / 2;
  const sw = Math.max(0.8, Math.min(1.6, L / 8));
  const common = { id, viewBox: `0 0 ${L} ${W}`, markerWidth: L, markerHeight: W, refX: 0, refY: h, orient: 'auto-start-reverse' as const, markerUnits: 'userSpaceOnUse' as const, overflow: 'visible' as const };
  switch (kind) {
    case 'one':
    case 'zeroOrOne':
    case 'many':
    case 'oneOrMany':
    case 'zeroOrMany':
      return <ErMarkerShape id={id} kind={kind} color={color} />;
    case 'hollowTriangle':
      // UML generalisation / realisation: closed triangle filled with the canvas colour
      return (
        <marker {...common}>
          <path d={`M${sw / 2},${sw / 2} L${L - sw / 2},${h} L${sw / 2},${W - sw / 2} z`} fill={bg ?? '#ffffff'} stroke={color} strokeWidth={sw} strokeLinejoin="round" style={bg ? undefined : { fill: 'var(--canvas-bg, #fff)' }} />
        </marker>
      );
    case 'filledDiamond':
    case 'hollowDiamond': {
      const filled = kind === 'filledDiamond';
      return (
        <marker {...common}>
          <path d={`M${sw / 2},${h} L${L / 2},${sw / 2} L${L - sw / 2},${h} L${L / 2},${W - sw / 2} z`} fill={filled ? color : bg ?? '#ffffff'} stroke={color} strokeWidth={sw} strokeLinejoin="round" style={filled || bg ? undefined : { fill: 'var(--canvas-bg, #fff)' }} />
        </marker>
      );
    }
    case 'open':
      return (
        <marker {...common}>
          <path d={`M0,0 L${L},${h} L0,${W}`} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      );
    case 'triangle':
      return (
        <marker {...common}>
          <path d={`M${sw / 2},${sw / 2} L${L - sw / 2},${h} L${sw / 2},${W - sw / 2} z`} fill={bg ?? '#ffffff'} stroke={color} strokeWidth={sw} strokeLinejoin="round" style={bg ? undefined : { fill: 'var(--canvas-bg, #fff)' }} />
        </marker>
      );
    case 'diamond':
      return (
        <marker {...common}>
          <path d={`M0,${h} L${L / 2},0 L${L},${h} L${L / 2},${W} z`} fill={color} stroke={color} strokeWidth={0.6} strokeLinejoin="round" />
        </marker>
      );
    case 'circle': {
      const r = Math.min(L, W) / 2 - sw / 2;
      return (
        <marker {...common}>
          <circle cx={L / 2} cy={h} r={r} fill={bg ?? '#ffffff'} stroke={color} strokeWidth={sw} style={bg ? undefined : { fill: 'var(--canvas-bg, #fff)' }} />
        </marker>
      );
    }
    case 'crowfoot':
      return (
        <marker {...common}>
          <path d={`M${L},${h} L0,0 M${L},${h} L0,${h} M${L},${h} L0,${W}`} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </marker>
      );
    default:
      // refined filled head: a slim triangle, ~8px long at stroke 1.5
      return (
        <marker {...common}>
          <path d={`M0,0 L${L},${h} L0,${W} z`} fill={color} stroke={color} strokeWidth={0.5} strokeLinejoin="round" />
        </marker>
      );
  }
}

/** Crow's-foot ends. Box is 22 x 14: the line enters at x=0 and the table border is at x=22 (the feet / bars sit against it). */
function ErMarkerShape({ id, kind, color }: { id: string; kind: 'one' | 'zeroOrOne' | 'many' | 'oneOrMany' | 'zeroOrMany'; color: string }) {
  const L = 22;
  const W = 14;
  const h = W / 2;
  const common = { id, viewBox: `0 0 ${L} ${W}`, markerWidth: L, markerHeight: W, refX: 0, refY: h, orient: 'auto-start-reverse' as const, markerUnits: 'userSpaceOnUse' as const, overflow: 'visible' as const };
  const stroke = { stroke: color, strokeWidth: 1.5, fill: 'none', strokeLinecap: 'round' as const };
  const bar = (x: number) => <path d={`M${x},1 L${x},${W - 1}`} {...stroke} />;
  const feet = <path d={`M10,${h} L${L},1 M10,${h} L${L},${h} M10,${h} L${L},${W - 1}`} {...stroke} />;
  // the circle is filled with the canvas colour so the line does not show through it
  const ring = (cx: number) => <circle cx={cx} cy={h} r={3.6} style={{ fill: 'var(--canvas-bg, #fff)' }} stroke={color} strokeWidth={1.5} />;
  const lead = (to: number) => <path d={`M0,${h} L${to},${h}`} {...stroke} />;
  switch (kind) {
    case 'one':
      return <marker {...common}>{lead(L)}{bar(L - 4)}{bar(L - 9)}</marker>;
    case 'zeroOrOne':
      return <marker {...common}>{lead(L)}{bar(L - 4)}{ring(L - 12)}</marker>;
    case 'many':
      return <marker {...common}>{lead(10)}{feet}</marker>;
    case 'oneOrMany':
      return <marker {...common}>{lead(10)}{feet}{bar(6)}</marker>;
    default:
      return <marker {...common}>{lead(10)}{feet}{ring(5)}</marker>;
  }
}
