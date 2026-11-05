import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EdgeMarker } from './markers';
import { arrowMetrics } from '../../lib/arrow';

const marker = (kind: Parameters<typeof EdgeMarker>[0]['kind'], w: number, size: 'S' | 'M' | 'L' = 'M') => {
  const m = arrowMetrics(w, size);
  const { container } = render(<svg><EdgeMarker id="m" kind={kind} color="#000" length={m.length} width={m.width} /></svg>);
  return { el: container.querySelector('marker')!, m };
};

describe('EdgeMarker', () => {
  it('~8px long at stroke 1.5, base on the path end (refX 0), user-space units', () => {
    const { el } = marker('arrow', 1.5);
    expect(el.getAttribute('markerWidth')).toBe('8');
    expect(el.getAttribute('refX')).toBe('0');
    expect(el.getAttribute('markerUnits')).toBe('userSpaceOnUse');
  });
  it('scales with stroke width and size setting', () => {
    expect(Number(marker('arrow', 3).el.getAttribute('markerWidth'))).toBe(16);
    expect(Number(marker('arrow', 1.5, 'L').el.getAttribute('markerWidth'))).toBeGreaterThan(8);
    expect(Number(marker('arrow', 1.5, 'S').el.getAttribute('markerWidth'))).toBeLessThan(8);
  });
  it('renders nothing for none and every other kind', () => {
    const { container } = render(<svg><EdgeMarker id="m" kind="none" color="#000" /></svg>);
    expect(container.querySelector('marker')).toBeNull();
    for (const k of ['open', 'triangle', 'diamond', 'circle', 'crowfoot'] as const) expect(marker(k, 1.5).el.querySelector('path,circle')).not.toBeNull();
  });
});
