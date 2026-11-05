import { describe, expect, it } from 'vitest';
import { applyDiagramModel, detectDiagramKind, importDiagramText, sequenceToDiagram } from './importAny';
import { useDiagramStore } from '../../store/diagramStore';

const SEQ = 'sequenceDiagram\n  participant A\n  participant B\n  A->>B: hi\n  B-->>A: yo\n';
const PUML_SEQ = '@startuml\nactor User\nUser -> API : go\nAPI --> User : ok\n@enduml\n';
const PUML_CLASS = '@startuml\nclass A\nclass B\nA <|-- B\n@enduml\n';
const STATE = 'stateDiagram-v2\n  [*] --> A\n  A --> B : go\n';

describe('diagram kind detection', () => {
  it('finds sequence and state diagrams, leaves class diagrams alone', () => {
    expect(detectDiagramKind(SEQ)).toBe('sequence');
    expect(detectDiagramKind(PUML_SEQ)).toBe('sequence');
    expect(detectDiagramKind(STATE)).toBe('state');
    expect(detectDiagramKind(PUML_CLASS)).toBeUndefined();
    expect(detectDiagramKind('classDiagram\n class A')).toBeUndefined();
    expect(detectDiagramKind('export class A {}')).toBeUndefined();
  });
  it('imports them', () => {
    const s = importDiagramText(SEQ)!;
    expect(s.kind).toBe('sequence');
    if (s.kind === 'sequence') expect(s.model.participants.map((p) => p.name)).toEqual(['A', 'B']);
    const t = importDiagramText(STATE)!;
    expect(t.kind).toBe('state');
    if (t.kind === 'state') expect(t.model.transitions).toHaveLength(2);
    expect(importDiagramText('hello')).toBeUndefined();
  });
});

describe('sequenceToDiagram / apply', () => {
  it('one sequence node sized from its layout', () => {
    const r = importDiagramText(SEQ)!;
    if (r.kind !== 'sequence') throw new Error('expected a sequence');
    const d = sequenceToDiagram(r.model, 'Login');
    expect(d.nodes).toHaveLength(1);
    expect(d.nodes[0]).toMatchObject({ type: 'sequence', data: { label: 'Login' } });
    expect(d.nodes[0].width).toBeGreaterThan(100);
  });
  it('applies into the current page', () => {
    const r = importDiagramText(STATE)!;
    const before = useDiagramStore.getState().nodes.length;
    const n = applyDiagramModel(r, 'page', 'Imported');
    expect(n).toBeGreaterThan(0);
    expect(useDiagramStore.getState().nodes.length).toBeGreaterThan(before);
  });
});
