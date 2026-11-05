import { describe, expect, it } from 'vitest';
import { ALL_TEMPLATES } from './index';
import { nodeSize } from '../lib/graph';

describe('ER layout corridors', () => {
  for (const id of ['er-ecommerce', 'er-blog', 'er-seedora-demo']) {
    it(`${id}: tables in different columns are >= 120px apart, stacked tables >= 40px`, () => {
      const d = ALL_TEMPLATES.find((t) => t.id === id)!.build();
      const rs = d.nodes.filter((n) => n.type === 'table').map((n) => ({ id: n.id, ...n.position, ...nodeSize(n) }));
      for (let i = 0; i < rs.length; i++)
        for (let j = i + 1; j < rs.length; j++) {
          const a = rs[i], b = rs[j];
          const yOverlap = a.y < b.y + b.height && b.y < a.y + a.height;
          const xOverlap = a.x < b.x + b.width && b.x < a.x + a.width;
          if (yOverlap && !xOverlap) expect(Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width)), `${a.id}/${b.id} column gap`).toBeGreaterThanOrEqual(120);
          if (xOverlap && !yOverlap) expect(Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height)), `${a.id}/${b.id} row gap`).toBeGreaterThanOrEqual(40);
        }
    });
  }
});
