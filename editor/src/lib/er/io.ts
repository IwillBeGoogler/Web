import { parseDbml, renderDbml } from './dbml';
import { parseMermaid, renderMermaid } from './mermaid';
import { looksLikeSeedora, parseSeedora, renderSeedora } from './seedora';
import { parseSql, stripDownMigrations } from './sqlParse';
import { seedoraYaml } from '@core/schema/seedora';
import { renderSql } from './renderSql';
import type { Dialect, ErParseResult, ErSchemaDef } from './types';

export type ErFormat = 'sql' | 'mermaid' | 'dbml' | 'seedora' | 'seedora-yaml';
export const ER_FORMATS: { id: ErFormat; label: string; ext: string; mime: string; /** can be read back (export only when false) */ canImport?: false }[] = [
  { id: 'sql', label: 'SQL DDL', ext: 'sql', mime: 'application/sql' },
  { id: 'mermaid', label: 'Mermaid erDiagram', ext: 'mmd', mime: 'text/plain' },
  { id: 'dbml', label: 'DBML', ext: 'dbml', mime: 'text/plain' },
  { id: 'seedora', label: 'Seedora schema JSON', ext: 'json', mime: 'application/json' },
  { id: 'seedora-yaml', label: 'Seedora seedora.yaml (schema + seed hints)', ext: 'yaml', mime: 'text/yaml', canImport: false },
];

export function detectFormat(text: string): ErFormat {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try { if (looksLikeSeedora(JSON.parse(t))) return 'seedora'; } catch { /* fall through */ }
  }
  if (/^(%%.*\n)*\s*erDiagram\b/i.test(t)) return 'mermaid';
  if (/^\s*(Table|Enum|Ref|Project)\s+[\w"`.]+/m.test(t) && !/^\s*CREATE\s/im.test(t)) return 'dbml';
  return 'sql';
}

export interface ErImport extends ErParseResult {
  format: ErFormat;
  dialect?: Dialect;
}
export function importErText(text: string, format: ErFormat | 'auto' = 'auto'): ErImport {
  const f = format === 'auto' ? detectFormat(text) : format;
  switch (f) {
    case 'mermaid': return { ...parseMermaid(text), format: f };
    case 'dbml': return { ...parseDbml(text), format: f };
    case 'seedora': return { ...parseSeedora(text), format: f };
    default: return { ...parseSql(text), format: 'sql' };
  }
}

/** File extensions the importer reads (folder picks and drops are filtered by it). */
export const IMPORT_EXTS = ['sql', 'ddl', 'dbml', 'mmd', 'mermaid', 'json'];
export const isImportFile = (name: string): boolean => IMPORT_EXTS.includes(name.split('.').pop()?.toLowerCase() ?? '');

/** Several files as one text: natural order by file name (00002 before 00010), joined by a newline. */
// rollback sections are dropped per file: a marker must not leak into the file after it
export function combineFiles(files: { name: string; path?: string; text: string }[]): string {
  const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  return [...files].sort((a, b) => cmp(a.name, b.name) || cmp(a.path ?? '', b.path ?? '')).map((f) => stripDownMigrations(f.text)).join('\n');
}

export function exportErText(schema: ErSchemaDef, format: ErFormat, dialect: Dialect = 'postgres'): string {
  switch (format) {
    case 'mermaid': return renderMermaid(schema);
    case 'dbml': return renderDbml(schema);
    case 'seedora': return renderSeedora(schema);
    case 'seedora-yaml': return seedoraYaml(schema as never);
    default: return renderSql(schema, dialect);
  }
}
