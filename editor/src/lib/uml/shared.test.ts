import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { validateDiagram } from '../serialization';
import { applyDsl, printPage } from '@core/dsl';
import type { DiagramNode } from '../../types';
import { importUmlText } from './io';
import { applyUmlModel } from './apply';
import { classOf } from './geometry';
import { addMember } from './edit';
import { copyCount, healStash, listModels, modelIdOf } from './shared';
import { sequenceOf } from '../seq/node';
import * as Y from 'yjs';
import { readProject, writeProject, type YEntity, type YProject } from '../../collab/yproject';
import { propagateNodes } from './shared';

const s = () => useDiagramStore.getState();
const cls = (label: string, page: 'active' | string = 'active') => {
  const nodes = page === 'active' ? s().nodes : s().stash[page].nodes;
  return nodes.find((n) => n.type === 'class' && classOf(n).label === label)!;
};
const base = s().activePageId;

async function seed() {
  s().reset();
  applyUmlModel((await importUmlText('export class User { name: string; save(): void {} }\nexport class Order { id: string }', 'typescript')).model, 'page');
  s().nodes.forEach((n, i) => s().setNodePosition(n.id, { x: 100 + i * 300, y: 40 }));
}

describe('shared class model', () => {
  beforeEach(seed);

  it('adds a linked copy on another page; positions stay per copy', async () => {
    const first = s().activePageId;
    const user = cls('User');
    s().addPage('Second');
    const second = s().activePageId;
    const copyId = s().addLinkedClass({ pageId: first, nodeId: user.id })!;
    expect(copyId).toBeTruthy();
    const copy = s().nodes.find((n) => n.id === copyId)!;
    expect(classOf(copy).label).toBe('User');
    expect(modelIdOf(copy)).toBeTruthy();
    expect(modelIdOf(copy)).toBe(modelIdOf(cls('User', first)));
    expect(copy.id).not.toBe(user.id);
    s().setNodePosition(copyId, { x: 900, y: 900 });
    expect(cls('User', first).position).toEqual({ x: 100, y: 40 });
    expect(s().activePageId).toBe(second);
    expect(copyCount({ nodes: s().nodes, stash: s().stash }, modelIdOf(copy)!)).toBe(2);
  });

  it('rename and member edits update every copy (same page and other pages) in one undo step', async () => {
    const first = s().activePageId;
    s().addPage('Second');
    const copyId = s().addLinkedClass({ pageId: first, nodeId: cls('User', first).id })!;
    const pastBefore = s().past.length;
    s().updateClass(copyId, (d) => ({ ...addMember(d, 'attribute'), label: 'Customer' }));
    expect(s().past.length).toBe(pastBefore + 1);
    const orig = cls('Customer', first);
    expect(classOf(orig).attributes.length).toBe(2);
    expect(classOf(orig).attributes.map((a) => a.id)).toEqual(classOf(s().nodes.find((n) => n.id === copyId)!).attributes.map((a) => a.id));
    // unrelated class untouched
    expect(cls('Order', first).data.label).toBe('Order');
    // undo restores the active page and the other page follows
    s().undo();
    expect(classOf(s().nodes.find((n) => n.id === copyId)!).label).toBe('User');
    expect(classOf(cls('User', first)).label).toBe('User');
    expect(classOf(cls('User', first)).attributes.length).toBe(1);
    s().redo();
    expect(classOf(cls('Customer', first)).attributes.length).toBe(2);
  });

  it('renaming through updateNodeData also renames the copies', () => {
    const first = s().activePageId;
    const a = cls('User');
    const b = s().addLinkedClass({ pageId: first, nodeId: a.id })!;
    s().updateNodeData(b, { label: 'Person' });
    expect(s().nodes.filter((n) => n.type === 'class' && classOf(n).label === 'Person')).toHaveLength(2);
  });

  it('unlink detaches one copy; deleting a copy leaves the others', () => {
    const first = s().activePageId;
    const a = cls('User');
    const b = s().addLinkedClass({ pageId: first, nodeId: a.id })!;
    const c = s().addLinkedClass({ pageId: first, nodeId: a.id })!;
    expect(s().unlinkClass(c)).toBe(true);
    expect(modelIdOf(s().nodes.find((n) => n.id === c)!)).toBeUndefined();
    s().updateClass(a.id, (d) => ({ ...d, label: 'U2' }));
    expect(classOf(s().nodes.find((n) => n.id === b)!).label).toBe('U2');
    expect(classOf(s().nodes.find((n) => n.id === c)!).label).toBe('User');
    s().deleteNodes([b]);
    expect(classOf(s().nodes.find((n) => n.id === a.id)!).label).toBe('U2');
    expect(s().unlinkClass(c)).toBe(false);
  });

  it('lifelines and objects linked to the class follow its name', () => {
    const user = cls('User');
    const seqId = s().addNode({ id: 'sq', type: 'sequence', position: { x: 0, y: 300 }, data: { label: 'S', accent: '#2f6fdb', participants: [{ id: 'p1', name: 'User', kind: 'participant' }, { id: 'p2', name: 'Other', kind: 'participant' }], items: [], autonumber: false } as never }) ?? 'sq';
    s().addNode({ id: 'ob', type: 'object', position: { x: 0, y: 500 }, data: { label: 'u1', className: 'User', slots: [], accent: '#888' } as never });
    expect(s().linkRefsToClass(user.id)).toBe(2);
    s().updateClass(user.id, (d) => ({ ...d, label: 'Account' }));
    const seq = sequenceOf(s().nodes.find((n) => n.id === (typeof seqId === 'string' ? seqId : 'sq'))!);
    expect(seq.participants.map((p) => p.name)).toEqual(['Account', 'Other']);
    expect(s().nodes.find((n) => n.id === 'ob')!.data.className).toBe('Account');
  });

  it('listModels shows one entry per model', () => {
    const first = s().activePageId;
    s().addLinkedClass({ pageId: first, nodeId: cls('User').id });
    const list = listModels({ nodes: s().nodes, stash: s().stash, pages: s().pages, activePageId: s().activePageId });
    expect(list.filter((e) => e.label === 'User')).toHaveLength(1);
    expect(list.map((e) => e.label).sort()).toEqual(['Order', 'User']);
  });

  it('survives validation, serialization and the DSL round trip', () => {
    const first = s().activePageId;
    const b = s().addLinkedClass({ pageId: first, nodeId: cls('User').id })!;
    const mid = modelIdOf(s().nodes.find((n) => n.id === b)!)!;
    const nodes = s().nodes;
    // the text format names classes uniquely per page: print a page with a single copy
    const ok = validateDiagram({ version: 1, nodes, edges: [] });
    expect(ok.ok).toBe(true);
    const bad = validateDiagram({ version: 1, nodes: nodes.map((n) => (n.id === b ? { ...n, data: { ...n.data, modelId: 5 } } : n)), edges: [] });
    expect(bad.ok).toBe(false);
    const page = { id: 'p', name: 'p', nodes: (JSON.parse(JSON.stringify(nodes)) as DiagramNode[]).filter((n) => n.id !== b), edges: [] };
    const text = printPage(page as never, 'T');
    expect(text).toContain(`model=${mid}`);
    const back = applyDsl(page as never, text, { layout: false }).page;
    expect(back.nodes.filter((n) => n.type === 'class' && n.data.modelId === mid)).toHaveLength(1);
    // removing the attribute in the text unlinks
    const stripped = text.split(` model=${mid}`).join('');
    const unl = applyDsl(page as never, stripped, { layout: false }).page;
    expect(unl.nodes.filter((n) => n.data.modelId === mid)).toHaveLength(0);
  });

  it('healStash makes other pages follow the active page', () => {
    const first = s().activePageId;
    s().addPage('Second');
    s().addLinkedClass({ pageId: first, nodeId: cls('User', first).id });
    const stale = { nodes: s().nodes.map((n) => (n.type === 'class' ? { ...n, data: { ...n.data, label: 'Old' } } : n)) as DiagramNode[], edges: [], past: [], future: [] };
    const healed = healStash({ nodes: s().nodes, stash: { [first]: stale } });
    expect(classOf(healed[first].nodes[0]).label).toBe('User');
    void base;
  });
});

describe('shared class model under Yjs', () => {
  it('a rename on one peer and a member edit on another merge on every copy; positions stay independent', async () => {
    s().reset();
    applyUmlModel((await importUmlText('export class User { name: string }', 'typescript')).model, 'page');
    const first = s().activePageId;
    const a = cls('User');
    s().addLinkedClass({ pageId: first, nodeId: a.id });
    const nodes0 = s().nodes;
    const mk = (nodes: DiagramNode[]): YProject => ({ version: 2, id: 'f', name: 'F', createdAt: 1, updatedAt: 1, activePageId: 'p1', pages: [{ id: 'p1', name: 'P', nodes: nodes as unknown as YEntity[], edges: [] }] });
    const d1 = new Y.Doc();
    writeProject(d1, mk(nodes0), 'seed');
    const d2 = new Y.Doc();
    Y.applyUpdate(d2, Y.encodeStateAsUpdate(d1));
    const [c1, c2] = nodes0.filter((n) => n.type === 'class');
    const mid = modelIdOf(c1)!;
    // peer 1: rename (propagated) and move copy 1
    const renamed = propagateNodes(nodes0.map((n) => (n.id === c1.id ? { ...n, data: { ...n.data, label: 'Member' }, position: { x: 7, y: 7 } } : n)), mid, { ...classOf(c1), label: 'Member' }, c1.id);
    writeProject(d1, mk(renamed), 'p1');
    // peer 2: add an attribute (propagated) and move copy 2
    const added = addMember(classOf(c2), 'attribute');
    const edited = propagateNodes(nodes0.map((n) => (n.id === c2.id ? { ...n, data: { ...n.data, attributes: added.attributes }, position: { x: 9, y: 9 } } : n)), mid, added, c2.id);
    writeProject(d2, mk(edited), 'p2');
    Y.applyUpdate(d2, Y.encodeStateAsUpdate(d1));
    Y.applyUpdate(d1, Y.encodeStateAsUpdate(d2));
    for (const d of [d1, d2]) {
      const out = readProject(d, { id: 'f' }).pages[0].nodes as unknown as DiagramNode[];
      const cs = out.filter((n) => n.type === 'class');
      expect(cs.map((n) => classOf(n).label)).toEqual(['Member', 'Member']);
      expect(cs.map((n) => classOf(n).attributes.length)).toEqual([2, 2]);
      expect(cs.every((n) => modelIdOf(n) === mid)).toBe(true);
      expect(cs.find((n) => n.id === c1.id)!.position).toEqual({ x: 7, y: 7 });
      expect(cs.find((n) => n.id === c2.id)!.position).toEqual({ x: 9, y: 9 });
    }
  });
});

describe('model links in the text format', () => {
  it('participants and objects keep model= through print and apply; actions unlink', () => {
    s().reset();
    const page = { id: 'p', name: 'p', edges: [], nodes: [
      { id: 'sq', type: 'sequence', position: { x: 0, y: 0 }, data: { label: 'S', accent: '#2f6fdb', autonumber: false, items: [], participants: [{ id: 'a', name: 'Account', kind: 'participant', modelId: 'm_acc' }, { id: 'b', name: 'B', kind: 'actor' }] } },
      { id: 'ob', type: 'object', position: { x: 0, y: 300 }, data: { label: 'x1', className: 'Account', modelId: 'm_acc', slots: [], accent: '#888' } },
    ] as DiagramNode[] };
    const text = printPage(page as never, 'T');
    expect(text).toContain('participant a as "Account" model=m_acc');
    expect(text).toContain('class=Account model=m_acc');
    const back = applyDsl({ ...page, nodes: [] } as never, text, { layout: false }).page;
    expect((back.nodes.find((n) => n.type === 'sequence')!.data as unknown as { participants: { modelId?: string }[] }).participants.map((p) => p.modelId)).toEqual(['m_acc', undefined]);
    expect(back.nodes.find((n) => n.type === 'object')!.data.modelId).toBe('m_acc');
    expect(validateDiagram({ version: 1, nodes: page.nodes, edges: [] }).ok).toBe(true);
    const bad = JSON.parse(JSON.stringify(page.nodes)) as DiagramNode[];
    (bad[0].data as unknown as { participants: { modelId: unknown }[] }).participants[0].modelId = 3;
    expect(validateDiagram({ version: 1, nodes: bad, edges: [] }).ok).toBe(false);
  });
});
