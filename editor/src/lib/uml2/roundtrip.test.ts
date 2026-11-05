import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePlantUml, renderPlantUml } from '../uml/plantuml';
import { parseMermaid, renderMermaid } from '../uml/mermaid';
import { parseSeqPlantUml, renderSeqPlantUml } from '../seq/plantuml';
import { parseSeqMermaid } from '../seq/mermaid';
import { renderSeqMermaid } from '../seq/mermaid';
import { parsePlantUmlState } from '../state/plantuml';
import { parseStateMermaid, renderStateMermaid, renderStatePlantUml } from '../state/mermaid';
import { parseUseCasePlantuml, renderUseCasePlantuml } from '../usecase/plantuml';
import { parseUseCaseMermaid, renderUseCaseMermaid } from '../usecase/mermaid';
import { parseActivityPlantuml, renderActivityPlantuml } from '../activity/plantuml';
import { parseActivityMermaid, renderActivityMermaid } from '../activity/mermaid';
import { parseComponentPlantuml, renderComponentPlantuml } from '../component/plantuml';
import { parseDeploymentPlantuml, renderDeploymentPlantuml } from '../deployment/plantuml';
import { parsePackagePlantuml, renderPackagePlantuml } from '../package/plantuml';
import { parseObjectPlantuml, renderObjectPlantuml } from '../object/plantuml';
import { parseTimingPlantuml, renderTimingPlantuml } from '../timing/plantuml';
import { detectDiagramKind } from '../uml2/importAny';

/** id-free, order-free view of a model: ids become the element names, arrays are sorted */
function canon(model: unknown): unknown {
  const names = new Map<string, string>();
  const scan = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.id === 'string') names.set(o.id, String(o.name || o.label || o.kind || o.id));
      Object.values(o).forEach(scan);
    }
  };
  scan(model);
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as object).filter(([k]) => k !== 'id').map(([k, x]) => [k, walk(x)]));
    return typeof v === 'string' && names.has(v) ? names.get(v) : v;
  };
  return walk(model);
}

/** text -> model -> text -> model: same elements and links, a stable text from the second pass on */
function roundTrip<M>(name: string, src: string | (() => string), parse: (t: string) => { model: M; warnings: string[] }, render: (m: M) => string, kind?: string) {
  it(name, () => {
    const text0 = typeof src === 'string' ? src : src();
    const a = parse(text0);
    expect(a.warnings, 'first import warnings').toEqual([]);
    const text = render(a.model);
    if (kind) expect(detectDiagramKind(text), 'exported text is recognised again').toBe(kind);
    const b = parse(text);
    expect(b.warnings, 'second import warnings').toEqual([]);
    expect(canon(b.model)).toEqual(canon(a.model));
    expect(render(b.model)).toBe(text);
    expect(parse(render(b.model)).model).toEqual(b.model);
  });
}

const CLASS_PUML = readFileSync(join(process.cwd(), 'src/lib/uml/fixtures/shop.puml'), 'utf8');
const CLASS_MMD = `classDiagram
  class Animal {
    <<abstract>>
    +String name
    -int age
    +eat(food String) void
  }
  class Dog
  class Owner
  Animal <|-- Dog
  Owner "1" --> "*" Dog : owns
`;
const SEQ_PUML = `@startuml
autonumber
actor User
participant "Web App" as Web
database DB
User -> Web : login
Web -> DB : find
DB --> Web : row
alt ok
  Web -> User : token
else fail
  Web -> User : denied
end
loop 3 times
  Web -> Web : retry
end
@enduml
`;
const SEQ_MMD = 'sequenceDiagram\n  participant A\n  participant B\n  A->>B: hi\n  B-->>A: yo\n  loop every minute\n    A->>A: tick\n  end\n';
const STATE_PUML = `@startuml
[*] --> Idle
Idle --> Running : start [ready] / init()
state Running {
  [*] --> Warm
  Warm --> Hot : heat
  --
  [*] --> Fan
  Fan --> [*]
}
state d <<choice>>
Running --> d
d --> [*] : done
@enduml
`;
const STATE_MMD = `stateDiagram-v2
  [*] --> Idle
  Idle --> Running : start
  state Running {
    [*] --> Warm
    Warm --> Hot : heat
  }
  Running --> [*]
`;
const UC_PUML = `@startuml
actor customer
actor clerk
rectangle checkout {
  customer -- (checkout)
  (checkout) .> (payment) : include
  (help) .> (checkout) : extends
  clerk -- (checkout)
}
@enduml
`;
const ACT_PUML = `@startuml
|Customer|
start
:Place order;
|Shop|
:Validate;
if (valid?) then (yes)
  :Charge;
  fork
    :Pick;
  fork again
    :Notify;
  end fork
else (no)
  :Reject;
  stop
endif
while (more items?) is (yes)
  :Add item;
endwhile (no)
stop
@enduml
`;
const COMP_PUML = `@startuml
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
ui --> api : calls
@enduml
`;
const DEP_PUML = `@startuml
node "Web" as web {
  artifact "site.zip" as site
}
database "DB" as db
component "Shop" as shop
web -- db : JDBC
db <.. site
site ..> shop
@enduml
`;
const PKG_PUML = `@startuml
package A {
  package B {
    class K
  }
}
package C
A ..> C : <<import>>
B ..> C
@enduml
`;
const OBJ_PUML = `@startuml
object "alice : User" as alice {
  age = 3
  name = "Al"
}
object bob
alice --> bob : knows
@enduml
`;

describe('class', () => {
  roundTrip('PlantUML', CLASS_PUML, (t) => { const r = parsePlantUml(t); return { model: r.model, warnings: r.warnings }; }, renderPlantUml);
  roundTrip('Mermaid', CLASS_MMD, (t) => { const r = parseMermaid(t); return { model: r.model, warnings: r.warnings }; }, renderMermaid);
  it('PlantUML -> Mermaid keeps classes and relations', () => {
    const a = parsePlantUml(CLASS_PUML).model;
    const b = parseMermaid(renderMermaid(a)).model;
    expect(b.classes.map((c) => c.name).sort()).toEqual(a.classes.map((c) => c.name).sort());
    expect(b.relations.length).toBe(a.relations.length);
  });
});
describe('sequence', () => {
  roundTrip('PlantUML', SEQ_PUML, parseSeqPlantUml, renderSeqPlantUml, 'sequence');
  roundTrip('Mermaid', SEQ_MMD, parseSeqMermaid, renderSeqMermaid, 'sequence');
});
describe('state', () => {
  roundTrip('PlantUML', STATE_PUML, parsePlantUmlState, renderStatePlantUml, 'state');
  roundTrip('Mermaid', STATE_MMD, parseStateMermaid, renderStateMermaid, 'state');
});
describe('usecase', () => {
  roundTrip('PlantUML', UC_PUML, parseUseCasePlantuml, renderUseCasePlantuml, 'usecase');
  roundTrip('Mermaid', () => renderUseCaseMermaid(parseUseCasePlantuml(UC_PUML).model), parseUseCaseMermaid, renderUseCaseMermaid, 'usecase');
});
describe('activity', () => {
  roundTrip('PlantUML', ACT_PUML, parseActivityPlantuml, renderActivityPlantuml, 'activity');
  roundTrip('Mermaid', () => renderActivityMermaid(parseActivityPlantuml(ACT_PUML).model), parseActivityMermaid, renderActivityMermaid, 'activity');
});
describe('component (PlantUML only)', () => { roundTrip('PlantUML', COMP_PUML, parseComponentPlantuml, renderComponentPlantuml, 'component'); });
describe('deployment (PlantUML only)', () => { roundTrip('PlantUML', DEP_PUML, parseDeploymentPlantuml, renderDeploymentPlantuml, 'deployment'); });
describe('package (PlantUML only)', () => { roundTrip('PlantUML', PKG_PUML, parsePackagePlantuml, renderPackagePlantuml, 'package'); });
describe('object (PlantUML only)', () => { roundTrip('PlantUML', OBJ_PUML, parseObjectPlantuml, renderObjectPlantuml, 'object'); });

// a communication diagram has no PlantUML form of its own: it is an object diagram whose link labels carry the numbered messages
const COMM_PUML = `@startuml
object "user : Customer" as U
object "web : WebApp" as W
object "auth : AuthService" as A
U -- W : 1: login(pw) >\\n4: session <
W -- A : 2: authenticate() >\\n3: token <
A -- W : 2.1: audit() >>
@enduml`;
describe('communication (PlantUML, as an object diagram with numbered link labels)', () => {
  roundTrip('PlantUML', COMM_PUML, parseObjectPlantuml, renderObjectPlantuml, 'object');
  it('the numbered label lines become messages (direction and async from the trailing marks)', () => {
    const m = parseObjectPlantuml(COMM_PUML).model;
    expect(m.links).toHaveLength(3);
    expect(m.links[0].messages?.map((x) => [x.seq, x.text, x.dir, !!x.async])).toEqual([['1', 'login(pw)', 'fwd', false], ['4', 'session', 'back', false]]);
    expect(m.links[2].messages?.[0]).toMatchObject({ seq: '2.1', text: 'audit()', dir: 'fwd', async: true });
    expect(m.links[0].label).toBeUndefined();
  });
  it('plain association names stay labels', () => {
    const m = parseObjectPlantuml('@startuml\nobject a\nobject b\na -- b : owns\n@enduml').model;
    expect(m.links[0]).toMatchObject({ label: 'owns' });
    expect(m.links[0].messages).toBeUndefined();
  });
});

const TIMING_PUML = `@startuml
robust "Web Browser" as WB
concise "Web User" as WU
binary "Link" as LK
clock "Clock" as CK with period 50
WB has Idle,Waiting,Processing

@0
WU is Idle
WB is Idle
LK is low

@100
WU is Waiting
WB is Waiting
WU -> WB : URL

@300
WB is Processing
LK is high
WB@100 <-> @300 : {200 ms}
@enduml`;
describe('timing (PlantUML only)', () => {
  roundTrip('PlantUML', TIMING_PUML, parseTimingPlantuml, renderTimingPlantuml, 'timing');
  it('reads lifeline kinds, states, @t marks, messages and durations', () => {
    const m = parseTimingPlantuml(TIMING_PUML).model;
    expect(m.lifelines.map((l) => [l.name, l.kind])).toEqual([['Web Browser', 'robust'], ['Web User', 'concise'], ['Link', 'binary'], ['Clock', 'clock']]);
    expect(m.lifelines[0].states).toEqual(['Idle', 'Waiting', 'Processing']);
    expect(m.lifelines[3].period).toBe(50);
    expect(m.changes.filter((c) => c.t === 100).map((c) => c.state).sort()).toEqual(['Waiting', 'Waiting']);
    expect(m.messages).toMatchObject([{ t: 100, text: 'URL' }]);
    expect(m.durations).toMatchObject([{ t1: 100, t2: 300, text: '{200 ms}' }]);
  });
  it('relative time marks (@+50) and unknown lines warn instead of failing', () => {
    const r = parseTimingPlantuml('@startuml\nrobust "A" as A\n@10\nA is x\n@+40\nA is y\nhide time-axis\nfoo bar baz\n@enduml');
    expect(r.model.changes.map((c) => c.t)).toEqual([10, 50]);
    expect(r.warnings).toEqual(['Skipped: foo bar baz']);
  });
});
