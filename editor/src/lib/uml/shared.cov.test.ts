import { describe, expect, it } from 'vitest';
import type { DiagramNode } from '../../types';
import { blankClass, classOf } from './geometry';
import { copyCount, healStash, listModels, modelFields, modelIdOf, newModelId, propagateEverywhere, propagateNodes, type PagesState } from './shared';

const cls = (id: string, label: string, mid?: string, extra: Record<string, unknown> = {}): DiagramNode => {
  const n = blankClass(id, { x: 0, y: 0 }, 'class', label);
  return { ...n, data: { ...n.data, ...(mid ? { modelId: mid } : {}), ...extra } as never };
};
const obj = (id: string, mid: string, className: string): DiagramNode => ({ id, type: 'object', position: { x: 0, y: 0 }, data: { label: 'o', className, modelId: mid, slots: [], accent: '#888' } as never });
const seq = (id: string, parts: { id: string; name: string; modelId?: string }[]): DiagramNode => ({ id, type: 'sequence', position: { x: 0, y: 0 }, data: { label: 'S', accent: '#000', autonumber: false, items: [], participants: parts.map((p) => ({ kind: 'participant', ...p })) } as never });

describe('model ids', () => {
  it('newModelId is unique-ish and prefixed', () => {
    const a = newModelId();
    expect(a).toMatch(/^m_/);
    expect(newModelId()).not.toBe(a);
  });
  it('modelIdOf: class/object only; empty or non-string ignored', () => {
    expect(modelIdOf(cls('a', 'A', 'm1'))).toBe('m1');
    expect(modelIdOf(obj('o', 'm2', 'A'))).toBe('m2');
    expect(modelIdOf(cls('a', 'A'))).toBeUndefined();
    expect(modelIdOf(cls('a', 'A', undefined, { modelId: '' }))).toBeUndefined();
    expect(modelIdOf(cls('a', 'A', undefined, { modelId: 5 }))).toBeUndefined();
    expect(modelIdOf(seq('s', []))).toBeUndefined();
  });
  it('modelFields only returns defined shared fields', () => {
    const f = modelFields(classOf(cls('a', 'A')));
    expect(Object.keys(f).sort()).toEqual(['attributes', 'kind', 'label', 'operations']);
  });
});

describe('propagateNodes', () => {
  const src = classOf(cls('a', 'Renamed', 'm1', { generics: 'T' }));
  it('updates other copies, keeps their own fields, removes fields src lacks, resizes', () => {
    const copy = cls('b', 'Old', 'm1', { accent: '#abc', stereotype: 'gone' });
    const [out] = propagateNodes([copy], 'm1', src);
    expect(classOf(out)).toMatchObject({ label: 'Renamed', generics: 'T', accent: '#abc' });
    expect(classOf(out).stereotype).toBeUndefined();
    expect(out.id).toBe('b');
  });
  it('returns the same array when nothing changes', () => {
    const same = cls('b', 'Renamed', 'm1', { generics: 'T', attributes: src.attributes, operations: src.operations });
    const nodes = [same, cls('c', 'Other', 'm2'), cls('d', 'Free'), { id: 'g', type: 'group', position: { x: 0, y: 0 }, data: {} } as unknown as DiagramNode];
    expect(propagateNodes(nodes, 'm1', src)).toBe(nodes);
  });
  it('exceptId is skipped', () => {
    const nodes = [cls('b', 'Old', 'm1')];
    expect(propagateNodes(nodes, 'm1', src, 'b')).toBe(nodes);
  });
  it('objects and lifelines follow the class name; unrelated ones untouched', () => {
    const nodes = [obj('o1', 'm1', 'Old'), obj('o2', 'm1', 'Renamed'), obj('o3', 'mX', 'Keep'), seq('s1', [{ id: 'p1', name: 'Old', modelId: 'm1' }, { id: 'p2', name: 'Z', modelId: 'mX' }, { id: 'p3', name: 'Free' }]), seq('s2', [{ id: 'p', name: 'Renamed', modelId: 'm1' }])];
    const out = propagateNodes(nodes, 'm1', src);
    expect(out[0].data.className).toBe('Renamed');
    expect(out[1]).toBe(nodes[1]);
    expect(out[2]).toBe(nodes[2]);
    expect((out[3].data as any).participants.map((p: any) => p.name)).toEqual(['Renamed', 'Z', 'Free']);
    expect(out[4]).toBe(nodes[4]);
  });
});

describe('propagateEverywhere / healStash / copyCount / listModels', () => {
  const mk = (): PagesState & { pages: { id: string; name: string }[]; activePageId: string } => ({
    nodes: [cls('a', 'Live', 'm1'), cls('free', 'Free')],
    stash: { p2: { nodes: [cls('b', 'Stale', 'm1'), cls('c', 'Other', 'm2')] }, p3: { nodes: [cls('d', 'Live', 'm1')] } },
    pages: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }, { id: 'p3', name: 'Three' }, { id: 'p4', name: 'Four' }],
    activePageId: 'p1',
  });
  it('propagateEverywhere updates active page and stash; untouched stash entries keep identity', () => {
    const s = mk();
    const src = classOf(cls('x', 'New', 'm1'));
    const r = propagateEverywhere(s, 'm1', src, 'a');
    expect(r.nodes).toBe(s.nodes);
    expect(classOf(r.stash.p2.nodes[0]).label).toBe('New');
    expect(r.stash.p3).not.toBe(s.stash.p3);
    const none = propagateEverywhere(s, 'nope', src);
    expect(none.stash).toBe(s.stash);
  });
  it('healStash: other pages follow the active page; same stash when already equal', () => {
    const s = mk();
    const healed = healStash(s);
    expect(classOf(healed.p2.nodes[0]).label).toBe('Live');
    expect(healed.p2.nodes[1]).toBe(s.stash.p2.nodes[1]);
    expect(healed.p3).toBe(s.stash.p3);
    expect(healStash({ ...s, stash: healed })).toBe(healed);
  });
  it('healStash handles duplicates of a model on the active page once, and ignores non-class models', () => {
    const s = mk();
    s.nodes = [cls('a', 'Live', 'm1'), cls('a2', 'Live', 'm1'), obj('o', 'm1', 'Live')];
    expect(classOf(healStash(s).p2.nodes[0]).label).toBe('Live');
  });
  it('copyCount counts class copies on all pages only', () => {
    const s = mk();
    expect(copyCount(s, 'm1')).toBe(3);
    expect(copyCount(s, 'm2')).toBe(1);
    expect(copyCount(s, 'zz')).toBe(0);
  });
  it('listModels: one entry per model, unlinked classes separate, missing stash tolerated', () => {
    const s = mk();
    s.nodes.push({ id: 'g', type: 'group', position: { x: 0, y: 0 }, data: {} } as unknown as DiagramNode);
    const l = listModels(s);
    expect(l.map((e) => `${e.label}@${e.pageId}`)).toEqual(['Live@p1', 'Free@p1', 'Other@p2']);
    expect(l[0]).toMatchObject({ modelId: 'm1', onThisPage: true, nodeId: 'a', pageName: 'One' });
    expect(l[1].modelId).toBeUndefined();
    expect(l[0].members).toBe(2);
  });
  it('listModels: model first seen on another page becomes onThisPage when the active page also has it', () => {
    const s = mk();
    s.pages = [{ id: 'p2', name: 'Two' }, { id: 'p1', name: 'One' }];
    const l = listModels(s);
    const m1 = l.find((e) => e.modelId === 'm1')!;
    expect(m1.pageId).toBe('p2');
    expect(m1.onThisPage).toBe(true);
    // a repeat on a non-active page leaves the flag alone
    s.activePageId = 'p9';
    s.pages = [{ id: 'p2', name: 'Two' }, { id: 'p3', name: 'Three' }];
    expect(listModels(s).find((e) => e.modelId === 'm1')!.onThisPage).toBe(false);
  });
});
