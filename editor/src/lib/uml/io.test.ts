import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UML_IMPORT_FORMATS, UML_EXPORT_FORMATS, detectUmlFormat, exportUmlText, importUmlText } from './io';
import { modelCounts } from './model';

const fx = (n: string) => readFileSync(join(process.cwd(), 'src/lib/uml/fixtures', n), 'utf8');

describe('UML import / export registry', () => {
  it('detects every format from the text', () => {
    expect(detectUmlFormat(fx('shop.mmd'))).toBe('mermaid');
    expect(detectUmlFormat(fx('shop.puml'))).toBe('plantuml');
    expect(detectUmlFormat(fx('shop.ts.txt'))).toBe('typescript');
    expect(detectUmlFormat(fx('Shop.java.txt'))).toBe('java');
    expect(detectUmlFormat(fx('shop.py.txt'))).toBe('python');
    expect(detectUmlFormat(fx('shop.go.txt'))).toBe('go');
    expect(detectUmlFormat(fx('Shop.cs.txt'))).toBe('csharp');
    expect(detectUmlFormat('class A { }')).toBe('typescript');
  });
  it('lists the formats', () => {
    expect(UML_IMPORT_FORMATS.map((f) => f.id)).toEqual(['typescript', 'java', 'python', 'go', 'csharp', 'mermaid', 'plantuml']);
    expect(UML_EXPORT_FORMATS.map((f) => f.id)).toEqual(['mermaid', 'plantuml', 'typescript', 'java']);
  });
  it('imports each fixture (auto-detected) with sensible counts', async () => {
    for (const [file, min] of [['shop.mmd', 5], ['shop.puml', 5], ['shop.ts.txt', 8], ['Shop.java.txt', 8], ['shop.py.txt', 6], ['shop.go.txt', 8], ['Shop.cs.txt', 8]] as const) {
      const r = await importUmlText(fx(file));
      expect(modelCounts(r.model).classes + modelCounts(r.model).interfaces + modelCounts(r.model).enums, file).toBeGreaterThanOrEqual(min);
    }
  });
  it('exports every format and the text re-imports to the same classes', async () => {
    const src = (await importUmlText(fx('shop.mmd'))).model;
    for (const f of UML_EXPORT_FORMATS) {
      const text = exportUmlText(src, f.id);
      expect(text.length, f.id).toBeGreaterThan(50);
      const back = (await importUmlText(text, f.id)).model;
      expect(back.classes.map((c) => c.name).sort(), f.id).toEqual(expect.arrayContaining(['Shape', 'Circle', 'Order', 'Color']));
    }
  });
});
