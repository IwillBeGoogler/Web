import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dictionaries } from './dict';

/**
 * Every English string the recent UML / version-timeline screens pass through `t(...)` must have an uz and a ru entry.
 * Scope is explicit (not the whole app): extend FILES / ID_PREFIXES when a new area ships.
 */
const FILES = [
  'src/components/versions/VersionTimeline.tsx',
  'src/components/uml/ClassNode.tsx',
  'src/components/uml/UmlInspector.tsx',
  'src/components/uml/umlDialogs.tsx',
  'src/components/dialogs/forms.tsx',
  'src/components/crosslink/CrossLinks.tsx',
  'src/versions/timelineActions.ts',
  'src/components/BulkStyle.tsx',
  'src/components/PropertiesPanel.tsx',
  'src/components/EmptyCanvas.tsx',
  'src/components/PaletteRail.tsx',
  'src/components/ArrangeMenu.tsx',
  'src/components/Toolbar.tsx',
  'src/lib/actions.ts',
];
/** menu / ⌘K entries (`it('id', 'Label')`, `cmd('id', 'Label', ...)`) for UML kinds */
const ID_PREFIX = /^(uml-|seq-|object-|package-|component-|deployment-|usecase-|state-|timeline|tidy-(uml|state|usecase|activity|component|deployment|package|object))/;
const MENU_FILES = ['src/lib/menu.ts', 'src/components/CommandPalette.tsx'];

const unescape = (s: string): string => s.replace(/\\(['"\\])/g, '$1');
function literals(file: string, wantIds: boolean): string[] {
  const src = readFileSync(file, 'utf8');
  const out: string[] = [];
  if (!wantIds) for (const m of src.matchAll(/\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) out.push(unescape(m[1] ?? m[2]));
  else for (const m of src.matchAll(/\b(?:cmd|it)\(\s*'([^']*)'\s*,\s*'((?:[^'\\]|\\.)*)'/g)) if (ID_PREFIX.test(m[1])) out.push(unescape(m[2]));
  return out.filter((s) => /[A-Za-z]{2}/.test(s));
}

describe('i18n coverage (UML + timeline)', () => {
  const keys = new Set([...FILES.flatMap((f) => literals(f, false)), ...MENU_FILES.flatMap((f) => literals(f, true))]);
  it('scans something', () => expect(keys.size).toBeGreaterThan(40));
  it('has uz and ru for every string', () => {
    const missing = [...keys].filter((k) => !(k in dictionaries.uz) || !(k in dictionaries.ru));
    expect(missing).toEqual([]);
  });
});
