import { describe, expect, it } from 'vitest';
import { SECTIONS, searchSections } from './catalog';
import { registerUmlSection } from './uml';
import { registerErdSection } from './erd';
import { createNodeFromPaletteItem, getItem } from './palette';
import { sectionsForMode } from './diagramModes';
import { classOf } from '../lib/uml/geometry';

registerErdSection();
registerUmlSection();

describe('UML palette section', () => {
  const uml = () => SECTIONS.find((s) => s.id === 'uml')!;
  const items = () => uml().subs.find((s) => s.label === 'Class')!.items;
  it('has Class, Interface, Abstract class, Enum, Package, Note and the relation presets, all enabled', () => {
    expect(items().map((i) => i.id)).toEqual(['uml-class', 'uml-interface', 'uml-abstract', 'uml-enum', 'uml-package', 'uml-note', 'uml-rel-inheritance', 'uml-rel-realization', 'uml-rel-composition', 'uml-rel-aggregation', 'uml-rel-association', 'uml-rel-dependency', 'uml-rel-note']);
    for (const i of items()) { expect(i.soon).toBeUndefined(); expect(i.tags).toEqual(expect.arrayContaining(['uml', 'class', 'oop', 'ood'])); }
        
  });
  it('keeps plain names (no "(icon)" suffix) for Actor, Enum and Note, ids unchanged', () => {
    const all = SECTIONS.flatMap((s) => s.subs.flatMap((b) => b.items));
    const label = (id: string) => all.find((i) => i.id === id)?.label;
    expect([label('uml-actor'), label('uml-enum'), label('uml-note')]).toEqual(['Actor', 'Enum', 'Note']);
  });
  it('is ONE top-level UML section with 5 sub-accordions (Class 13, Sequence 2, State 12, Use case 6, Component 6)', () => {
    expect(SECTIONS.filter((s) => s.label === 'UML' || s.id.startsWith('uml'))).toHaveLength(1);
    expect(uml().label).toBe('UML');
    expect(uml().subs.map((s) => [s.label, s.items.length])).toEqual([['Class', 13], ['Sequence', 2], ['State', 12], ['Use case', 6], ['Activity', 12], ['Component', 6], ['Deployment', 8], ['Package', 4], ['Object', 2], ['Communication', 1], ['Timing', 2]]);
    expect(uml().count).toBe(68);
  });
  it('the UML mode shows the single UML section; Architecture and Data show none of it', () => {
    expect(sectionsForMode('uml', SECTIONS).map((s) => s.id)).toEqual(['uml']);
    for (const m of ['architecture', 'data', 'board'] as const) expect(sectionsForMode(m, SECTIONS).some((s) => s.id.startsWith('uml')), m).toBe(false);
    expect(sectionsForMode('all', SECTIONS).map((s) => s.id)).toEqual(expect.arrayContaining(['uml']));
  });
  it('items create the right nodes', () => {
    const mk = (id: string) => createNodeFromPaletteItem(getItem(id)!, { x: 0, y: 0 }, 'n1');
    expect(classOf(mk('uml-class')).kind).toBe('class');
    expect(classOf(mk('uml-interface')).kind).toBe('interface');
    expect(classOf(mk('uml-abstract')).kind).toBe('abstract');
    expect(classOf(mk('uml-enum')).kind).toBe('enum');
    expect(mk('uml-package')).toMatchObject({ type: 'group', data: { variant: 'package' } });
    expect(mk('uml-note')).toMatchObject({ type: 'sticky', data: { umlNote: true } });
  });
  it('is found by search (class, oop, ood, interface)', () => {
    for (const q of ['class', 'oop', 'ood', 'interface', 'inheritance', 'package']) expect(searchSections(sectionsForMode('uml', SECTIONS), q).some((s) => s.id === 'uml'), q).toBe(true);
  });
});

describe('UML palette: sequence, state, use case, component', () => {
  const SUB: Record<string, string> = { 'uml-seq': 'Sequence', 'uml-state': 'State', 'uml-usecase': 'Use case', 'uml-activity': 'Activity', 'uml-component': 'Component' };
  const sec = (id: string) => SECTIONS.find((s) => s.id === 'uml')!.subs.find((s) => s.label === SUB[id])!;
  const ids = (id: string) => sec(id).items.map((i) => i.id);
  const mk = (id: string) => createNodeFromPaletteItem(getItem(id)!, { x: 10, y: 20 }, 'n1');
  it('every item is enabled and tagged uml', () => {
    expect(ids('uml-seq')).toEqual(['uml-sequence', 'uml-lifeline']);
    expect(ids('uml-state')).toEqual(['uml-state', 'uml-state-composite', 'uml-initial', 'uml-final', 'uml-choice', 'uml-fork', 'uml-join', 'uml-history', 'uml-deep-history', 'uml-entry-point', 'uml-exit-point', 'uml-rel-transition']);
    expect(ids('uml-usecase')).toEqual(['uml-actor', 'uml-usecase', 'uml-system', 'uml-rel-include', 'uml-rel-extend', 'uml-rel-generalization']);
    expect(ids('uml-activity')).toEqual(['uml-act-initial', 'uml-act-final', 'uml-act-flow-final', 'uml-act-action', 'uml-act-decision', 'uml-act-fork', 'uml-act-object', 'uml-act-send', 'uml-act-accept', 'uml-act-note', 'uml-act-lane-v', 'uml-act-lane-h']);
    expect(ids('uml-component')).toEqual(['uml-component', 'uml-node', 'uml-artifact', 'uml-provided', 'uml-required', 'uml-rel-assembly']);
    for (const s of ['uml-seq', 'uml-state', 'uml-usecase', 'uml-component']) {
      for (const i of sec(s).items) { expect(i.soon, i.id).toBeUndefined(); expect(i.tags, i.id).toContain('uml'); }
    }
  });
  it('items create the right nodes', () => {
    expect(mk('uml-sequence')).toMatchObject({ type: 'sequence', data: { label: 'Sequence' } });
    expect((mk('uml-sequence').data.participants as unknown[]).length).toBe(2);
    expect((mk('uml-lifeline').data.participants as unknown[]).length).toBe(1);
    expect(mk('uml-lifeline').data.items).toEqual([]);
    expect(mk('uml-state')).toMatchObject({ type: 'state', data: { stateKind: 'state' } });
    for (const [id, k] of [['uml-initial', 'initial'], ['uml-final', 'final'], ['uml-choice', 'choice'], ['uml-fork', 'fork'], ['uml-join', 'join'], ['uml-history', 'history'], ['uml-deep-history', 'deepHistory'], ['uml-entry-point', 'entryPoint'], ['uml-exit-point', 'exitPoint']] as const) expect(mk(id).data.stateKind).toBe(k);
    expect(mk('uml-state-composite')).toMatchObject({ type: 'group', data: { variant: 'composite' } });
    expect(mk('uml-actor')).toMatchObject({ type: 'usecase', data: { ucKind: 'actor' } });
    expect(mk('uml-usecase')).toMatchObject({ type: 'usecase', data: { ucKind: 'usecase' } });
    expect(mk('uml-system')).toMatchObject({ type: 'group', data: { variant: 'boundary' } });
    for (const [id, k] of [['uml-component', 'component'], ['uml-node', 'node'], ['uml-artifact', 'artifact'], ['uml-provided', 'provided'], ['uml-required', 'required']] as const) expect(mk(id)).toMatchObject({ type: 'component', data: { compKind: k } });
  });
  it('deployment items create deployment nodes and path presets', () => {
    for (const [id, k] of [['uml-dep-node', 'node'], ['uml-dep-device', 'device'], ['uml-dep-env', 'executionEnvironment'], ['uml-dep-artifact', 'artifact'], ['uml-dep-component', 'component']] as const) expect(mk(id), id).toMatchObject({ type: 'deployment', data: { depKind: k } });
    expect(mk('uml-dep-node').height).toBe(96);
    expect(SECTIONS.find((x) => x.id === 'uml')!.subs.find((x) => x.label === 'Deployment')!.items.map((i) => i.id).slice(5)).toEqual(['uml-rel-communication', 'uml-rel-deploy', 'uml-rel-manifest']);
  });
  it('sized nodes carry their size', () => {
    for (const id of ['uml-state', 'uml-initial', 'uml-actor', 'uml-usecase', 'uml-component', 'uml-sequence']) { const n = mk(id); expect(n.width, id).toBeGreaterThan(0); expect(n.height, id).toBeGreaterThan(0); }
  });
  it('is found by search', () => {
    const found = (q: string, id: string) => searchSections(sectionsForMode('uml', SECTIONS), q).some((s) => s.id === id);
    expect(found('sequence', 'uml')).toBe(true);
    expect(found('lifeline', 'uml')).toBe(true);
    expect(found('fork', 'uml')).toBe(true);
    expect(found('actor', 'uml')).toBe(true);
    expect(found('lollipop', 'uml')).toBe(true);
    expect(found('artifact', 'uml')).toBe(true);
  });
});
