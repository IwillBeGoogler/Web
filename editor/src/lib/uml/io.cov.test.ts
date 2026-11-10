import { describe, expect, it } from 'vitest';
import { detectUmlFormat, exportUmlText, importUmlText } from './io';
import { newClassDef } from './model';

describe('detectUmlFormat', () => {
  it.each([
    ['%% c\nclassDiagram\nclass A', 'mermaid'],
    ['@startuml\nclass A\n@enduml', 'plantuml'],
    ['class A\nclass B\nA --> B', 'plantuml'],
    ['package main\n\ntype Foo struct {\n}\n', 'go'],
    ['package main\n\nfunc F() {}\n', 'go'],
    ['using System;\nclass A {}', 'csharp'],
    ['namespace Foo;\npublic class A {}', 'csharp'],
    ['namespace Foo {\n public class A { }\n}', 'csharp'],
    ['class A { public int X { get; set; } }', 'csharp'],
    ['package a.b;\npublic class A {\n int x;\n}', 'java'],
    ['import java.util.List;\nclass A { }\n', 'java'],
    ['class A:\n  def f(self): pass', 'python'],
    ['from x import y\n', 'python'],
    ['public class A {\n  String s;\n}\n', 'java'],
    ['interface A { x: string }', 'typescript'],
    ['export class A {}', 'typescript'],
  ])('%j -> %s', (src, fmt) => expect(detectUmlFormat(src)).toBe(fmt));
});

describe('import / export dispatch', () => {
  it('imports each explicit format', async () => {
    expect((await importUmlText('classDiagram\nclass A', 'mermaid')).format).toBe('mermaid');
    expect((await importUmlText('@startuml\nclass A\n@enduml', 'plantuml')).model.classes[0].name).toBe('A');
    expect((await importUmlText('public class A { int x; }', 'java')).format).toBe('java');
    expect((await importUmlText('class A:\n    pass\n', 'python')).format).toBe('python');
    expect((await importUmlText('package p\ntype A struct { X int }\n', 'go')).format).toBe('go');
    expect((await importUmlText('public class A { public int X { get; set; } }', 'csharp')).format).toBe('csharp');
    const ts = await importUmlText('export class A { x: string }', 'typescript');
    expect(ts.format).toBe('typescript');
    expect(ts.model.classes[0].name).toBe('A');
  });
  it('auto detects', async () => {
    expect((await importUmlText('classDiagram\nclass A')).format).toBe('mermaid');
    expect((await importUmlText('export class B {}')).format).toBe('typescript');
  });
  it('exports', () => {
    const m = { classes: [newClassDef('A')], relations: [] };
    expect(exportUmlText(m, 'plantuml')).toContain('@startuml');
    expect(exportUmlText(m, 'mermaid')).toContain('classDiagram');
    expect(exportUmlText(m, 'typescript')).toContain('class A');
    expect(exportUmlText(m, 'java')).toContain('class A');
    expect(exportUmlText(m, 'go')).toContain('classDiagram');
  });
});
