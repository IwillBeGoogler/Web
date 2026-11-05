import { describe, expect, it } from 'vitest';
import { isPlantUmlState, parsePlantUmlState, renderStatePlantUml } from './plantuml';
import { detectDiagramKind, importDiagramText } from '../uml2/importAny';
import { diagramToStateModel, stateModelToDiagram } from './convert';

const SRC = `@startuml
skinparam monochrome true
left to right direction
[*] --> Idle
Idle -down-> Running : start [ready] / init()
state "Long name" as long
long : entry / open
state Running {
  [*] --> Warm
  Warm --> Hot : heat
  --
  [*] --> Fan
  Fan --> [H]
}
state d <<choice>>
Running --> d
d --> [*] : done
note right of Idle : waiting
@enduml
`;
describe('PlantUML state', () => {
  it('is detected and routed to the state importer', () => {
    expect(isPlantUmlState(SRC)).toBe(true);
    expect(isPlantUmlState('@startuml\nA -> B : hi\nparticipant A\n@enduml')).toBe(false);
    expect(isPlantUmlState('@startuml\nclass A\n@enduml')).toBe(false);
    expect(detectDiagramKind(SRC)).toBe('state');
    expect(importDiagramText(SRC)).toMatchObject({ kind: 'state', format: 'plantuml' });
  });
  it('parses states, regions, history, notes, direction', () => {
    const { model, warnings } = parsePlantUmlState(SRC);
    expect(warnings).toEqual([]);
    expect(model.direction).toBe('LR');
    const by = (id: string) => model.states.find((s) => s.id === id)!;
    expect(by('long').name).toBe('Long name');
    expect(by('long').activity).toBe('entry / open');
    expect(by('Fan').region).toBe(1);
    expect(model.states.some((s) => s.kind === 'history' && s.parent === 'Running')).toBe(true);
    expect(model.transitions.find((t) => t.from === 'Idle' && t.to === 'Running')!.label).toBe('start [ready] / init()');
    expect(model.notes).toEqual([{ target: 'Idle', side: 'right', text: 'waiting' }]);
  });
  it('round trips through render', () => {
    const m = parsePlantUmlState(SRC).model;
    const out = renderStatePlantUml(m);
    expect(out.startsWith('@startuml')).toBe(true);
    expect(out).toContain('[H]');
    expect(out).toMatch(/^\s*--$/m);
    const again = parsePlantUmlState(out).model;
    expect(again.states.map((s) => [s.name, s.kind, s.region ?? 0, !!s.composite]).sort()).toEqual(m.states.map((s) => [s.name, s.kind, s.region ?? 0, !!s.composite]).sort());
    expect(again.transitions).toHaveLength(m.transitions.length);
    expect(again.notes).toEqual(m.notes);
  });
  it('diagram conversion keeps regions and notes', () => {
    const m = parsePlantUmlState(SRC).model;
    const d = stateModelToDiagram(m);
    expect(d.nodes.some((n) => n.type === 'sticky')).toBe(true);
    const back = diagramToStateModel(d.nodes, d.edges);
    expect(back.states.filter((s) => s.region === 1).length).toBeGreaterThan(0);
    expect(back.notes).toHaveLength(1);
    expect(back.notes![0].text).toBe('waiting');
  });
});
