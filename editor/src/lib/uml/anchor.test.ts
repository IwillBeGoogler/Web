import { describe, expect, it } from 'vitest';
import { modelToDiagram } from './convert';
import { umlOf } from './edges';
import { classOf } from './geometry';
import type { UmlModel } from './model';

const model: UmlModel = {
  classes: [
    { name: 'Order', kind: 'class', attributes: [{ visibility: '-', name: 'id', type: 'string' }, { visibility: '-', name: 'customer', type: 'Customer' }, { visibility: '-', name: 'lines', type: 'Line[]' }], operations: [] },
    { name: 'Customer', kind: 'class', attributes: [], operations: [] },
    { name: 'Line', kind: 'class', attributes: [], operations: [] },
    { name: 'Base', kind: 'class', attributes: [], operations: [] },
  ],
  relations: [
    { from: 'Order', to: 'Customer', kind: 'association', directed: true, toMult: '1', toRole: 'customer' },
    { from: 'Order', to: 'Line', kind: 'association', directed: true, toMult: '*', toRole: 'lines' },
    { from: 'Order', to: 'Base', kind: 'inheritance' },
    { from: 'Order', to: 'Customer', kind: 'dependency' },
  ],
};
describe('association anchoring at attribute rows', () => {
  const d = modelToDiagram(model);
  const order = d.nodes.find((n) => classOf(n).label === 'Order')!;
  const attr = (name: string) => classOf(order).attributes.find((a) => a.name === name)!.id;
  it('an association whose role names an attribute of the source records that row', () => {
    const toCustomer = d.edges.find((e) => umlOf(e)!.kind === 'association' && umlOf(e)!.targetRole === 'customer')!;
    expect(umlOf(toCustomer)!.sourceMember).toBe(attr('customer'));
    const toLines = d.edges.find((e) => umlOf(e)!.targetRole === 'lines')!;
    expect(umlOf(toLines)!.sourceMember).toBe(attr('lines'));
  });
  it('other relation kinds and associations without a matching attribute are not anchored', () => {
    for (const e of d.edges) if (umlOf(e)!.kind !== 'association') expect(umlOf(e)!.sourceMember).toBeUndefined();
    const m2 = modelToDiagram({ ...model, relations: [{ from: 'Order', to: 'Customer', kind: 'association', toRole: 'nothing' }] });
    expect(umlOf(m2.edges[0])!.sourceMember).toBeUndefined();
  });
});
