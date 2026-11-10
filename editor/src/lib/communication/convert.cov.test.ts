import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { objectModelToDiagram } from '../object/convert';
import { objectNode } from '../object/nodes';
import { sequenceNode } from '../seq/node';
import type { SequenceModel } from '../seq/types';
import { umlEdge } from '../uml/edges';
import { communicationToSequence, sequenceToCommunication } from './convert';

const rich: SequenceModel = {
  autonumber: false,
  participants: [{ id: 'a', name: 'A', kind: 'actor' }, { id: 'b', name: 'B', kind: 'participant' }],
  items: [
    { type: 'message', id: 'm1', from: 'a', to: 'b', text: 'x', kind: 'sync', activate: true },
    { type: 'message', id: 'm2', from: 'b', to: 'a', text: 'r', kind: 'return' },
    { type: 'message', id: 'm3', from: 'a', to: 'b', text: 'c', kind: 'create' },
    { type: 'message', id: 'm4', from: 'a', to: 'a', text: 'f', kind: 'async', ext: 'found' },
    { type: 'note', id: 'n1', text: 'n', over: ['a'] },
    { type: 'note', id: 'n2', text: 'n', over: ['b'] },
    { type: 'ref', id: 'r1', text: 'r', over: ['a'] },
    { type: 'ref', id: 'r2', text: 'r', over: ['a'] },
    { type: 'fragment', id: 'f1', op: 'alt', sections: [{ id: 's', guard: 'g', items: [{ type: 'message', id: 'm5', from: 'a', to: 'b', text: 'in', kind: 'destroy' }] }] },
    { type: 'fragment', id: 'f2', op: 'opt', sections: [{ id: 's', guard: 'g', items: [] }] },
  ],
};

describe('sequenceToCommunication lossy reports', () => {
  it('reports everything, plural forms', () => {
    const r = sequenceToCommunication(sequenceNode('s', { x: 0, y: 0 }, rich));
    const text = r.lossy.join('\n');
    expect(text).toContain('2 fragments');
    expect(text).toContain('2 notes dropped');
    expect(text).toContain('2 interaction uses');
    expect(text).toContain('1 return message became');
    expect(text).toContain('create / destroy');
    expect(text).toContain('1 found / lost message became');
    expect(text).toContain('activation bars lost');
    expect(text).toContain('icons lost');
    const links = r.diagram.edges.length;
    expect(links).toBe(2); // a-b, a-a
    const ab = r.diagram.edges[0].data!.uml as any;
    expect(ab.messages.map((m: any) => `${m.seq}:${m.dir}:${!!m.async}`)).toEqual(['1:fwd:false', '2:back:true', '3:fwd:false', '5:fwd:false']);
  });
  it('singular forms and clean case', () => {
    const one: SequenceModel = { autonumber: false, participants: [{ id: 'a', name: 'A', kind: 'participant' }, { id: 'b', name: 'B', kind: 'participant' }], items: [
      { type: 'note', id: 'n', text: 'n', over: ['a'] }, { type: 'ref', id: 'r', text: 'r', over: ['a'] },
      { type: 'fragment', id: 'f', op: 'loop', sections: [{ id: 's', guard: '', items: [] }] },
      { type: 'message', id: 'm', from: 'a', to: 'b', text: 'x', kind: 'sync' },
    ] };
    const t = sequenceToCommunication(sequenceNode('s', { x: 0, y: 0 }, one), { x: 5, y: 5 }).lossy.join('\n');
    expect(t).toContain('1 fragment (alt');
    expect(t).toContain('1 note dropped');
    expect(t).toContain('1 interaction use (ref)');
    const clean = sequenceToCommunication(sequenceNode('s', { x: 0, y: 0 }, { ...one, items: [one.items[3]] }));
    expect(clean.lossy).toEqual([]);
  });
  it('deactivate flag also reported', () => {
    const m: SequenceModel = { autonumber: false, participants: [{ id: 'a', name: 'A', kind: 'participant' }], items: [{ type: 'message', id: 'm', from: 'a', to: 'a', text: 'x', kind: 'sync', deactivate: true }] };
    expect(sequenceToCommunication(sequenceNode('s', { x: 0, y: 0 }, m)).lossy).toEqual(['activation bars lost']);
  });
});

describe('communicationToSequence', () => {
  it('orders by first message, converts dir/async, reports lossy', () => {
    const d = objectModelToDiagram({
      objects: [{ id: 'a', name: 'alpha', className: 'K', slots: [{ name: 's', value: '1' }] }, { id: 'b', name: 'beta', slots: [] }, { id: 'c', name: 'gamma', slots: [] }],
      links: [
        { from: 'b', to: 'c', messages: [{ id: 'm1', seq: '2', text: 'two', dir: 'back', async: true }, { id: 'm2', seq: '2.1', text: 'nested', dir: 'fwd' }] },
        { from: 'a', to: 'b', messages: [{ id: 'm3', seq: '1', text: 'one', dir: 'fwd' }], srcRole: 'r' },
        { from: 'a', to: 'c' },
      ],
    });
    const r = communicationToSequence(d.nodes, d.edges, 'Lbl', { x: 3, y: 4 });
    const model = r.node.data as unknown as SequenceModel;
    expect(model.participants.map((p) => p.name)).toEqual(['alpha', 'beta', 'gamma']);
    expect((model.items as any[]).map((i) => `${i.from}>${i.to}:${i.text}:${i.kind}`)).toEqual(['ob1>ob2:one:sync', 'ob3>ob2:two:async', 'ob2>ob3:nested:sync']);
    expect(r.node.position).toEqual({ x: 3, y: 4 });
    expect(r.diagram.nodes).toEqual([r.node]);
    const t = r.lossy.join('\n');
    expect(t).toContain('1 nested number ');
    expect(t).toContain('object slots dropped');
    expect(t).toContain('object classes dropped');
    expect(t).toContain('1 link without messages dropped');
    expect(t).toContain('link roles dropped');
  });
  it('no messages: all objects by x, falls back to id label; plural lossy', () => {
    const o1 = objectNode('o1', { x: 200, y: 0 }, 'right');
    const o2 = objectNode('o2', { x: 0, y: 0 }, '');
    const e1 = umlEdge('e1', 'o1', 'o2', { kind: 'link' }), e2 = umlEdge('e2', 'o2', 'o1', { kind: 'link', targetRole: 't' });
    const r = communicationToSequence([o1, o2, { id: 'x', type: 'class', position: { x: 0, y: 0 }, data: {} } as unknown as DiagramNode], [e1, e2]);
    const model = r.node.data as unknown as SequenceModel;
    expect(model.participants.map((p) => p.name)).toEqual(['o2', 'right']);
    expect(model.items).toEqual([]);
    expect(r.lossy.join('\n')).toContain('2 links without messages');
  });
  it('plural nested numbers; objects outside messages skipped when messages exist', () => {
    const d = objectModelToDiagram({
      objects: [{ id: 'a', name: 'a', slots: [] }, { id: 'b', name: 'b', slots: [] }, { id: 'c', name: 'c', slots: [] }],
      links: [{ from: 'a', to: 'b', messages: [{ id: 'x', seq: '1', text: 'x', dir: 'fwd' }, { id: 'y', seq: '1.1', text: 'y', dir: 'fwd' }, { id: 'z', seq: '1.2', text: 'z', dir: 'fwd' }] }],
    });
    const r = communicationToSequence(d.nodes, d.edges);
    expect((r.node.data as unknown as SequenceModel).participants.map((p) => p.name)).toEqual(['a', 'b']);
    expect(r.lossy.join('\n')).toContain('2 nested numbers');
  });
});
