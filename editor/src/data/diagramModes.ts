import type { CatalogSection } from './catalog';

/**
 * The palette can show every kind of diagram object at once (a page may mix them) or be narrowed to one mode.
 * ERD and the UML diagram types (class, sequence, state, use case, component) are real sections.
 */
export type PaletteMode = 'all' | 'architecture' | 'data' | 'uml' | 'board';
export const PALETTE_MODES: { id: PaletteMode; label: string; hint: string }[] = [
  { id: 'all', label: 'All', hint: 'Every kind of object' },
  { id: 'architecture', label: 'Architecture', hint: 'Services, clouds, infrastructure' },
  { id: 'data', label: 'Data', hint: 'Databases and ERD tables' },
  { id: 'uml', label: 'UML', hint: 'Class, sequence, state and use-case objects' },
  { id: 'board', label: 'Board', hint: 'Stickies, frames, mind maps, pens, stamps, shapes and text' },
];
export const MODE_KEY = 'sdd:palette-mode';
export const isMode = (v: unknown): v is PaletteMode => PALETTE_MODES.some((m) => m.id === v);

/** every UML diagram type is real since Phase 2: nothing is left to show as a disabled placeholder */
export const PLACEHOLDER_SECTIONS: CatalogSection[] = [];

const isUml = (s: CatalogSection) => s.id === 'uml' || s.id.startsWith('uml-');

/** sections of the palette for a mode */
export function sectionsForMode(mode: PaletteMode, sections: CatalogSection[], placeholders: CatalogSection[] = PLACEHOLDER_SECTIONS): CatalogSection[] {
  switch (mode) {
    case 'architecture':
      return sections.filter((s) => s.id !== 'erd' && s.id !== 'board' && !isUml(s));
    case 'data':
      return sections.filter((s) => s.id === 'databases' || s.id === 'erd');
    case 'uml':
      return sections.filter(isUml);
    case 'board':
      return ['board', 'generic'].map((id) => sections.find((s) => s.id === id)).filter((s): s is CatalogSection => !!s);
    default:
      return [...sections, ...placeholders];
  }
}
