import { describe, expect, it } from 'vitest';
import { applyDsl, pageToDsl } from '@core/dsl';
import { lintPage } from '@core/lint';
import type { CPage } from '@core/types';
import { validateDiagram } from '../serialization';
import { blankClass } from '../uml/geometry';
import { instantiateClass } from '../object/nodes';
import { diagramToObjectModel, objectModelToDiagram, tidyObjects } from '../object/convert';
import { parseObjectPlantuml, renderObjectPlantuml, looksLikeObjectPlantuml } from '../object/plantuml';
import { diagramToPackageModel, packageModelToDiagram } from '../package/convert';
import { parsePackagePlantuml, renderPackagePlantuml, looksLikePackagePlantuml } from '../package/plantuml';
import { tidyPackages, nestInPackage } from '../package/tidy';
import { importDiagramText } from '../uml2/importAny';
import { useDiagramStore } from '../../store/diagramStore';

const PKG = `classes {
  package web "Web" {
    class Ctl
  }
  package domain "Domain" {
    class Order
  }
}
packages {
  web imports domain
  web access domain "uses"
  domain merges web
  web ..> domain
}
`;
const OBJ = `classes {
  class Customer {
    - name: String
  }
}
objects {
  object alice "alice" class=Customer {
    name = "Alice"
    phone = 1
  }
  object bob class=Customer
  alice -- bob "friend" srcRole=a dstRole=b
}
`;
const build = (t: string) => applyDsl(undefined, t, { layout: false });
const errors = (t: string) => build(t).diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);

describe('.sdd packages block (a view over the class packages)', () => {
  it('builds package relations between the class packages and round trips', () => {
    const r = build(PKG);
    expect(errors(PKG)).toEqual([]);
    const kinds = r.page.edges.map((e) => e.data!.uml.kind);
    expect(kinds).toEqual(['import', 'access', 'merge', 'dependency']);
    expect(r.page.edges[0]).toMatchObject({ source: 'web', target: 'domain', label: '«import»', data: { dashed: true, endMarker: 'open' } });
    expect(r.page.edges[1].label).toBe('uses');
    const printed = pageToDsl(r.page);
    expect(printed).toContain('packages {');
    expect(printed).toContain('web imports domain');
    expect(printed).toContain('web access domain "uses"');
    expect(printed).toContain('web ..> domain');
    expect(pageToDsl(build(printed).page)).toBe(printed);
  });
  it('declares packages itself and reports bad references', () => {
    const t = `packages {\n  package a "A" {\n    package b "B"\n  }\n  a imports b\n  a imports ghost\n  frob\n}\n`;
    const r = build(t);
    expect(r.page.nodes.find((n) => n.id === 'b')).toMatchObject({ type: 'group', parentId: 'a', data: { variant: 'package' } });
    expect(r.diagnostics.map((d) => d.message).join('|')).toContain('unknown package "ghost"');
    expect(r.diagnostics.map((d) => d.message).join('|')).toContain('unknown statement "frob" in packages');
  });
});

describe('.sdd objects block', () => {
  it('builds objects with slots, class names and links, and round trips', () => {
    const r = build(OBJ);
    expect(errors(OBJ)).toEqual([]);
    const alice = r.page.nodes.find((n) => n.id === 'alice')!;
    expect(alice).toMatchObject({ type: 'object', data: { label: 'alice', className: 'Customer', slots: [{ id: 's0', name: 'name', value: '"Alice"' }, { id: 's1', name: 'phone', value: '1' }] } });
    expect(r.page.edges.find((e) => e.data?.uml?.kind === 'link')).toMatchObject({ label: 'friend', data: { uml: { sourceRole: 'a', targetRole: 'b' }, endMarker: 'none' } });
    const printed = pageToDsl(r.page);
    expect(pageToDsl(build(printed).page)).toBe(printed);
  });
  it('keeps slot ids when the text is edited', () => {
    const first = build(OBJ).page;
    const again = applyDsl(first, OBJ.replace('name = "Alice"', 'phone = 2\n    name = "Al"').replace('    phone = 1\n', ''), { layout: false }).page;
    const slots = again.nodes.find((n) => n.id === 'alice')!.data.slots;
    expect(slots).toEqual([{ id: 's1', name: 'phone', value: '2' }, { id: 's0', name: 'name', value: '"Al"' }]);
  });
  it('reports errors', () => {
    expect(errors('objects {\n  object o {\n    = x\n  }\n  o -- ghost\n  frob\n}\n').join('|')).toMatch(/expected a slot.*unknown statement "frob" in objects.*unknown object "ghost"/s);
  });
});

describe('lint: object slot not in its class', () => {
  it('warns for slots the class (own or inherited) does not have', () => {
    const page = build(OBJ).page;
    const p = lintPage(page).filter((x) => x.rule === 'uml/object-unknown-slot');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ severity: 'warning', nodeIds: ['alice', 'cls-customer'] });
    expect(p[0].message).toContain('slot "phone"');
    const fixed = build(OBJ.replace('- name: String', '- name: String\n    - phone: int')).page;
    expect(lintPage(fixed).filter((x) => x.rule === 'uml/object-unknown-slot')).toEqual([]);
  });
});

describe('object diagram', () => {
  it('instantiate makes an object with an empty slot per attribute', () => {
    const cls = blankClass('c', { x: 0, y: 0 }, 'class', 'OrderItem');
    cls.data.attributes = [{ id: 'a0', visibility: '-', name: 'qty', type: 'int' }, { id: 'a1', visibility: '-', name: 'sku', type: 'String' }];
    const o = instantiateClass(cls, 'o', new Set(['orderItem']));
    expect(o).toMatchObject({ type: 'object', data: { label: 'orderItem1', className: 'OrderItem', slots: [{ name: 'qty', value: '' }, { name: 'sku', value: '' }] } });
    const s = useDiagramStore;
    s.setState({ nodes: [{ ...cls, selected: true }], edges: [] });
    const ids = s.getState().instantiateClasses();
    expect(ids).toHaveLength(1);
    expect(s.getState().nodes.find((n) => n.id === ids[0])!.data.className).toBe('OrderItem');
  });
  it('PlantUML round trip', () => {
    const m = { objects: [{ id: 'a', name: 'alice', className: 'User', slots: [{ name: 'age', value: '3' }] }, { id: 'b', name: 'bob', slots: [] }], links: [{ from: 'a', to: 'b', label: 'knows' }] };
    const text = renderObjectPlantuml(m);
    expect(looksLikeObjectPlantuml(text)).toBe(true);
    const back = parseObjectPlantuml(text);
    expect(back.warnings).toEqual([]);
    expect(back.model.objects.map((o) => [o.name, o.className, o.slots.length])).toEqual([['alice', 'User', 1], ['bob', undefined, 0]]);
    expect(back.model.links).toMatchObject([{ label: 'knows' }]);
    expect(importDiagramText(text)?.kind).toBe('object');
  });
  it('diagram <-> model, tidy and serialization', () => {
    const d = objectModelToDiagram({ objects: [{ id: 'a', name: 'a', slots: [] }, { id: 'b', name: 'b', slots: [{ name: 'x', value: '1' }] }], links: [{ from: 'a', to: 'b', srcRole: 'r' }] });
    expect(diagramToObjectModel(d.nodes, d.edges).links).toEqual([{ from: 'ob1', to: 'ob2', srcRole: 'r' }]);
    expect(tidyObjects(d.nodes, d.edges)?.count).toBe(2);
    expect(validateDiagram(d).ok).toBe(true);
    const bad = { ...d, nodes: [{ ...d.nodes[0], data: { ...d.nodes[0].data, slots: [{ id: 's', name: 'x', value: 1 }] } }] };
    expect(validateDiagram(bad as never).ok).toBe(false);
  });
});

describe('package diagram', () => {
  it('model <-> diagram keeps the class packages and relations', () => {
    const m = { packages: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', parent: 'a' }, { id: 'c', name: 'C' }], classes: [{ id: 'k', name: 'K', kind: 'class' as const, parent: 'b' }], links: [{ from: 'a', to: 'c', kind: 'import' as const }, { from: 'b', to: 'c', kind: 'dependency' as const }] };
    const d = packageModelToDiagram(m);
    expect(d.nodes.filter((n) => n.type === 'group').every((n) => n.data.variant === 'package')).toBe(true);
    expect(d.nodes.find((n) => n.type === 'class')!.parentId).toBeTruthy();
    const back = diagramToPackageModel(d.nodes, d.edges);
    expect(back.packages).toHaveLength(3);
    expect(back.links.map((l) => l.kind)).toEqual(['import', 'dependency']);
    expect(validateDiagram(d).ok).toBe(true);
  });
  it('tidy puts dependents above their dependencies and nests', () => {
    const d = packageModelToDiagram({ packages: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], classes: [], links: [{ from: 'a', to: 'b', kind: 'import' }, { from: 'b', to: 'c', kind: 'access' }] });
    const r = tidyPackages(d.nodes, d.edges)!;
    const y = (id: string) => r.nodes.find((n) => n.id === id)!.position.y;
    expect(y('pk1')).toBeLessThan(y('pk2'));
    expect(y('pk2')).toBeLessThan(y('pk3'));
    const nested = nestInPackage(r.nodes, ['pk1', 'pk2'], 'box')!;
    expect(nested.find((n) => n.id === 'pk1')!.parentId).toBe('box');
  });
  it('PlantUML round trip and detection', () => {
    const m = { packages: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', parent: 'a' }, { id: 'c', name: 'C' }], classes: [{ id: 'k', name: 'K', kind: 'class' as const, parent: 'b' }], links: [{ from: 'a', to: 'c', kind: 'import' as const }, { from: 'b', to: 'c', kind: 'merge' as const, label: 'x' }, { from: 'a', to: 'b', kind: 'dependency' as const }] };
    const text = renderPackagePlantuml(m);
    expect(looksLikePackagePlantuml(text)).toBe(true);
    const back = parsePackagePlantuml(text);
    expect(back.warnings).toEqual([]);
    expect(back.model.packages.map((p) => [p.name, !!p.parent])).toEqual([['A', false], ['B', true], ['C', false]]);
    expect(back.model.classes).toMatchObject([{ name: 'K', kind: 'class' }]);
    expect(back.model.links.map((l) => [l.kind, l.label])).toEqual([['import', undefined], ['merge', 'x'], ['dependency', undefined]]);
    expect(importDiagramText(text)?.kind).toBe('package');
    expect(looksLikePackagePlantuml('@startuml\npackage a {\n class X\n}\n@enduml')).toBe(false);
  });
});

void ({} as CPage);
