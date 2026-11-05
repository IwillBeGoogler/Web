import { describe, expect, it } from 'vitest';
import { validateDiagram } from '../serialization';
import { blankTiming } from './node';

// the data keys of a timing frame must not collide with the design-tool node fields (`constraints` once did)
describe('timing data vs the shared node validators', () => {
  it('a starter frame passes validateDiagram and keeps its data', () => {
    const r = validateDiagram({ version: 1, nodes: [blankTiming('t', { x: 0, y: 0 })], edges: [] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.diagram.nodes[0].data).toMatchObject({ unit: 'ms', end: 400, durations: [{ id: 'k1' }] });
  });
});
