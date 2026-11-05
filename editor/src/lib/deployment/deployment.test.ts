import { describe, expect, it } from 'vitest';
import { umlOf } from '../uml/edges';
import { defaultRelation } from '../uml2/nodes';
import { parseDiagram } from '../serialization';
import { deploymentModelToDiagram, diagramToDeploymentModel } from './convert';
import { layoutDeployment } from './layout';
import { deploymentNode } from './nodes';
import { looksLikeDeploymentPlantuml, parseDeploymentPlantuml, renderDeploymentPlantuml } from './plantuml';
import { tidyDeployment } from './tidy';
import type { DeploymentModel } from './types';
import { detectDiagramKind, importDiagramText } from '../uml2/importAny';

const model: DeploymentModel = {
  nodes: [
    { id: 'phone', name: 'Phone', kind: 'device', stereotype: 'mobile' },
    { id: 'app', name: 'app.apk', kind: 'artifact', parent: 'phone' },
    { id: 'srv', name: 'Server', kind: 'node', iconId: 'cdn' },
    { id: 'env', name: 'Tomcat', kind: 'executionEnvironment', parent: 'srv' },
    { id: 'war', name: 'shop.war', kind: 'artifact', parent: 'env' },
    { id: 'shop', name: 'Shop', kind: 'component', parent: 'env' },
  ],
  links: [
    { from: 'phone', to: 'srv', kind: 'communication', label: 'HTTPS' },
    { from: 'war', to: 'srv', kind: 'deploy' },
    { from: 'war', to: 'shop', kind: 'manifest' },
  ],
};

describe('deployment model <-> diagram', () => {
  const d = deploymentModelToDiagram(model);
  it('builds nested 3D boxes with sizes and container flags', () => {
    expect(d.nodes).toHaveLength(6);
    const by = (label: string) => d.nodes.find((n) => n.data.label === label)!;
    expect(by('Phone')).toMatchObject({ type: 'deployment', data: { depKind: 'device', container: true, stereotype: 'mobile' } });
    expect(by('Server').data.iconId).toBe('cdn');
    expect(by('Tomcat').parentId).toBe(by('Server').id);
    expect(d.nodes.indexOf(by('Server'))).toBeLessThan(d.nodes.indexOf(by('Tomcat')));
    expect(by('Server').width!).toBeGreaterThanOrEqual(by('Tomcat').width!);
    expect(by('app.apk')).toMatchObject({ width: 130, height: 72 });
  });
  it('edges carry the protocol and the kind with default stereotypes', () => {
    expect(d.edges.map((e) => [umlOf(e)!.kind, e.label])).toEqual([['communication', 'HTTPS'], ['deploy', '«deploy»'], ['manifest', '«manifest»']]);
    expect(d.edges[1].data).toMatchObject({ dashed: true, endMarker: 'open' });
    expect(d.edges[0].data).toMatchObject({ dashed: false, endMarker: 'none' });
  });
  it('round trips through the diagram', () => {
    const back = diagramToDeploymentModel(d.nodes, d.edges);
    const row = (n: { name: string; kind: string; stereotype?: string; iconId?: string; parent?: string }) => JSON.stringify([n.name, n.kind, n.stereotype, n.iconId, !!n.parent]);
    expect(back.nodes.map(row).sort()).toEqual(model.nodes.map(row).sort());
    expect(back.links.map((l) => [l.kind, l.label])).toEqual([['communication', 'HTTPS'], ['deploy', undefined], ['manifest', undefined]]);
  });
  it('is accepted by the file parser (node kind, relation kinds)', () => {
    const r = parseDiagram(JSON.stringify(d));
    expect(r.ok ? '' : r.error).toBe('');
    expect(parseDiagram(JSON.stringify({ ...d, nodes: [{ ...d.nodes[0], data: { label: 'x' } }] })).ok).toBe(false);
  });
  it('drag defaults: artifact to component manifests, artifact to node deploys, else communication', () => {
    const [a, c, n1, n2] = [deploymentNode('a', { x: 0, y: 0 }, 'artifact'), deploymentNode('c', { x: 0, y: 0 }, 'component'), deploymentNode('n1', { x: 0, y: 0 }), deploymentNode('n2', { x: 0, y: 0 }, 'device')];
    expect(defaultRelation(a, c)).toBe('manifest');
    expect(defaultRelation(a, n1)).toBe('deploy');
    expect(defaultRelation(n1, n2)).toBe('communication');
  });
});

describe('deployment layout and tidy', () => {
  it('lays nested boxes inside their container, left to right along the paths', () => {
    const boxes = layoutDeployment(model);
    const env = boxes.get('env')!, war = boxes.get('war')!, srv = boxes.get('srv')!, phone = boxes.get('phone')!;
    expect(war.x).toBeGreaterThanOrEqual(0);
    expect(war.x + war.w).toBeLessThanOrEqual(env.w);
    expect(env.x + env.w).toBeLessThanOrEqual(srv.w);
    expect(phone.x + phone.w).toBeLessThan(srv.x);
  });
  it('tidy keeps data and sizes containers around their content; null when empty', () => {
    const d = deploymentModelToDiagram(model);
    const messy = d.nodes.map((n) => ({ ...n, position: { x: 3, y: 3 } }));
    const r = tidyDeployment(messy, d.edges)!;
    expect(r.count).toBe(6);
    const by = (label: string) => r.nodes.find((n) => n.data.label === label)!;
    expect(by('Phone').position.x).toBeLessThan(by('Server').position.x);
    expect(by('Server').data.container).toBe(true);
    expect(by('Shop').data).toEqual(d.nodes.find((n) => n.data.label === 'Shop')!.data);
    expect(tidyDeployment([], [])).toBeNull();
  });
});

describe('deployment PlantUML', () => {
  it('renders node / device / frame / artifact blocks and stereotyped links', () => {
    const text = renderDeploymentPlantuml(model);
    expect(text).toContain('device "Phone" as D1 <<mobile>> {');
    expect(text).toContain('artifact "app.apk" as D2');
    expect(text).toContain('frame "Tomcat" as D4 {');
    expect(text).toContain('D1 -- D3 : HTTPS');
    expect(text).toContain('D5 ..> D3 : <<deploy>>');
    expect(text).toContain('D5 ..> D6 : <<manifest>>');
    expect(looksLikeDeploymentPlantuml(text)).toBe(true);
  });
  it('round trips', () => {
    const { model: back, warnings } = parseDeploymentPlantuml(renderDeploymentPlantuml(model));
    expect(warnings).toEqual([]);
    const c = (n: string) => back.nodes.find((x) => x.name === n)!;
    expect(c('Phone')).toMatchObject({ kind: 'device', stereotype: 'mobile' });
    expect(c('app.apk').parent).toBe(c('Phone').id);
    expect(c('Tomcat')).toMatchObject({ kind: 'executionEnvironment', parent: c('Server').id });
    expect(c('Shop').kind).toBe('component');
    expect(back.links.map((l) => [l.kind, l.label])).toEqual([['communication', 'HTTPS'], ['deploy', undefined], ['manifest', undefined]]);
  });
  it('reads hand-written PlantUML (cloud / database, dotted, reversed arrows)', () => {
    const { model: m, warnings } = parseDeploymentPlantuml(`@startuml
node "Web" as web {
  artifact "site.zip" as site
}
database "DB" as db
component "Shop" as shop
web -- db : JDBC
db <.. site
site ..> shop
web -> db
@enduml`);
    expect(warnings).toEqual([]);
    expect(m.nodes.map((n) => n.kind)).toEqual(['node', 'artifact', 'node', 'component']);
    expect(m.links.map((l) => [l.kind, l.label])).toEqual([['communication', 'JDBC'], ['deploy', undefined], ['manifest', undefined], ['communication', undefined]]);
    expect(m.links[1]).toMatchObject({ from: m.nodes[1].id, to: m.nodes[2].id });
  });
  it('is detected by the importer; component diagrams keep going to the component importer', () => {
    expect(detectDiagramKind(renderDeploymentPlantuml(model))).toBe('deployment');
    const imp = importDiagramText('@startuml\ndevice "Phone" as p\nnode "Srv" as s\np -- s : TLS\n@enduml')!;
    expect(imp.kind).toBe('deployment');
    expect(detectDiagramKind('@startuml\ncomponent [A]\nnode "N" {\n  [B]\n}\n@enduml')).toBe('component');
    expect(detectDiagramKind('@startuml\ninterface I\nnode N\nartifact a\n@enduml')).not.toBe('deployment');
  });
});

describe('nest / unnest', () => {
  it('wraps top level elements in a node container and takes them out again', async () => {
    const { nestInDeploymentNode, unnestDeployment } = await import('./tidy');
    const a = deploymentNode('a', { x: 100, y: 100 }, 'artifact', 'A'), b = deploymentNode('b', { x: 400, y: 160 }, 'component', 'B');
    const nested = nestInDeploymentNode([a, b], ['a', 'b'], 'box')!;
    const box = nested.find((n) => n.id === 'box')!;
    expect(box.data).toMatchObject({ depKind: 'node', container: true });
    expect(nested.indexOf(box)).toBeLessThan(nested.findIndex((n) => n.id === 'a'));
    const na = nested.find((n) => n.id === 'a')!;
    expect(na.parentId).toBe('box');
    expect(box.position.x + na.position.x).toBe(100);
    const out = unnestDeployment(nested, ['a', 'b'])!;
    expect(out.find((n) => n.id === 'a')).toMatchObject({ position: { x: 100, y: 100 } });
    expect(out.find((n) => n.id === 'box')!.data.container).toBeUndefined();
    expect(nestInDeploymentNode([a], ['nothing'], 'x')).toBeNull();
  });
});

describe('container header', () => {
  it('leaves room for the stereotype line above the children', () => {
    const m: DeploymentModel = { nodes: [{ id: 'p', name: 'Phone', kind: 'device', stereotype: 'mobile' }, { id: 'a', name: 'app.apk', kind: 'artifact', parent: 'p' }, { id: 'n', name: 'Plain', kind: 'node' }, { id: 'b', name: 'b.jar', kind: 'artifact', parent: 'n' }], links: [] };
    const boxes = layoutDeployment(m);
    expect(boxes.get('a')!.y).toBeGreaterThanOrEqual(58); // «mobile» + name + the 3D top face
    expect(boxes.get('b')!.y).toBe(44); // a plain node shows only its name
  });
});
