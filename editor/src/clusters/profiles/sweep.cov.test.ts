import { describe, expect, it } from 'vitest';
import { PROFILES } from './index';
import type { FieldSpec } from './types';

type P = Record<string, unknown>;
const pick = (f: FieldSpec, how: 'min' | 'max' | 'def' | 'alt'): unknown => {
  switch (f.type) {
    case 'number': return how === 'min' ? f.min : how === 'max' ? f.max : how === 'alt' ? Math.min(f.max, f.min + 1) : f.default;
    case 'boolean': return how === 'alt' || how === 'max' ? !f.default : f.default;
    case 'select': return how === 'min' ? f.options[0].value : how === 'max' ? f.options[f.options.length - 1].value : how === 'alt' ? f.options[Math.min(1, f.options.length - 1)].value : f.default;
    case 'text': return f.default;
    default: return f.default;
  }
};
function variants(fields: FieldSpec[], defaults: P): P[] {
  const out: P[] = [{ ...defaults }];
  for (const how of ['min', 'max', 'alt'] as const) out.push(Object.fromEntries(fields.map((f) => [f.key, pick(f, how)])));
  // one factor at a time, on top of every select option of the "mode"-like fields
  for (const f of fields) {
    const opts: unknown[] = f.type === 'select' ? f.options.map((o) => o.value) : f.type === 'boolean' ? [true, false] : f.type === 'number' ? [f.min, f.max, f.min + 1, f.default] : [];
    for (const v of opts) {
      out.push({ ...defaults, [f.key]: v });
      for (const how of ['min', 'max'] as const) out.push({ ...Object.fromEntries(fields.map((g) => [g.key, pick(g, how)])), [f.key]: v });
    }
  }
  return out;
}

for (const prof of PROFILES) {
  describe(`${prof.id} param sweep`, () => {
    it('every param combination validates, summarizes, and generates a consistent graph; showIf is a pure predicate', () => {
      for (const params of variants(prof.fields, prof.defaults)) {
        const parsed = prof.schema.safeParse(params);
        if (!parsed.success) continue; // out of range for the schema: the UI clamps these
        const p = parsed.data as P;
        for (const f of prof.fields) if (f.showIf) expect(typeof f.showIf(p)).toBe('boolean');
        expect(Array.isArray(prof.validate(p))).toBe(true);
        expect(prof.summarize(p).length).toBeGreaterThan(0);
        const g = prof.generate(p, 'x');
        const ids = g.nodes.map((n) => n.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toContain(g.rootId);
        expect(g.size.width).toBeGreaterThan(0);
        expect(g.size.height).toBeGreaterThan(0);
        for (const e of g.edges) { expect(ids).toContain(e.source); expect(ids).toContain(e.target); }
      }
    });
  });
}
