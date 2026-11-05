import { describe, expect, it } from 'vitest';
import { completeAt, declaredIds, iconCompletions } from './language';

const at = (doc: string) => completeAt(doc, doc.length);

describe('autocomplete', () => {
  it('completes catalog icons after icon=', () => {
    const r = at('node db "DB" icon=postg')!;
    expect(r.from).toBe('node db "DB" icon='.length);
    expect(r.options.map((o) => o.label)).toContain('postgresql');
    expect(iconCompletions('redis')[0].label).toBe('redis');
  });
  it('completes presets and edge endpoints', () => {
    expect(at('a -> b "x" preset=')!.options.map((o) => o.label)).toContain('metrics');
    const doc = 'node api "API"\nnode db "DB"\napi -> ';
    expect(at(doc)!.options.map((o) => o.label)).toEqual(['api', 'db']);
    expect(declaredIds(doc)).toEqual(['api', 'db']);
  });
  it('offers statement keywords at line start, sequence keywords inside seq and column types in tables', () => {
    expect(at('no')!.options.map((o) => o.label)).toContain('node');
    expect(at('seq s "S" {\n  al')!.options.map((o) => o.label)).toContain('alt');
    expect(at('table t {\n  id ')!.options.map((o) => o.label)).toContain('uuid');
  });
  it('completes table names in refs', () => {
    expect(at('table users {\n id int\n}\nref: orders.user_id > ')!.options.map((o) => o.label)).toContain('users');
  });
});
