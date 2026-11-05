import { describe, expect, it } from 'vitest';
import type { DiagramNode } from '../../types';
import { clearLink, findBacklinks, linkPath, nodeHash, parseNodeHash, popTrail, pushTrail, setLink, shouldFollow, validLink } from './links';

const node = (id: string, label: string, link?: { fileId: string; nodeId?: string }): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label, ...(link ? { link } : {}) } }) as DiagramNode;

describe('links', () => {
  it('setLink / clearLink write and remove data.link on one node', () => {
    const nodes = [node('a', 'API'), node('b', 'DB')];
    const out = setLink(nodes, 'a', { fileId: 'erd', nodeId: 't1' });
    expect(out[0].data.link).toEqual({ fileId: 'erd', nodeId: 't1' });
    expect(out[1]).toBe(nodes[1]);
    expect(clearLink(out, 'a')[0].data.link).toBeUndefined();
  });
  it('validLink needs a file id', () => {
    expect(validLink({ fileId: 'f' })).toBe(true);
    expect(validLink({ fileId: '' })).toBe(false);
    expect(validLink({ nodeId: 'x' })).toBe(false);
    expect(validLink(null)).toBe(false);
  });
  it('linkPath builds the editor route, nodeHash / parseNodeHash round-trip', () => {
    expect(linkPath('prj1', { fileId: 'fil2', nodeId: 'n 3' })).toBe('/p/prj1/f/fil2#node=n%203');
    expect(linkPath('prj1', { fileId: 'fil2' })).toBe('/p/prj1/f/fil2');
    expect(parseNodeHash(nodeHash('n 3'))).toBe('n 3');
    expect(parseNodeHash('#frame=x')).toBeNull();
    expect(parseNodeHash('')).toBeNull();
  });
  it('backlinks', () => {
    const files = [
      { id: 'arch', name: 'Architecture', nodes: [node('svc', 'Orders service', { fileId: 'erd', nodeId: 'orders' }), node('x', 'Other')] },
      { id: 'erd', name: 'ERD', nodes: [node('orders', 'orders'), node('self', 'self link', { fileId: 'erd', nodeId: 'orders' })] },
      { id: 'doc', name: 'Doc', nodes: [node('whole', 'See ERD', { fileId: 'erd' })] },
    ];
    expect(findBacklinks(files, { fileId: 'erd', nodeId: 'orders' }).map((b) => [b.fileName, b.nodeId, b.label])).toEqual([['Architecture', 'svc', 'Orders service']]);
    expect(findBacklinks(files, { fileId: 'erd' }).map((b) => b.nodeId).sort()).toEqual(['svc', 'whole']);
    expect(findBacklinks(files, { fileId: 'erd', nodeId: 'orders' }, { includeSelf: true }).map((b) => b.nodeId).sort()).toEqual(['self', 'svc']);
  });
  it('a link to a whole file also counts for any node in that file when asking for the file', () => {
    const files = [{ id: 'a', name: 'A', nodes: [node('n', 'n', { fileId: 'b' })] }];
    expect(findBacklinks(files, { fileId: 'b' })).toHaveLength(1);
    expect(findBacklinks(files, { fileId: 'b', nodeId: 'zzz' })).toHaveLength(0);
  });
  it('follow rule: ⌘/Ctrl-click in the editor, plain click while presenting; never while editing a label', () => {
    expect(shouldFollow({ meta: true, presenting: false })).toBe(true);
    expect(shouldFollow({ meta: false, presenting: false })).toBe(false);
    expect(shouldFollow({ meta: false, presenting: true })).toBe(true);
  });
  it('breadcrumb trail: push remembers where you came from, pop goes back, repeated entries collapse, size is capped', () => {
    let t = pushTrail([], { fileId: 'a', nodeId: 'x' });
    t = pushTrail(t, { fileId: 'b' });
    const back = popTrail(t);
    expect(back.entry).toEqual({ fileId: 'b' });
    expect(back.trail).toEqual([{ fileId: 'a', nodeId: 'x' }]);
    expect(pushTrail(t, { fileId: 'b' })).toEqual(t);
    let long: ReturnType<typeof pushTrail> = [];
    for (let i = 0; i < 50; i++) long = pushTrail(long, { fileId: `f${i}` });
    expect(long).toHaveLength(20);
    expect(popTrail([]).entry).toBeNull();
  });
});
