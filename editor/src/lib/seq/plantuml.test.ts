import { describe, expect, it } from 'vitest';
import { LOGIN } from './fixtures';
import { parseSeqPlantUml, renderSeqPlantUml } from './plantuml';
import { parseSeqMermaid } from './mermaid';
import { allMessages } from './types';

const SRC = `@startuml
autonumber
actor User
boundary UI
control "Auth Service" as Auth
database DB
User -> UI : click
UI -> Auth : verify
activate Auth
Auth -> DB : find
DB --> Auth : row
Auth -> Auth : hash
Auth ->> UI : event
Auth --> UI : token
deactivate Auth
note over User, UI : two
note left of DB : left
alt ok
  UI -> User : hi
else fail
  UI -> User : no
end
loop 3 times
  UI -> UI : retry
end
create Temp
UI -> Temp : make
UI -> Temp !! : bye
@enduml
`;
describe('PlantUML sequence', () => {
  const { model, warnings } = parseSeqPlantUml(SRC);
  it('parses participant kinds, aliases and autonumber', () => {
    expect(warnings).toEqual([]);
    expect(model.autonumber).toBe(true);
    expect(model.participants.map((p) => [p.name, p.kind])).toEqual([['User', 'actor'], ['UI', 'boundary'], ['Auth Service', 'control'], ['DB', 'database'], ['Temp', 'participant']]);
  });
  it('maps arrow styles', () => {
    const k = Object.fromEntries(allMessages(model.items).map((m) => [m.text, m.kind]));
    expect(k).toMatchObject({ click: 'sync', row: 'return', event: 'async', token: 'return', make: 'create', bye: 'destroy' });
  });
  it('fragments, notes and self messages', () => {
    expect(model.items.some((i) => i.type === 'fragment' && i.op === 'loop')).toBe(true);
    expect(model.items.filter((i) => i.type === 'note')).toHaveLength(2);
    const hash = allMessages(model.items).find((m) => m.text === 'hash')!;
    expect(hash.from).toBe(hash.to);
  });
  it('round trips', () => {
    const a = parseSeqPlantUml(renderSeqPlantUml(LOGIN)).model;
    expect(a.participants.map((p) => [p.name, p.kind])).toEqual(LOGIN.participants.map((p) => [p.name, p.kind]));
    expect(allMessages(a.items).map((m) => [m.text, m.kind])).toEqual(allMessages(LOGIN.items).map((m) => [m.text, m.kind]));
    expect(a.items.filter((i) => i.type === 'fragment')).toHaveLength(1);
    const b = parseSeqPlantUml(renderSeqPlantUml(model)).model;
    expect(allMessages(b.items).map((m) => m.text)).toEqual(allMessages(model.items).map((m) => m.text));
  });
  it('Mermaid and PlantUML agree on the same diagram', () => {
    const mm = parseSeqMermaid('sequenceDiagram\n participant A\n participant B\n A->>B: hi\n B-->>A: yo').model;
    const pu = parseSeqPlantUml('@startuml\nparticipant A\nparticipant B\nA -> B : hi\nB --> A : yo\n@enduml').model;
    expect(allMessages(mm.items).map((m) => [m.text, m.kind])).toEqual(allMessages(pu.items).map((m) => [m.text, m.kind]));
  });
});
