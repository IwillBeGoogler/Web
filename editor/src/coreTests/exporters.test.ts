import { describe, expect, it } from 'vitest';
import { exportPage, EXPORT_FORMATS } from '@core/exporters';
import type { CNode, CPage } from '@core/types';

const n = (id: string, label: string, extra: Partial<CNode> = {}): CNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label }, ...extra });
const pg = (nodes: CNode[], edges: CPage['edges'] = []): CPage => ({ id: 'p', name: 'Pg', nodes, edges });

describe('mermaid flow', () => {
  it('nodes, nesting, labels', () => {
    const p = pg(
      [n('g', 'Grp "q"', { type: 'group' }), n('a-1', 'A\nb', { parentId: 'g' }), n('b', 'B')],
      [{ id: 'e', source: 'a-1', target: 'b', label: 'go "x"' }, { id: 'f', source: 'b', target: 'a-1' }],
    );
    const out = exportPage(p, 'mermaid');
    expect(out).toContain('subgraph g["Grp #quot;q#quot;"]');
    expect(out).toContain('    a_1["A b"]');
    expect(out).toContain('a_1 -->|go #quot;x#quot;| b');
    expect(out).toContain('b --> a_1');
  });
});

describe('mermaid er', () => {
  it('tables and relations', () => {
    const p = pg(
      [
        n('t1', 'users', { type: 'table', data: { label: 'users', columns: [{ name: 'id', type: 'int', pk: true }, { name: 'o', type: '', fk: true }, { name: 'u', type: 'varchar(5)', unique: true }, { name: 'z' }] } }),
        n('t2', 'orders', { type: 'table', data: { label: 'orders' } }),
      ],
      [
        { id: '1', source: 't1', target: 't2', data: { relation: { cardinality: '1:N', name: 'has' } } },
        { id: '2', source: 't2', target: 't1', data: { relation: { cardinality: '??', fromCol: 'uid' } } },
        { id: '3', source: 't2', target: 't1', data: { relation: { cardinality: '1:1' } } },
        { id: '4', source: 't2', target: 'zz', data: { relation: { cardinality: '1:1' } } },
        { id: '5', source: 't2', target: 't1' },
      ],
    );
    const out = exportPage(p, 'mermaid');
    expect(out).toContain('int id PK');
    expect(out).toContain('text o FK');
    expect(out).toContain('varchar_5_ u UK');
    expect(out).toContain('users ||--o{ orders : "has"');
    expect(out).toContain('orders }o--|| users : "uid"');
    expect(out).toContain('orders ||--|| users : "rel"');
    expect(out.match(/-- /g)!.length).toBe(3);
  });
});

const classes = () => pg(
  [
    n('A', 'Animal', { type: 'class', data: { label: 'Animal', kind: 'abstract', attributes: [{ name: 'age', type: 'int', visibility: '-' }, { name: 'x' }], operations: [{ name: 'run', visibility: '+', params: [{ name: 'a' }, { name: 'b' }] }, { name: 'stop' }] } }),
    n('D', 'Dog', { type: 'class', data: { label: 'Dog', kind: 'interface' } }),
    n('E', 'Enum', { type: 'class', data: { label: 'Enum', kind: 'enum' } }),
    n('C', 'Plain', { type: 'class', data: { label: 'Plain' } }),
  ],
  [
    { id: '1', source: 'D', target: 'A', data: { uml: { kind: 'inheritance' } } },
    { id: '2', source: 'D', target: 'A', data: { uml: { kind: 'realization' } } },
    { id: '3', source: 'A', target: 'E', data: { uml: { kind: 'composition' } } },
    { id: '4', source: 'A', target: 'E', data: { uml: { kind: 'bogus' } } },
    { id: '5', source: 'A', target: 'nope', data: { uml: { kind: 'dependency' } } },
    { id: '6', source: 'A', target: 'E' },
  ],
);
describe('mermaid class', () => {
  it('classes and arrows', () => {
    const out = exportPage(classes(), 'mermaid');
    expect(out).toContain('classDiagram');
    expect(out).toContain('    -age int');
    expect(out).toContain('    +run(a, b)');
    expect(out).toContain('    stop()');
    expect(out).toContain('Animal <|-- Dog');
    expect(out).toContain('Animal <|.. Dog');
    expect(out).toContain('Animal *-- Enum');
    expect(out).toContain('Animal ..> nope');
  });
});

describe('plantuml', () => {
  it('class diagram', () => {
    const out = exportPage(classes(), 'plantuml');
    expect(out).toContain('abstract class Animal {');
    expect(out).toContain('interface Dog {');
    expect(out).toContain('enum Enum {');
    expect(out).toContain('class Plain {');
    expect(out).toContain('  -age : int');
    expect(out).toContain('  +run()');
    expect(out).toContain('Animal <|-- Dog');
    expect(out.startsWith('@startuml')).toBe(true);
  });
  it('flow diagram', () => {
    const p = pg([n('g', 'G "x"', { type: 'group' }), n('a', 'A', { parentId: 'g' }), n('b', 'B')], [{ id: 'e', source: 'a', target: 'b', label: 'L' }, { id: 'f', source: 'b', target: 'a' }]);
    const out = exportPage(p, 'plantuml');
    expect(out).toContain(`rectangle "G 'x'" as g {`);
    expect(out).toContain('  rectangle "A" as a');
    expect(out).toContain('a --> b : L');
    expect(out).toContain('b --> a\n');
  });
});

describe('sql', () => {
  it('no tables', () => {
    expect(exportPage(pg([n('a', 'A')]), 'sql')).toBe('-- no tables on this page\n');
  });
  it('orders by dependency, tolerates cycles, emits constraints and indexes', () => {
    const p = pg([
      n('c', 'child', { type: 'table', data: { label: 'child', columns: [{ name: 'id', type: 'int', pk: true }, { name: 'pid', type: '', fk: true, nullable: true, default: '0', unique: true, fkx: 1, ...({ fk: { table: 'parent', column: 'id', onDelete: 'CASCADE' } } as object) }, { name: 'self', type: 'int', fk: { table: 'child', column: 'id' } }], indexes: [{ columns: ['pid'] }, { name: 'ix', columns: ['pid', 'id'], unique: true }] } }),
      n('p', 'parent', { type: 'table', data: { label: 'parent', columns: [{ name: 'id', type: 'int', pk: true }, { name: 'c', type: 'int', fk: { table: 'child', column: 'id' } }, { name: 'ext', type: 'int', fk: { table: 'missing', column: 'id' }, unique: true }, { name: 'q"x', unique: true }] } }),
    ]);
    const out = exportPage(p, 'sql');
    expect(out.indexOf('CREATE TABLE "parent"')).toBeLessThan(out.indexOf('CREATE TABLE "child"'));
    expect(out).toContain('FOREIGN KEY ("pid") REFERENCES "parent" ("id") ON DELETE CASCADE');
    expect(out).toContain('FOREIGN KEY ("self") REFERENCES "child" ("id")\n');
    expect(out).toContain('DEFAULT 0');
    expect(out).toContain('"q""x" text NOT NULL UNIQUE');
    expect(out).toContain('CREATE INDEX "child_pid_idx" ON "child" ("pid");');
    expect(out).toContain('CREATE UNIQUE INDEX "ix" ON "child" ("pid", "id");');
    expect(out).toContain('PRIMARY KEY ("id")');
  });
  it('table without columns', () => {
    expect(exportPage(pg([n('t', 'T', { type: 'table' })]), 'sql')).toContain('CREATE TABLE "T" (\n\n);');
  });
});

describe('svg', () => {
  it('empty page', () => {
    expect(exportPage(pg([]), 'svg')).toContain('viewBox="0 0 100 100"');
  });
  it('nodes groups edges labels escaped', () => {
    const p = pg(
      [n('g', 'G<&>', { type: 'group', width: 300, height: 200 }), n('a', 'A', { parentId: 'g', position: { x: 10, y: 10 } }), n('b', 'B"', { position: { x: 400, y: 10 } }), n('c', 'C', { position: { x: 0, y: 0 } })],
      [{ id: 'e', source: 'a', target: 'b', label: 'x<y' }, { id: 'e2', source: 'a', target: 'zz' }, { id: 'e3', source: 'a', target: 'c' }, { id: 'e4', source: 'b', target: 'b' }],
    );
    const out = exportPage(p, 'svg');
    expect(out).toContain('G&lt;&amp;&gt;');
    expect(out).toContain('B&quot;');
    expect(out).toContain('stroke-dasharray');
    expect(out).toContain('x&lt;y');
    expect(out).toContain('marker-end');
  });
});

describe('json / sdd / all formats', () => {
  it('json and sdd', () => {
    const p = pg([n('a', 'A')]);
    expect(JSON.parse(exportPage(p, 'json'))).toMatchObject({ id: 'p', name: 'Pg' });
    expect(exportPage(p, 'sdd')).toContain('A');
  });
  it('every format returns a string', () => {
    for (const f of EXPORT_FORMATS) expect(typeof exportPage(pg([n('a', 'A')]), f)).toBe('string');
  });
});
