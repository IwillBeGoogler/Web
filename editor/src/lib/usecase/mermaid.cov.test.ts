import { describe, expect, it } from 'vitest';
import { looksLikeUseCaseMermaid, parseUseCaseMermaid, renderUseCaseMermaid } from './mermaid';
import { emptyUseCaseModel } from './types';

describe('renderUseCaseMermaid', () => {
  it('renders all kinds, mults, labels, skips dangling relations, boundary fallback', () => {
    const out = renderUseCaseMermaid({
      actors: [{ id: 'a', name: 'Say "hi"\nthere' }],
      boundaries: [{ id: 'b', name: 'Sys' }],
      cases: [
        { id: 'c1', name: 'One', boundary: 'b', extensionPoints: ['x', 'y'] },
        { id: 'c2', name: 'Two' },
        { id: 'c3', name: 'Three', boundary: 'ghost' },
      ],
      relations: [
        { from: 'a', to: 'c1', kind: 'association', fromMult: '1', toMult: '*', label: 'uses' },
        { from: 'a', to: 'c2', kind: 'association', toMult: '2' },
        { from: 'a', to: 'c3', kind: 'association' },
        { from: 'c1', to: 'c2', kind: 'include' },
        { from: 'c2', to: 'c1', kind: 'extend' },
        { from: 'c1', to: 'c3', kind: 'generalization' },
        { from: 'zzz', to: 'c3', kind: 'association' },
      ],
    });
    expect(out).toContain('A1{{"Say \'hi\' there"}}:::actor');
    expect(out).toContain('subgraph S1["Sys"]');
    expect(out).toContain('    U1(["One<br/>extension points: x, y"])');
    expect(out).toContain('  U2(["Two"])');
    expect(out).toContain('  U3(["Three"])');
    expect(out).toContain('A1 ---|"1 : * uses"| U1');
    expect(out).toContain('A1 ---|" : 2"| U2');
    expect(out).toContain('A1 --- U3');
    expect(out).toContain('U1 -.->|"«include»"| U2');
    expect(out).toContain('U2 -.->|"«extend»"| U1');
    expect(out).toContain('U1 -->|"«generalization»"| U3');
    expect(out).not.toContain('zzz');
  });
});

describe('looksLikeUseCaseMermaid', () => {
  it('detects', () => {
    expect(looksLikeUseCaseMermaid('flowchart LR\n A{{"x"}}:::actor')).toBe(true);
    expect(looksLikeUseCaseMermaid('%% c\ngraph TD\n A-->B')).toBe(false);
    expect(looksLikeUseCaseMermaid('sequenceDiagram\n actor A')).toBe(false);
  });
});

describe('parseUseCaseMermaid', () => {
  it('roundtrips render output', () => {
    const m = {
      actors: [{ id: 'a', name: 'Cust' }],
      boundaries: [{ id: 'b', name: 'Shop' }],
      cases: [{ id: 'c', name: 'Buy', boundary: 'b', extensionPoints: ['p', 'q'] }, { id: 'd', name: 'Pay', boundary: 'b' }],
      relations: [
        { from: 'a', to: 'c', kind: 'association' as const, fromMult: '1', toMult: '*', label: 'does' },
        { from: 'c', to: 'd', kind: 'include' as const },
        { from: 'd', to: 'c', kind: 'extend' as const },
        { from: 'a', to: 'd', kind: 'generalization' as const },
      ],
    };
    const { model, warnings } = parseUseCaseMermaid(renderUseCaseMermaid(m));
    expect(warnings).toEqual([]);
    expect(model.actors.map((a) => a.name)).toEqual(['Cust']);
    expect(model.cases[0]).toMatchObject({ name: 'Buy', extensionPoints: ['p', 'q'], boundary: 's1' });
    expect(model.boundaries).toEqual([{ id: 's1', name: 'Shop' }]);
    expect(model.relations.map((r) => r.kind)).toEqual(['association', 'include', 'extend', 'generalization']);
    expect(model.relations[0]).toMatchObject({ label: 'does', fromMult: '1', toMult: '*' });
  });

  it('handles comments, class lines, various shapes, chains, op-text links, dotted default include', () => {
    const src = [
      'flowchart LR %% hi',
      'direction LR',
      'class U actor',
      'U[User]',
      'H((Round))',
      'R[/Rect/]',
      'S[[Sub]]',
      'F>Flag]',
      'P(Plain)',
      'Bare',
      'Bare2:::actor',
      'U --- P --> R',
      'U -- "does" --> P',
      'P -. extends .-> R',
      'P -.-> S',
      'P -->|generalises| R',
      'U ---|"2 : 3 buy"| P',
      'U ---|"1 :  hi"| H',
      'U ---|"n : 5"| H',
      'U ---|"only"| F',
      'click U foo',
      'classDef actor fill:#fff',
    ].join('\n');
    const { model, warnings } = parseUseCaseMermaid(src);
    expect(warnings).toEqual([]);
    expect(model.actors.map((a) => a.id)).toEqual(['U', 'Bare2']);
    expect(model.cases.map((c) => c.id)).toEqual(['H', 'R', 'S', 'F', 'P', 'Bare']);
    const rel = (i: number) => model.relations[i];
    expect(rel(0)).toMatchObject({ from: 'U', to: 'P', kind: 'association' });
    expect(rel(1)).toMatchObject({ from: 'P', to: 'R' });
    expect(rel(2)).toMatchObject({ kind: 'association', label: 'does' });
    expect(rel(3).kind).toBe('extend');
    expect(rel(4).kind).toBe('include');
    expect(rel(5).kind).toBe('generalization');
    expect(rel(6)).toMatchObject({ kind: 'association', fromMult: '2', toMult: '3', label: 'buy' });
    expect(rel(7)).toMatchObject({ fromMult: '1', label: 'hi' });
    expect(rel(7).toMult).toBeUndefined();
    expect(rel(8)).toMatchObject({ fromMult: 'n', toMult: '5' });
    expect(rel(9)).toMatchObject({ label: 'only' });
  });

  it('warns on unparseable lines and dangling operators; drops empty boundaries; nested subgraphs', () => {
    const src = [
      'flowchart TD',
      '!!!',
      'A --> ',
      'A ~~~ B',
      'A[One] ---',
      'subgraph Empty',
      'end',
      'subgraph X["Named"]',
      'subgraph Y',
      'C1([Case])',
      'end',
      'M([Late])',
      'end',
      'C1([Case again])',
      'M([Late again])',
      'subgraph X["Named"]',
      'N([Inside])',
      'end',
    ].join('\n');
    const { model, warnings } = parseUseCaseMermaid(src);
    expect(warnings).toEqual(expect.arrayContaining(['Skipped: !!!', 'Skipped: A --> ', 'Skipped: A ~~~ B'].map((s) => s.trim() === s ? s : s.trim())));
    expect(model.boundaries.map((b) => b.name)).not.toContain('Empty');
    expect(model.cases.find((c) => c.id === 'C1')?.boundary).toBeDefined();
    expect(model.cases.find((c) => c.id === 'N')?.boundary).toBeDefined();
  });

  it('later definition adds boundary to known case without one; repeated id with no text is reused', () => {
    const { model } = parseUseCaseMermaid('flowchart LR\nA([Foo])\nsubgraph S\nA([Foo])\nA\nend\n');
    expect(model.cases).toHaveLength(1);
    expect(model.cases[0].boundary).toBe('s1');
    expect(model.boundaries).toHaveLength(1);
  });

  it('empty input yields empty model', () => {
    expect(parseUseCaseMermaid('')).toEqual({ model: emptyUseCaseModel(), warnings: [] });
  });
});
