import { describe, expect, it } from 'vitest';
import { SECTIONS, searchSections } from './catalog';
import { registerErdSection } from './erd';
import { registerUmlSection } from './uml';
import { registerBoardSection } from './board';
import { PALETTE_MODES, PLACEHOLDER_SECTIONS, isMode, sectionsForMode } from './diagramModes';

const ids = (m: Parameters<typeof sectionsForMode>[0]) => sectionsForMode(m, SECTIONS).map((s) => s.id);

registerErdSection();
registerUmlSection();
registerBoardSection();

describe('palette mode filter', () => {
  it('offers All / Architecture / Data / UML / Board', () => {
    expect(PALETTE_MODES.map((m) => m.label)).toEqual(['All', 'Architecture', 'Data', 'UML', 'Board']);
    expect(isMode('data')).toBe(true);
    expect(isMode('nope')).toBe(false);
  });
  it('All shows every kind: architecture sections, the ERD section, the UML section and the placeholders', () => {
    const all = ids('all');
    expect(all).toEqual(expect.arrayContaining(['generic', 'databases', 'cloud', 'erd', 'board', 'uml']));
    expect(all.length).toBe(SECTIONS.length);
  });
  it('Architecture is the existing palette, Board the whiteboard section plus the generic shapes, Data the databases plus ERD', () => {
    expect(ids('architecture')).toEqual(SECTIONS.map((s) => s.id).filter((id) => id !== 'erd' && id !== 'board' && !id.startsWith('uml')));
    expect(ids('board')).toEqual(['board', 'generic']);
    expect(ids('data')).toEqual(['databases', 'erd']);
    expect(ids('uml')).toEqual(['uml']);
  });
  it('the ERD section is real: table, junction, view, enum and note, tagged er / erd / database / schema / table', () => {
    const erd = SECTIONS.find((s) => s.id === 'erd')!;
    const items = erd.subs.flatMap((s) => s.items);
    expect(items.map((i) => i.id)).toEqual(['er-table', 'er-junction', 'er-view', 'er-enum', 'er-note']);
    for (const i of items) { expect(i.soon).toBeUndefined(); expect(i.tags).toEqual(expect.arrayContaining(['er', 'erd', 'database', 'schema', 'table'])); }
  });
  it('no placeholders are left: every UML diagram type is real', () => {
    expect(PLACEHOLDER_SECTIONS).toEqual([]);
    for (const s of SECTIONS) for (const sub of s.subs) for (const it of sub.items) expect(it.soon, it.id).toBeUndefined();
  });
  it('search works inside a mode', () => {
    const r = searchSections(sectionsForMode('all', SECTIONS), 'class');
    expect(r.some((s) => s.id === 'uml')).toBe(true);
    expect(searchSections(sectionsForMode('uml', SECTIONS), 'postgres')).toEqual([]);
    expect(searchSections(sectionsForMode('data', SECTIONS), 'postgres').map((s) => s.id)).toEqual(['databases']);
  });
  it('unknown section ids in a custom list are simply absent', () => {
    expect(sectionsForMode('board', [{ id: 'x', label: 'x', subs: [], count: 0 }])).toEqual([]);
  });
});

describe('Board palette section (phase 4)', () => {
  const board = SECTIONS.find((s) => s.id === 'board')!;
  const items = board.subs.flatMap((s) => s.items);
  it('has Sticky, Frame, Mind map, Text box, Stamp, Pen and Highlighter', () => {
    expect(items.map((i) => i.label)).toEqual(['Sticky', 'Frame', 'Mind map', 'Text box', 'Stamp', 'Pen', 'Highlighter']);
    expect(board.count).toBe(items.length);
    expect(items.filter((i) => i.kind === 'tool').map((i) => i.tool)).toEqual(['pen', 'highlighter']);
  });
  it('is found by search', () => {
    expect(searchSections(SECTIONS, 'mind map').some((s) => s.id === 'board')).toBe(true);
    expect(searchSections(SECTIONS, 'highlighter').some((s) => s.id === 'board')).toBe(true);
  });
});
