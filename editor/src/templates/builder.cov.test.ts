import { describe, expect, it } from 'vitest';
import { PROVIDERS } from '../data/cloud';
import { builder, cloudDef } from './builder';

describe('cloudDef', () => {
  const aws = PROVIDERS.find((p) => p.SECTION.id === 'aws')!;
  const def = aws.DEFS.find((d) => d.kind === 'icon')!;
  it('finds a definition case-insensitively', () => {
    expect(cloudDef('aws', def.label.toUpperCase())).toBe(def);
  });
  it('finds a group by kind', () => {
    const grp = aws.DEFS.find((d) => d.kind === 'group');
    if (grp) expect(cloudDef('aws', grp.label, 'group')).toBe(grp);
  });
  it('throws a helpful error for an unknown provider or label', () => {
    expect(() => cloudDef('nope', 'x')).toThrow(/no nope icon "x"/);
    expect(() => cloudDef('aws', 'zzz-missing')).toThrow(/no aws icon/);
    expect(() => cloudDef('aws', def.label, 'group')).toThrow(/group/);
  });
});

describe('builder DSL', () => {
  it('icons, plain groups and text nodes, with and without parents', () => {
    const b = builder();
    expect(b.icon('a', 'A', 'redis', 1, 2)).toBe('a');
    b.icon('b', 'B', 'redis', 3, 4, 'g', { subtitle: 's' });
    b.plainGroup('g', 'G', 0, 0, 100, 50, { stroke: '#000' });
    b.plainGroup('g2', 'G2', 0, 0, 10, 10, {}, 'g');
    b.text('t', 'T', 5, 6, 70, 20, { fontSize: 9 });
    const d = b.done();
    expect(d.nodes.find((n) => n.id === 'a')).toEqual({ id: 'a', type: 'icon', position: { x: 1, y: 2 }, data: { label: 'A', iconId: 'redis' } });
    expect(d.nodes.find((n) => n.id === 'b')).toMatchObject({ parentId: 'g', data: { subtitle: 's' } });
    expect(d.nodes.find((n) => n.id === 'g')).toMatchObject({ type: 'group', width: 100, style: { width: 100, height: 50 }, data: { stroke: '#000' } });
    expect(d.nodes.find((n) => n.id === 'g')).not.toHaveProperty('parentId');
    expect(d.nodes.find((n) => n.id === 'g2')!.parentId).toBe('g');
    expect(d.nodes.find((n) => n.id === 't')).toMatchObject({ type: 'text', data: { label: 'T', fontSize: 9 } });
    expect(d.version).toBe(1);
  });
  it('group copies the official preset and overrides the label optionally', () => {
    const aws = PROVIDERS.find((p) => p.SECTION.id === 'aws')!;
    const g = aws.DEFS.find((d) => d.kind === 'group' && d.preset)!;
    const b = builder();
    b.group('x', g as never, 1, 2, 300, 200);
    b.group('y', g as never, 1, 2, 300, 200, 'x', 'Custom');
    const d = b.done();
    expect(d.nodes[0].data.label).toBe(g.label);
    expect(d.nodes[0].data.groupIcon).toBe(g.iconId);
    expect(d.nodes[0]).not.toHaveProperty('parentId');
    expect(d.nodes[1]).toMatchObject({ parentId: 'x', data: { label: 'Custom' } });
  });
  it('links get sequential ids and carry label, pins, dashes, colour and label position', () => {
    const b = builder();
    b.link('a', 'b');
    b.link('a', 'b', { label: 'L', pins: ['right', 'left'], dashed: true, color: '#f00', labelT: 0 });
    b.link('a', 'b', { labelT: 0.25 });
    const e = b.done().edges;
    expect(e.map((x) => x.id)).toEqual(['e1', 'e2', 'e3']);
    expect(e[0].label).toBeUndefined();
    expect(e[1]).toMatchObject({ label: 'L', data: { pinSource: 'right', pinTarget: 'left', strokeStyle: 'dashed', dashed: true, color: '#f00', labelT: 0 } });
    expect(e[2].data).toMatchObject({ labelT: 0.25 });
  });
  it('an edge preset patches the style; unknown presets are ignored', () => {
    const b = builder();
    b.link('a', 'b', { preset: 'does-not-exist' });
    expect(b.done().edges).toHaveLength(1);
  });
});
