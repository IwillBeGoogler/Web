import { describe, expect, it } from 'vitest';
import { looksLikeDeploymentPlantuml, parseDeploymentPlantuml, renderDeploymentPlantuml } from './plantuml';
import type { DeploymentModel } from './types';

describe('renderDeploymentPlantuml', () => {
  it('blocks, stereotypes, links of each kind, dangling skipped, quotes escaped', () => {
    const model: DeploymentModel = {
      nodes: [
        { id: 'a', name: 'Se"rv\ner', kind: 'executionEnvironment', stereotype: 'jvm' },
        { id: 'b', name: 'B', kind: 'artifact', parent: 'a' },
        { id: 'c', name: 'C', kind: 'component', parent: 'gone' },
        { id: 'd', name: 'D', kind: 'device' },
      ],
      links: [
        { from: 'a', to: 'd', kind: 'communication', label: 'a"b' },
        { from: 'a', to: 'd', kind: 'communication' },
        { from: 'b', to: 'c', kind: 'manifest', label: 'x' },
        { from: 'b', to: 'c', kind: 'deploy' },
        { from: 'b', to: 'zzz', kind: 'deploy' },
      ],
    };
    const t = renderDeploymentPlantuml(model);
    expect(t).toContain("frame \"Se'rv er\" as D1 <<jvm>> {");
    expect(t).toContain('  artifact "B" as D2');
    expect(t).toContain('component "C" as D3\n');
    expect(t).toContain("D1 -- D4 : a'b");
    expect(t).toContain('D1 -- D4\n');
    expect(t).toContain('D2 ..> D3 : <<manifest>> x');
    expect(t).toContain('D2 ..> D3 : <<deploy>>\n');
    expect(t).not.toContain('zzz');
    expect(t.startsWith('@startuml\n')).toBe(true);
    expect(t.endsWith('@enduml\n')).toBe(true);
  });
});

describe('looksLikeDeploymentPlantuml', () => {
  it('detects', () => {
    expect(looksLikeDeploymentPlantuml('node a')).toBe(false);
    expect(looksLikeDeploymentPlantuml('@startuml\ndevice a\n@enduml')).toBe(true);
    expect(looksLikeDeploymentPlantuml('@startuml\nframe a\n@enduml')).toBe(true);
    expect(looksLikeDeploymentPlantuml('@startuml\nnode a\nartifact b\n@enduml')).toBe(true);
    expect(looksLikeDeploymentPlantuml('@startuml\nnode a\n@enduml')).toBe(false);
    expect(looksLikeDeploymentPlantuml('@startuml\nclass a\ndevice d\n@enduml')).toBe(false);
    expect(looksLikeDeploymentPlantuml('@startuml\n(use)\ndevice d\n@enduml')).toBe(false);
    expect(looksLikeDeploymentPlantuml('@startuml\n() i\ndevice d\n@enduml')).toBe(false);
    expect(looksLikeDeploymentPlantuml('@startuml\n[c]\ndevice d\n@enduml')).toBe(false);
    expect(looksLikeDeploymentPlantuml('@startuml\n[c] --> d\ndevice d\n@enduml')).toBe(false);
  });
});

describe('parseDeploymentPlantuml', () => {
  it('nesting, aliases, stereotypes, notes, comments, skipped lines', () => {
    const { model, warnings } = parseDeploymentPlantuml([
      "@startuml", "/' block\ncomment '/", "' line", 'skinparam x', 'title t',
      'note left of a : n', 'note over a', 'text in note', 'end note',
      'node "Web Server" as ws <<tomcat>> {', '  artifact app.war', '  component "Comp" as cp', '}',
      'device Phone', 'cloud Net', 'garbage here !!', '@enduml',
    ].join('\n'));
    expect(model.nodes.map((n) => [n.name, n.kind, n.parent && model.nodes.find((x) => x.id === n.parent)!.name, n.stereotype])).toEqual([
      ['Web Server', 'node', undefined, 'tomcat'],
      ['app', 'artifact', 'Web Server', undefined],
      ['Comp', 'component', 'Web Server', undefined],
      ['Phone', 'device', undefined, undefined],
      ['Net', 'node', undefined, undefined],
    ]);
    expect(warnings).toEqual(['Skipped: garbage here !!']);
  });
  it('re-declaration adopts parent only if none; reuses id', () => {
    const { model } = parseDeploymentPlantuml('node A\nnode B {\n  node A\n  node C {\n  node B\n}\n}');
    expect(model.nodes.find((n) => n.name === 'A')!.parent).toBe(model.nodes.find((n) => n.name === 'B')!.id);
    expect(model.nodes).toHaveLength(3);
    const b = model.nodes.find((n) => n.name === 'B')!;
    expect(b.parent).toBe(model.nodes.find((n) => n.name === 'C')!.id); // adopted by the block it is re-declared in
  });
  it('links: kinds, arrow direction, implicit nodes, stereotype tags', () => {
    const { model } = parseDeploymentPlantuml([
      'node A', 'artifact art', 'component comp',
      'A -- "B Q" : http',
      'A <-- art',
      'art ..> comp',
      'art ..> A',
      'A ..> comp : <<manifest>> txt',
      'A ..> comp : «deploy»',
      'A <.. comp',
      'A -> art : plain',
    ].join('\n'));
    const name = (id: string) => model.nodes.find((n) => n.id === id)!.name;
    const ls = model.links.map((l) => `${name(l.from)}>${name(l.to)}:${l.kind}:${l.label ?? ''}`);
    expect(ls).toEqual([
      'A>B Q:communication:http',
      'art>A:communication:',
      'art>comp:manifest:',
      'art>A:deploy:',
      'A>comp:manifest:txt',
      'A>comp:deploy:',
      'comp>A:deploy:',
      'A>art:communication:plain',
    ]);
    expect(model.nodes.some((n) => n.name === 'B Q')).toBe(true);
  });
  it('dotted into a non-artifact source maps to deploy', () => {
    const { model } = parseDeploymentPlantuml('component c\nartifact a\nc ..> a');
    expect(model.links[0].kind).toBe('deploy');
  });
});
