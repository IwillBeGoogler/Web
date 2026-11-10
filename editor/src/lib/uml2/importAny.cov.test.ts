import { describe, expect, it } from 'vitest';
import { applyDiagramModel, describeImport, detectDiagramKind, importDiagramText, type AnyImport } from './importAny';
import { useDiagramStore } from '../../store/diagramStore';

const T = {
  timing: '@startuml\nrobust "Web" as W\nconcise "User" as U\n@0\nW is Idle\nU is Idle\n@100\nW is Busy\n@enduml',
  object: '@startuml\nobject a\nobject b\na -- b : link\n@enduml',
  comm: '@startuml\nobject a\nobject b\na -- b : 1: go\n@enduml',
  pkg: '@startuml\npackage app {\n  class A\n}\npackage lib {\n  class B\n}\napp ..> lib : <<import>>\n@enduml',
  act: '@startuml\nstart\n:do it;\nstop\n@enduml',
  actMmd: 'flowchart TD\n  s(((" "))):::initial --> a[Do]\n  a --> e((("e"))):::final',
  state: '@startuml\n[*] --> A\nA --> B : go\n@enduml',
  stateMmd: 'stateDiagram-v2\n  [*] --> A\n  A --> B : go',
  uc: '@startuml\nactor U\nusecase (Login) as L\nU --> L\n@enduml',
  ucMmd: 'flowchart LR\n  U{{User}}:::actor --> L([Login])',
  dep: '@startuml\ndevice "Phone" as p\nnode "Srv" as s\np -- s : TLS\n@enduml',
  comp: '@startuml\ncomponent [A]\ncomponent [B]\n[A] --> [B]\n@enduml',
  seq: 'sequenceDiagram\n  A->>B: hi',
};

describe('detect + import every kind', () => {
  const cases: [string, string, string][] = [
    ['timing', T.timing, 'plantuml'], ['object', T.object, 'plantuml'], ['package', T.pkg, 'plantuml'],
    ['activity', T.act, 'plantuml'], ['activity', T.actMmd, 'mermaid'], ['state', T.state, 'plantuml'], ['state', T.stateMmd, 'mermaid'],
    ['usecase', T.uc, 'plantuml'], ['usecase', T.ucMmd, 'mermaid'], ['deployment', T.dep, 'plantuml'], ['component', T.comp, 'plantuml'], ['sequence', T.seq, 'mermaid'],
  ];
  for (const [kind, text, fmt] of cases) {
    it(`${kind} (${fmt})`, () => {
      expect(detectDiagramKind(text)).toBe(kind);
      const r = importDiagramText(text)!;
      expect(r.kind).toBe(kind);
      expect(r.format).toBe(fmt);
      expect(Array.isArray(r.warnings)).toBe(true);
    });
  }
});

describe('describeImport', () => {
  it('describes each kind with counts', () => {
    const d = (t: string) => describeImport(importDiagramText(t)!);
    expect(d(T.seq)).toMatchObject({ title: 'Sequence diagram (Mermaid)', noun: 'sequence diagram', size: 2 });
    expect(d(T.state)).toMatchObject({ title: 'State machine (PlantUML)', counts: [expect.stringContaining('states'), expect.stringContaining('transitions')] });
    expect(d(T.uc).counts).toHaveLength(3);
    expect(d(T.act).title).toBe('Activity diagram (PlantUML)');
    expect(d(T.dep)).toMatchObject({ title: 'Deployment diagram (PlantUML)', name: 'Imported deployment' });
    expect(d(T.pkg)).toMatchObject({ title: 'Package diagram (PlantUML)', name: 'Imported packages' });
    expect(d(T.object)).toMatchObject({ title: 'Object diagram (PlantUML)', name: 'Imported objects' });
    expect(d(T.timing)).toMatchObject({ title: 'Timing diagram (PlantUML)', name: 'Imported timing' });
    expect(d(T.comp)).toMatchObject({ title: 'Component diagram (PlantUML)', name: 'Imported components' });
  });
  it('object diagram with numbered messages becomes communication', () => {
    const base = importDiagramText(T.object)! as Extract<AnyImport, { kind: 'object' }>;
    const withMsgs: AnyImport = { ...base, model: { ...base.model, links: base.model.links.map((l) => ({ ...l, messages: [{ text: 'go' }, { text: 'back' }] as never })) } };
    expect(describeImport(withMsgs)).toMatchObject({ title: 'Communication diagram (PlantUML)', name: 'Imported communication', counts: ['2 objects', '2 numbered messages'] });
  });
});

describe('applyDiagramModel', () => {
  it('inserts every kind into the page and reports node count', () => {
    for (const t of [T.seq, T.state, T.uc, T.act, T.comp, T.dep, T.pkg, T.object, T.timing]) {
      const r = importDiagramText(t)!;
      const before = useDiagramStore.getState().nodes.length;
      const n = applyDiagramModel(r, 'page', 'X');
      expect(n).toBeGreaterThan(0);
      expect(useDiagramStore.getState().nodes.length).toBeGreaterThan(before);
    }
  });
  it('newfile target does not insert into the current page', () => {
    const r = importDiagramText(T.state)!;
    const before = useDiagramStore.getState().nodes.length;
    const n = applyDiagramModel(r, 'newfile', 'Fresh');
    expect(n).toBeGreaterThan(0);
    expect(useDiagramStore.getState().nodes.length).toBe(before);
  });
});
