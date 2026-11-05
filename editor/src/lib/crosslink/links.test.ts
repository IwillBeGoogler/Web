import { describe, expect, it } from 'vitest';
import { archRefOf, backlinksOf, candidatesOf, indexPage, makeRef, resolveRef, validateArchRef, type ProjectIndex } from './links';
import { parseDiagram, serializeDiagram } from '../serialization';

const n = (id: string, type: string, label: string, archRef?: unknown) => ({ id, type, data: { label, ...(archRef ? { archRef } : {}) } });
const index: ProjectIndex = {
  files: [
    { id: 'f1', name: 'Arch', pages: [indexPage({ id: 'p1', name: 'Main', nodes: [n('svc', 'icon', 'Orders service'), n('db', 'icon', 'DB'), n('c1', 'class', 'Order', { nodeId: 'svc' })] }), indexPage({ id: 'p2', name: 'Two', nodes: [n('t1', 'table', 'orders', { nodeId: 'svc', pageId: 'p1' })] })] },
    { id: 'f2', name: 'Schema', pages: [indexPage({ id: 'q1', name: 'ERD', nodes: [n('t2', 'table', 'items', { nodeId: 'svc', fileId: 'f1', pageId: 'p1' }), n('t3', 'table', 'gone', { nodeId: 'nope', fileId: 'f1' }), n('t4', 'table', 'nofile', { nodeId: 'svc', fileId: 'zz' }), n('t5', 'table', 'nopage', { nodeId: 'svc', fileId: 'f1', pageId: 'zz' }), n('t6', 'table', 'wrongkind', { nodeId: 'c1', fileId: 'f1', pageId: 'p1' })] })] },
  ],
};

describe('cross-link refs', () => {
  it('resolves same page, other page and other file', () => {
    const r = (ref: object, fileId: string, pageId: string) => resolveRef(ref as never, { fileId, pageId }, index);
    expect(r({ nodeId: 'svc' }, 'f1', 'p1')).toMatchObject({ ok: true, loc: { fileId: 'f1', pageId: 'p1', nodeId: 'svc' } });
    expect(r({ nodeId: 'svc', pageId: 'p1' }, 'f1', 'p2')).toMatchObject({ ok: true });
    expect(r({ nodeId: 'svc', fileId: 'f1', pageId: 'p1' }, 'f2', 'q1')).toMatchObject({ ok: true });
    expect(r({ nodeId: 'svc', fileId: 'f1' }, 'f2', 'q1')).toMatchObject({ ok: true, loc: { pageId: 'p1' } });
  });
  it('dangling refs are broken, not exceptions', () => {
    const r = (id: string) => resolveRef(archRefOf(index.files[1].pages[0].nodes.find((x) => x.id === id)!.archRef ? { archRef: index.files[1].pages[0].nodes.find((x) => x.id === id)!.archRef } : {})!, { fileId: 'f2', pageId: 'q1' }, index);
    expect(r('t3')).toMatchObject({ ok: false, reason: expect.stringMatching(/node/) });
    expect(r('t4')).toMatchObject({ ok: false, reason: expect.stringMatching(/file/) });
    expect(r('t5')).toMatchObject({ ok: false, reason: expect.stringMatching(/page/) });
    expect(r('t6')).toMatchObject({ ok: false, reason: expect.stringMatching(/architecture/) });
  });
  it('makeRef leaves out what the source shares', () => {
    const from = { fileId: 'f1', pageId: 'p1' };
    expect(makeRef({ ...from, nodeId: 'a' }, from)).toEqual({ nodeId: 'a' });
    expect(makeRef({ fileId: 'f1', pageId: 'p2', nodeId: 'a' }, from)).toEqual({ nodeId: 'a', pageId: 'p2' });
    expect(makeRef({ fileId: 'f2', pageId: 'q', nodeId: 'a' }, from)).toEqual({ nodeId: 'a', fileId: 'f2', pageId: 'q' });
  });
  it('back-links list every source that resolves to the node', () => {
    const b = backlinksOf({ fileId: 'f1', pageId: 'p1', nodeId: 'svc' }, index);
    expect(b.map((x) => x.node.id).sort()).toEqual(['c1', 't1', 't2']);
    expect(backlinksOf({ fileId: 'f1', pageId: 'p1', nodeId: 'db' }, index)).toEqual([]);
  });
  it('candidates: same page first, only icons and cards', () => {
    const c = candidatesOf(index, { fileId: 'f1', pageId: 'p1' });
    expect(c.map((x) => x.loc.nodeId)).toEqual(['db', 'svc']);
  });
  it('validates the shape', () => {
    expect(validateArchRef(undefined)).toBeNull();
    expect(validateArchRef({ nodeId: 'a', fileId: 'f' })).toBeNull();
    expect(validateArchRef({})).toMatch(/nodeId/);
    expect(validateArchRef('x')).toMatch(/object/);
    expect(validateArchRef({ nodeId: 'a', pageId: 3 })).toMatch(/pageId/);
    expect(archRefOf({ archRef: { nodeId: '' } })).toBeNull();
  });
});

describe('cross-links survive serialization', () => {
  const doc = (archRef: unknown) => ({ version: 1, edges: [], nodes: [
    { id: 'svc', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'S' } },
    { id: 'c1', type: 'class', position: { x: 0, y: 0 }, data: { label: 'Order', kind: 'class', attributes: [], operations: [], accent: '#000', archRef } },
  ] });
  it('round-trips archRef and keeps a dangling one', () => {
    const r = parseDiagram(JSON.stringify(doc({ nodeId: 'deleted', fileId: 'f9', pageId: 'p9' })));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const again = parseDiagram(serializeDiagram(r.diagram));
    expect(again.ok && again.diagram.nodes[1].data.archRef).toEqual({ nodeId: 'deleted', fileId: 'f9', pageId: 'p9' });
  });
  it('rejects a malformed archRef', () => {
    const r = parseDiagram(JSON.stringify(doc({ fileId: 'f' })));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/archRef/) });
  });
});
