import { describe, expect, it } from 'vitest';
import { diagramToStateModel, stateModelToDiagram } from './convert';
import { parseStateMermaid } from './mermaid';
import { layoutStates } from './layout';

const SRC = `stateDiagram-v2
  [*] --> Idle
  Idle --> Active : go
  state Active {
    [*] --> A
    A --> B : next
  }
  Active --> Idle : cancel
  Idle --> Idle : tick
  Active --> [*]
`;
describe('state model <-> diagram', () => {
  const model = parseStateMermaid(SRC).model;
  const d = stateModelToDiagram(model);
  it('creates state nodes, a composite group and transition edges', () => {
    expect(d.nodes.filter((n) => n.type === 'state').length).toBe(model.states.filter((s) => !s.composite).length);
    const comp = d.nodes.find((n) => n.type === 'group');
    expect(comp?.data.variant).toBe('composite');
    const kids = d.nodes.filter((n) => n.parentId === comp!.id);
    expect(kids.length).toBe(3);
    expect(d.edges.every((e) => (e.data?.uml as { kind: string }).kind === 'transition')).toBe(true);
    expect(d.edges).toHaveLength(model.transitions.length);
    expect(d.edges.find((e) => e.source === e.target)?.label).toBe('tick');
  });
  it('children come after their parent and are laid out inside it', () => {
    const comp = d.nodes.find((n) => n.type === 'group')!;
    const ci = d.nodes.indexOf(comp);
    for (const k of d.nodes.filter((n) => n.parentId === comp.id)) {
      expect(d.nodes.indexOf(k)).toBeGreaterThan(ci);
      expect(k.position.x + (k.width ?? 0)).toBeLessThanOrEqual((comp.width ?? 0));
    }
    expect(layoutStates(model).size).toBe(model.states.length);
  });
  it('diagram -> model keeps states, nesting and labels', () => {
    const back = diagramToStateModel(d.nodes, d.edges);
    expect(back.states.length).toBe(model.states.length);
    expect(back.states.filter((s) => s.composite)).toHaveLength(1);
    expect(back.states.find((s) => s.name === 'A')!.parent).toBe(back.states.find((s) => s.composite)!.id);
    expect(back.transitions.map((t) => t.label).sort()).toEqual(model.transitions.map((t) => t.label).sort());
  });
});
