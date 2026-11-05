import { describe, expect, it } from 'vitest';
import type { DiagramNode } from '../../types';
import { umlOf } from '../uml/edges';
import { componentNode } from '../uml2/nodes';
import type { ComponentData } from '../uml2/types';
import { componentModelToDiagram, diagramToComponentModel } from './convert';
import { layoutComponents } from './layout';
import { parseComponentPlantuml, renderComponentPlantuml } from './plantuml';
import { addPort, portOffsetPoint, removePort, spreadPorts, updatePort } from './ports';
import { nestInNode, tidyComponents, unnestComponents } from './tidy';
import type { ComponentModel } from './types';

const model: ComponentModel = {
  comps: [
    { id: 'dc', name: 'Data Center', kind: 'node', provides: [], requires: [] },
    { id: 'web', name: 'Web', kind: 'component', parent: 'dc', provides: [], requires: ['IOrders'] },
    { id: 'orders', name: 'Orders', kind: 'component', parent: 'dc', provides: ['IOrders'], requires: ['IPay', 'IStock'] },
    { id: 'pay', name: 'Payments', kind: 'component', stereotype: 'service', provides: ['IPay'], requires: [] },
    { id: 'jar', name: 'orders.jar', kind: 'artifact', provides: [], requires: [] },
  ],
  links: [{ from: 'orders', to: 'jar', kind: 'dependency', label: 'deployed as' }],
};

describe('interface ports', () => {
  it('spread evenly per side, add / update / remove keep ids', () => {
    let d: ComponentData = { label: 'A', compKind: 'component', accent: '#000' };
    d = addPort(d, 'provided', 'IA');
    d = addPort(d, 'provided', 'IB');
    d = addPort(d, 'required', 'IC');
    expect(d.ports!.map((p) => [p.id, p.side, p.offset])).toEqual([['p1', 'left', 1 / 3], ['p2', 'left', 2 / 3], ['p3', 'right', 0.5]]);
    d = updatePort(d, 'p3', { side: 'left' });
    expect(d.ports!.map((p) => p.offset)).toEqual([0.25, 0.5, 0.75]);
    d = removePort(d, 'p1');
    expect(d.ports!.map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(removePort(removePort(d, 'p2'), 'p3').ports).toBeUndefined();
    expect(spreadPorts([])).toEqual([]);
  });
  it('port points lie on the border', () => {
    expect(portOffsetPoint(100, 60, { side: 'left', offset: 0.5 })).toEqual({ x: 0, y: 30 });
    expect(portOffsetPoint(100, 60, { side: 'right', offset: 0.25 })).toEqual({ x: 100, y: 15 });
    expect(portOffsetPoint(100, 60, { side: 'top', offset: 0.5 })).toEqual({ x: 50, y: 0 });
    expect(portOffsetPoint(100, 60, { side: 'bottom', offset: 1 })).toEqual({ x: 100, y: 60 });
  });
});

describe('component model -> diagram', () => {
  const d = componentModelToDiagram(model);
  const by = (label: string) => d.nodes.find((n) => n.data.label === label)!;
  it('interfaces become ports on the component, a matching pair becomes an assembly between the ports', () => {
    const orders = by('Orders').data as unknown as ComponentData;
    expect(orders.ports!.map((p) => [p.name, p.kind, p.side])).toEqual([['IOrders', 'provided', 'left'], ['IPay', 'required', 'right'], ['IStock', 'required', 'right']]);
    expect(d.nodes.some((n) => n.data.compKind === 'provided' || n.data.compKind === 'required')).toBe(false);
    const asm = d.edges.filter((e) => umlOf(e)!.kind === 'assembly');
    expect(asm).toHaveLength(2); // Web -> Orders (IOrders), Orders -> Payments (IPay); nobody provides IStock
    const webOrders = asm.find((e) => e.source === by('Web').id)!;
    const web = by('Web').data as unknown as ComponentData;
    expect(umlOf(webOrders)).toMatchObject({ sourcePort: web.ports![0].id, targetPort: orders.ports![0].id });
    expect(d.edges.filter((e) => umlOf(e)!.kind === 'dependency')).toHaveLength(1);
  });
  it('nests components inside the node and sizes it around them', () => {
    const dc = by('Data Center');
    expect(dc.data.container).toBe(true);
    expect(by('Web').parentId).toBe(dc.id);
    expect(d.nodes.indexOf(dc)).toBeLessThan(d.nodes.indexOf(by('Web')));
    for (const k of ['Web', 'Orders']) {
      const c = by(k);
      expect(c.position.x).toBeGreaterThanOrEqual(0);
      expect(c.position.y).toBeGreaterThanOrEqual(40);
      expect(c.position.x + c.width!).toBeLessThanOrEqual(dc.width!);
      expect(c.position.y + c.height!).toBeLessThanOrEqual(dc.height!);
    }
  });
  it('lays clients left of their providers; ports make a component tall enough', () => {
    const boxes = layoutComponents(model);
    expect(boxes.get('web')!.x).toBeLessThan(boxes.get('orders')!.x);
    const dcBox = boxes.get('dc')!, payBox = boxes.get('pay')!;
    expect(payBox.x).toBeGreaterThan(dcBox.x + dcBox.w - 1);
    expect(by('Orders').height!).toBeGreaterThanOrEqual(72);
  });
  it('reading the diagram back gives the same model', () => {
    const back = diagramToComponentModel(d.nodes, d.edges);
    const orders = back.comps.find((c) => c.name === 'Orders')!;
    expect(orders.provides).toEqual(['IOrders']);
    expect(orders.requires).toEqual(['IPay', 'IStock']);
    expect(back.comps.find((c) => c.name === 'Web')!.parent).toBe(back.comps.find((c) => c.name === 'Data Center')!.id);
    expect(back.comps.find((c) => c.name === 'Payments')!.stereotype).toBe('service');
    expect(back.links).toHaveLength(1);
    expect(back.links[0]).toMatchObject({ kind: 'dependency', label: 'deployed as' });
  });
  it('old style free-standing interface nodes join as ports of the component', () => {
    const nodes: DiagramNode[] = [componentNode('c1', { x: 0, y: 0 }, 'component', 'Svc'), componentNode('i1', { x: 200, y: 0 }, 'provided', 'IApi')];
    const edges = [{ id: 'e', source: 'c1', target: 'i1', data: { uml: { kind: 'assembly' } } }] as never;
    expect(diagramToComponentModel(nodes, edges).comps[0].provides).toEqual(['IApi']);
  });
});

describe('component PlantUML', () => {
  it('round trips nesting, interfaces and links', () => {
    const text = renderComponentPlantuml(model);
    expect(text).toContain('node "Data Center" as C1 {');
    expect(text).toContain('C3 - I1');
    expect(text).toContain('C3 ..> I2');
    const { model: back, warnings } = parseComponentPlantuml(text);
    expect(warnings).toEqual([]);
    const c = (n: string) => back.comps.find((x) => x.name === n)!;
    expect(c('Data Center').kind).toBe('node');
    expect(c('Web').parent).toBe(c('Data Center').id);
    expect(c('Orders').provides).toEqual(['IOrders']);
    expect(c('Orders').requires).toEqual(['IPay', 'IStock']);
    expect(c('Payments').stereotype).toBe('service');
    expect(c('orders.jar').kind).toBe('artifact');
    expect(back.links).toEqual([{ from: c('Orders').id, to: c('orders.jar').id, kind: 'dependency', label: 'deployed as' }]);
  });
  it('reads hand-written PlantUML (lollipop, socket, dependency, undeclared interface)', () => {
    const { model: m, warnings } = parseComponentPlantuml(`@startuml
package "Frontend" {
  [Browser UI] as ui
}
node server {
  component [API] as api
  [DB Access]
}
interface HTTP
() "SQL" as sql
api - HTTP
ui ..> HTTP
[DB Access] -( sql
api -- [DB Access]
ui --> api : calls
api - Metrics
@enduml`);
    expect(warnings).toEqual([]);
    const c = (n: string) => m.comps.find((x) => x.name === n)!;
    expect(c('API').provides).toEqual(['HTTP', 'Metrics']);
    expect(c('Browser UI').requires).toEqual(['HTTP']);
    expect(c('DB Access').requires).toEqual(['SQL']);
    expect(c('DB Access').parent).toBe(c('server').id);
    expect(c('Browser UI').parent).toBe(c('Frontend').id);
    expect(m.links.map((l) => [l.kind, l.label])).toEqual([['assembly', undefined], ['dependency', 'calls']]);
  });
});

describe('Tidy, nest, unnest', () => {
  const d = componentModelToDiagram(model);
  it('tidy re-lays out and keeps ports', () => {
    const messy = d.nodes.map((n) => ({ ...n, position: n.parentId ? { x: 3, y: 3 } : { x: 5, y: 5 } }));
    const r = tidyComponents(messy, d.edges)!;
    expect(r.count).toBe(5);
    const web = r.nodes.find((n) => n.data.label === 'Web')!, orders = r.nodes.find((n) => n.data.label === 'Orders')!;
    expect(web.position.x).toBeLessThan(orders.position.x);
    expect(web.data.ports).toEqual(d.nodes.find((n) => n.data.label === 'Web')!.data.ports);
    expect(tidyComponents([], [])).toBeNull();
  });
  it('nest wraps top level components in a container, unnest takes them out again', () => {
    const a = componentNode('a', { x: 100, y: 100 }, 'component', 'A'), b = componentNode('b', { x: 400, y: 160 }, 'component', 'B');
    const nested = nestInNode([a, b], ['a', 'b'], 'box')!;
    const box = nested.find((n) => n.id === 'box')!;
    expect(box.data).toMatchObject({ compKind: 'node', container: true });
    expect(nested.indexOf(box)).toBeLessThan(nested.findIndex((n) => n.id === 'a'));
    const na = nested.find((n) => n.id === 'a')!;
    expect(na.parentId).toBe('box');
    expect(box.position.x + na.position.x).toBe(100);
    expect(box.width!).toBeGreaterThan(400 + b.width! - 100);
    const out = unnestComponents(nested, ['a', 'b'])!;
    expect(out.find((n) => n.id === 'a')).toMatchObject({ position: { x: 100, y: 100 } });
    expect(out.find((n) => n.id === 'a')!.parentId).toBeUndefined();
    expect(out.find((n) => n.id === 'box')!.data.container).toBeUndefined();
    expect(nestInNode([a], ['nothing'], 'x')).toBeNull();
  });
});
