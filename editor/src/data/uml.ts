import { registerSections, type CatalogItem, type CatalogSection } from './catalog';
import { UML_PRESETS, UML_REL_LABEL } from '../lib/uml/edges';
import type { UmlRelKind } from '../lib/uml/types';

const TAGS = ['uml', 'class', 'oop', 'ood', 'diagram'];
const item = (id: string, label: string, kind: CatalogItem['kind'], aliases: string[], keywords: string[], extra: Partial<CatalogItem> = {}): CatalogItem => ({
  id, label, kind, aliases, keywords, ...extra, tags: [...TAGS, ...(extra.tags ?? [])],
});

const CLASSIFIERS: CatalogItem[] = [
  item('uml-class', 'Class', 'class', ['uml class', 'object'], ['attributes', 'operations', 'methods', 'fields']),
  item('uml-interface', 'Interface', 'class', ['protocol', 'contract'], ['stereotype', 'implements']),
  item('uml-abstract', 'Abstract class', 'class', ['abstract'], ['base class', 'italic']),
  item('uml-enum', 'Enum', 'class', ['enumeration'], ['literals', 'values']),
  item('uml-package', 'Package', 'group', ['namespace', 'module'], ['tab', 'container'], { preset: { width: 420, height: 280, data: { label: 'package', variant: 'package', stroke: '#4b5563', accent: '#4b5563', fillOpacity: 0, border: true, strokeWidth: 1.5, strokeStyle: 'solid' } } }),
  item('uml-note', 'Note', 'sticky', ['uml note', 'comment'], ['annotation', 'attach'], { tags: ['sticky'], preset: { width: 180, height: 90, data: { label: 'Note', umlNote: true, fill: '#fff8c5', stroke: '#c9b037', strokeWidth: 1.2, fontSize: 12 } } }),
];
const RELATIONS: CatalogItem[] = UML_PRESETS.map((p) =>
  item(p.id, p.label.replace(/ \(.*\)$/, ''), 'uml-rel', [p.kind, p.label], ['relation', 'relationship', 'connect', 'arrow', 'multiplicity'], { tags: ['relation', p.kind] }),
);

const CLASS_ITEMS: CatalogItem[] = [...CLASSIFIERS, ...RELATIONS];

export function registerUmlSection(): void {
  registerUmlSections();
}

const sub = (id: string, label: string, items: CatalogItem[]) => ({ id, label, items });
const section = (id: string, label: string, subs: ReturnType<typeof sub>[]): CatalogSection => ({ id, label, count: subs.reduce((n, s) => n + s.items.length, 0), subs });
const rel = (kind: UmlRelKind, tags: string[]): CatalogItem =>
  ({ id: `uml-rel-${kind}`, label: UML_REL_LABEL[kind].replace(/ \(.*\)$/, ''), kind: 'uml-rel', aliases: [kind], keywords: ['relation', 'relationship', 'connect', 'arrow'], tags: ['uml', 'relation', kind, ...tags] });
const it2 = (tags: string[]) => (id: string, label: string, kind: CatalogItem['kind'], aliases: string[], keywords: string[], extra: Partial<CatalogItem> = {}): CatalogItem =>
  ({ id, label, kind, aliases, keywords, ...extra, tags: ['uml', 'diagram', ...tags, ...(extra.tags ?? [])] });

const seq = it2(['sequence', 'interaction', 'message']);
const SEQUENCE_SECTION: CatalogSection = section('uml-seq', 'Sequence', [
  sub('uml-seq-frames', 'Sequence', [
    seq('uml-sequence', 'Sequence frame', 'sequence', ['sequence diagram', 'interaction'], ['participants', 'lifelines', 'messages', 'activation', 'fragment', 'alt', 'loop']),
    seq('uml-lifeline', 'Lifeline', 'sequence', ['participant'], ['actor', 'object', 'empty frame', 'one participant']),
  ]),
]);

const st = it2(['state', 'statechart', 'fsm', 'machine']);
const STATE_SECTION: CatalogSection = section('uml-state', 'State', [
  sub('uml-state-nodes', 'States', [
    st('uml-state', 'State', 'state', ['simple state'], ['rounded', 'entry', 'exit', 'activity']),
    st('uml-state-composite', 'Composite state', 'group', ['nested state', 'substate'], ['container', 'region'], { preset: { width: 360, height: 220, data: { label: 'Composite', variant: 'composite', accent: '#2f6fdb', stroke: '#2f6fdb', fillOpacity: 6, border: true } } }),
    st('uml-initial', 'Initial', 'state', ['start', 'initial pseudostate'], ['filled circle', 'begin']),
    st('uml-final', 'Final', 'state', ['end', 'final state'], ['bullseye', 'terminate']),
    st('uml-choice', 'Choice', 'state', ['decision', 'branch'], ['diamond', 'junction']),
    st('uml-fork', 'Fork', 'state', ['split'], ['bar', 'parallel', 'concurrent']),
    st('uml-join', 'Join', 'state', ['merge', 'sync'], ['bar', 'parallel', 'concurrent']),
    st('uml-history', 'History (H)', 'state', ['shallow history'], ['resume']),
    st('uml-deep-history', 'Deep history (H*)', 'state', ['deep history'], ['resume']),
    st('uml-entry-point', 'Entry point', 'state', ['entry pseudostate', 'port in'], ['border', 'circle']),
    st('uml-exit-point', 'Exit point', 'state', ['exit pseudostate', 'port out'], ['border', 'crossed circle']),
  ]),
  sub('uml-state-rels', 'Transitions', [rel('transition', ['state', 'statechart'])]),
]);

const uc = it2(['usecase', 'use case', 'actor', 'requirements']);
const USECASE_SECTION: CatalogSection = section('uml-usecase', 'Use case', [
  sub('uml-usecase-nodes', 'Use cases', [
    uc('uml-actor', 'Actor', 'usecase', ['user', 'stick figure', 'role'], ['person', 'external']),
    uc('uml-usecase', 'Use case', 'usecase', ['scenario', 'goal'], ['ellipse', 'oval', 'feature']),
    uc('uml-system', 'System boundary', 'group', ['subject', 'scope'], ['container', 'title'], { preset: { width: 420, height: 320, data: { label: 'System', variant: 'boundary', accent: '#0f9d8f', stroke: '#0f9d8f', fillOpacity: 3, border: true } } }),
  ]),
  sub('uml-usecase-rels', 'Relations', [rel('include', ['usecase']), rel('extend', ['usecase']), rel('generalization', ['usecase'])]),
]);

const ac = it2(['activity', 'flow', 'workflow', 'swimlane', 'process']);
const lane = (id: string, label: string, orient: 'v' | 'h', w: number, h: number) =>
  ac(id, label, 'group', ['partition', 'swimlane'], ['lane', 'responsibility', 'container'], { preset: { width: w, height: h, data: { label: 'Lane', variant: 'lane', laneOrient: orient, accent: '#d9822b', stroke: '#d9822b', fillOpacity: 3, border: true } } });
const ACTIVITY_SECTION: CatalogSection = section('uml-activity', 'Activity', [
  sub('uml-activity-nodes', 'Activity', [
    ac('uml-act-initial', 'Initial node', 'activity', ['start', 'begin'], ['filled circle']),
    ac('uml-act-final', 'Activity final', 'activity', ['end', 'stop'], ['bullseye', 'terminate']),
    ac('uml-act-flow-final', 'Flow final', 'activity', ['flow end'], ['crossed circle']),
    ac('uml-act-action', 'Action', 'activity', ['step', 'task', 'activity'], ['rounded', 'process']),
    ac('uml-act-decision', 'Decision / merge', 'activity', ['decision', 'merge', 'branch'], ['diamond', 'guard', 'if']),
    ac('uml-act-fork', 'Fork / join bar', 'activity', ['fork', 'join', 'split'], ['bar', 'parallel', 'concurrent']),
    ac('uml-act-object', 'Object node', 'activity', ['object', 'data'], ['pin', 'token']),
    ac('uml-act-send', 'Send signal', 'activity', ['signal out', 'send'], ['event', 'pentagon']),
    ac('uml-act-accept', 'Accept event', 'activity', ['signal in', 'receive', 'accept'], ['event', 'notched']),
    ac('uml-act-note', 'Activity note', 'activity', ['comment'], ['annotation']),
  ]),
  sub('uml-activity-lanes', 'Swimlanes', [lane('uml-act-lane-v', 'Swimlane (column)', 'v', 240, 520), lane('uml-act-lane-h', 'Swimlane (row)', 'h', 640, 200)]),
]);

const cp = it2(['component', 'deployment', 'architecture']);
const COMPONENT_SECTION: CatalogSection = section('uml-component', 'Component', [
  sub('uml-component-nodes', 'Components', [
    cp('uml-component', 'Component', 'component', ['module', 'service component'], ['box', 'icon', 'subsystem']),
    cp('uml-node', 'Node', 'component', ['deployment node', 'device', 'server'], ['3d box', 'hardware', 'environment']),
    cp('uml-artifact', 'Artifact', 'component', ['file', 'jar', 'binary'], ['deployment', 'package', 'war']),
    cp('uml-provided', 'Provided interface (lollipop)', 'component', ['lollipop', 'ball', 'interface'], ['provided', 'exposes', 'api']),
    cp('uml-required', 'Required interface (socket)', 'component', ['socket', 'interface'], ['required', 'uses', 'depends']),
  ]),
  sub('uml-component-rels', 'Connectors', [rel('assembly', ['component'])]),
]);

const dp = it2(['deployment', 'infrastructure', 'node', 'artifact']);
const DEPLOYMENT_SECTION: CatalogSection = section('uml-deployment', 'Deployment', [
  sub('uml-deployment-nodes', 'Deployment', [
    dp('uml-dep-node', 'Deployment node', 'deployment', ['node', 'server', 'machine'], ['3d box', 'hardware', 'environment']),
    dp('uml-dep-device', 'Device', 'deployment', ['hardware device', 'phone', 'host'], ['3d box', 'physical', 'device']),
    dp('uml-dep-env', 'Execution environment', 'deployment', ['runtime', 'container', 'jvm'], ['os', 'tomcat', 'docker']),
    dp('uml-dep-artifact', 'Deployment artifact', 'deployment', ['file', 'jar', 'war', 'binary'], ['deployed', 'package', 'image']),
    dp('uml-dep-component', 'Deployed component', 'deployment', ['module', 'service'], ['manifested', 'box']),
  ]),
  sub('uml-deployment-rels', 'Paths', [rel('communication', ['deployment']), rel('deploy', ['deployment']), rel('manifest', ['deployment'])]),
]);

const pk = it2(['package', 'namespace', 'module', 'dependency']);
const PACKAGE_SECTION: CatalogSection = section('uml-package-diagram', 'Package', [
  sub('uml-package-nodes', 'Packages', [
    pk('uml-pkg-package', 'Package', 'group', ['namespace', 'module', 'package diagram'], ['tab', 'container', 'folder'], { preset: { width: 420, height: 280, data: { label: 'package', variant: 'package', stroke: '#4b5563', accent: '#4b5563', fillOpacity: 0, border: true, strokeWidth: 1.5, strokeStyle: 'solid' } } }),
  ]),
  sub('uml-package-rels', 'Relations', [rel('import', ['package']), rel('access', ['package']), rel('merge', ['package'])]),
]);

const ob = it2(['object', 'object diagram', 'instance', 'instance specification']);
const OBJECT_SECTION: CatalogSection = section('uml-object', 'Object', [
  sub('uml-object-nodes', 'Objects', [
    ob('uml-obj', 'Object', 'object', ['instance', 'instance specification', 'object diagram'], ['underlined', 'slots', 'snapshot', 'name : class']),
  ]),
  sub('uml-object-rels', 'Links', [rel('link', ['object'])]),
]);

const cm = it2(['communication', 'communication diagram', 'collaboration', 'message', 'object']);
const COMMUNICATION_SECTION: CatalogSection = section('uml-communication', 'Communication', [
  sub('uml-communication-nodes', 'Communication', [
    cm('uml-comm-object', 'Communication object', 'object', ['lifeline object', 'collaboration object', 'communication diagram'], ['numbered messages', 'link', 'instance', '1.1', 'collaboration']),
  ]),
]);

const tm = it2(['timing', 'timing diagram', 'waveform', 'signal']);
const TIMING_SECTION: CatalogSection = section('uml-timing', 'Timing', [
  sub('uml-timing-frames', 'Timing', [
    tm('uml-timing', 'Timing frame', 'timing', ['timing diagram', 'waveform', 'signal diagram'], ['lifelines', 'robust', 'concise', 'binary', 'clock', 'time axis', 'state change', 'duration constraint']),
    tm('uml-timing-lifeline', 'Timing lifeline', 'timing', ['empty timing', 'one lifeline'], ['robust', 'state rows', 'empty frame']),
  ]),
]);

export function registerUmlSections(): void {
  const parts: [string, string, CatalogItem[]][] = [
    ['uml-sub-class', 'Class', CLASS_ITEMS],
    ...[SEQUENCE_SECTION, STATE_SECTION, USECASE_SECTION, ACTIVITY_SECTION, COMPONENT_SECTION, DEPLOYMENT_SECTION, PACKAGE_SECTION, OBJECT_SECTION, COMMUNICATION_SECTION, TIMING_SECTION].map((c): [string, string, CatalogItem[]] => [`${c.id}-sub`, c.label, c.subs.flatMap((x) => x.items)]),
  ];
  registerSections([section('uml', 'UML', parts.map(([id, label, items]) => sub(id, label, items)))]);
}
