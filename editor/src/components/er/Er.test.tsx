import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/api';
import App from '../../App';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { seedProject } from '../../test/workspace';
import { useWorkspace } from '../../workspace/store';
import { blankTable } from '../../lib/er/relations';
import { relationOf, tableOf } from '../../lib/er/tableData';
import { executeAction } from '../../lib/actions';
import { getMenuItems, flattenMenu } from '../../lib/menu';
import { getItem, createNodesFromPaletteItem } from '../../data/palette';
import { ER_MARKER_KINDS } from '../../lib/er/cardinality';
import { EdgeMarker } from '../edges/markers';

const s = () => useDiagramStore.getState();

function open() {
  localStorage.clear();
  s().reset();
  useUiStore.getState().resetUi();
  const p = seedProject('ER');
  return render(<App initialProjectId={p.projectId} />);
}

describe('store: ER actions', () => {
  beforeEach(() => s().reset());
  it('connectTables creates the FK column + relation in one undo step; undo removes both', () => {
    s().addNode(blankTable('a', { x: 0, y: 0 }, 'users'));
    s().addNode(blankTable('b', { x: 400, y: 0 }, 'orders'));
    const before = s().past.length;
    const id = s().connectTables({ childId: 'b', parentId: 'a' });
    expect(id).toBeTruthy();
    expect(s().past.length).toBe(before + 1);
    expect(s().edges).toHaveLength(1);
    expect(tableOf(s().nodes.find((n) => n.id === 'b')!).columns.map((c) => c.name)).toEqual(['id', 'name', 'user_id']);
    s().undo();
    expect(s().edges).toHaveLength(0);
    expect(tableOf(s().nodes.find((n) => n.id === 'b')!).columns).toHaveLength(2);
  });
  it('removing a column drops its relation; deleting the edge clears the FK hint', () => {
    s().addNode(blankTable('a', { x: 0, y: 0 }, 'users'));
    s().addNode(blankTable('b', { x: 400, y: 0 }, 'orders'));
    s().connectTables({ childId: 'b', parentId: 'a' });
    const fk = tableOf(s().nodes.find((n) => n.id === 'b')!).columns.find((c) => c.fk)!;
    s().updateTable('b', (d) => ({ ...d, columns: d.columns.filter((c) => c.id !== fk.id) }));
    expect(s().edges).toHaveLength(0);
    s().connectTables({ childId: 'b', parentId: 'a' });
    s().deleteEdges([s().edges[0].id]);
    expect(tableOf(s().nodes.find((n) => n.id === 'b')!).columns.some((c) => c.fk)).toBe(false);
  });
  it('resizes a table node when columns change (rows are 28px)', () => {
    s().addNode(blankTable('a', { x: 0, y: 0 }, 'users'));
    const h0 = s().nodes[0].height!;
    s().updateTable('a', (d) => ({ ...d, columns: [...d.columns, { id: 'c9', name: 'x', type: 'int', pk: false, unique: false, nullable: true }] }));
    expect(s().nodes[0].height).toBe(h0 + 28);
    s().updateNodeData('a', { collapsed: true });
    s().updateTable('a', (d) => d);
    expect(s().nodes[0].height!).toBeLessThan(h0);
  });
  it('cardinality / optional / identifying / reverse / junction through executeAction', () => {
    s().addNode(blankTable('a', { x: 0, y: 0 }, 'users'));
    s().addNode(blankTable('b', { x: 400, y: 0 }, 'orders'));
    s().connectTables({ childId: 'b', parentId: 'a' });
    const id = s().edges[0].id;
    executeAction('rel-card:N:M', { edgeId: id });
    expect(relationOf(s().edges[0])!.cardinality).toBe('N:M');
    expect(s().edges[0].data).toMatchObject({ startMarker: 'zeroOrMany', endMarker: 'zeroOrMany' });
    executeAction('rel-junction', { edgeId: id });
    expect(s().nodes.filter((n) => n.type === 'table')).toHaveLength(3);
    expect(s().edges).toHaveLength(2);
    const e2 = s().edges[0].id;
    executeAction('rel-optional', { edgeId: e2 });
    expect(relationOf(s().edges[0])!.optional).toBe(true);
    executeAction('rel-identifying', { edgeId: e2 });
    expect(s().edges[0].data).toMatchObject({ strokeStyle: 'dashed' });
    executeAction('reverse-edge', { edgeId: e2 });
    expect(relationOf(s().edges[0])!.cardinality).toBe('N:1');
  });
  it('tidyEr arranges tables without overlap', () => {
    for (let i = 0; i < 5; i++) s().addNode(blankTable(`t${i}`, { x: 0, y: 0 }, `t${i}`));
    s().connectTables({ childId: 't1', parentId: 't0' });
    s().connectTables({ childId: 't2', parentId: 't0' });
    expect(s().tidyEr()).toBe(5);
    const xs = s().nodes.map((n) => `${n.position.x},${n.position.y}`);
    expect(new Set(xs).size).toBe(5);
    const p = s().nodes.find((n) => n.id === 't0')!;
    expect(p.position.x + p.width!).toBeLessThanOrEqual(s().nodes.find((n) => n.id === 't1')!.position.x);
  });
  it('bulk style sets the header colour of every selected table', () => {
    s().addNode({ ...blankTable('a', { x: 0, y: 0 }), selected: true });
    s().addNode({ ...blankTable('b', { x: 400, y: 0 }), selected: true });
    s().addNode({ id: 'i', type: 'icon', position: { x: 800, y: 0 }, selected: true, data: { label: 'i' } });
    expect(s().updateSelectionStyle({ accent: '#d1344a' })).toBe(2);
    expect(s().nodes.filter((n) => n.type === 'table').every((n) => n.data.accent === '#d1344a')).toBe(true);
  });
});

describe('palette + menus', () => {
  it('palette items create table nodes', () => {
    for (const [id, kind] of [['er-table', 'table'], ['er-junction', 'table'], ['er-view', 'view'], ['er-enum', 'enum']] as const) {
      const item = getItem(id);
      if (!item) continue; // registered by the app bootstrap
      const [n] = createNodesFromPaletteItem(item, { x: 10, y: 10 }, (p) => `${p}_1`);
      expect(n.type).toBe('table');
      expect(tableOf(n).tableKind).toBe(kind);
      expect(n.height).toBeGreaterThan(80);
    }
  });
  it('edge menu offers cardinality, optional, identifying and reverse for relations', () => {
    s().reset();
    s().addNode(blankTable('a', { x: 0, y: 0 }));
    s().addNode(blankTable('b', { x: 400, y: 0 }));
    s().connectTables({ childId: 'b', parentId: 'a' });
    const ctx = { nodes: s().nodes, edges: s().edges, hasClipboard: false, hasStyleClip: false, pageCount: 1 };
    const ids = flattenMenu(getMenuItems({ type: 'edge', id: s().edges[0].id }, ctx)).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['rel-card:1:1', 'rel-card:1:N', 'rel-card:N:1', 'rel-card:N:M', 'rel-optional', 'rel-identifying', 'reverse-edge', 'delete']));
    expect(ids).not.toContain('rel-junction');
  });
  it('crow-foot markers render for all five kinds', () => {
    for (const k of ER_MARKER_KINDS) {
      const { container, unmount } = render(<svg><EdgeMarker id={`m-${k}`} kind={k} color="#333" /></svg>);
      expect(container.querySelector('marker')?.getAttribute('id')).toBe(`m-${k}`);
      expect(container.querySelectorAll('path,circle').length).toBeGreaterThan(0);
      unmount();
    }
  });
});

describe('TableNode in the canvas', () => {
  it('renders rows, edits a column name inline, adds and removes columns, collapses to keys', async () => {
    open();
    act(() => {
      s().addNode(blankTable('a', { x: 0, y: 0 }, 'users'));
      s().addNode(blankTable('b', { x: 400, y: 0 }, 'orders'));
      s().connectTables({ childId: 'b', parentId: 'a' });
    });
    await waitFor(() => expect(screen.getByTestId('table-a')).toBeTruthy());
    const t = screen.getByTestId('table-b');
    expect(t.querySelectorAll('.er-row').length).toBe(3);
    expect(t.querySelector('.er-row.fk')).toBeTruthy();
    // inline rename of a column
    fireEvent.doubleClick(t.querySelectorAll('.er-name')[1]);
    const input = t.querySelector('input.er-name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'full_name' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(tableOf(s().nodes.find((n) => n.id === 'b')!).columns[1].name).toBe('full_name');
    // add column
    fireEvent.click(t.querySelector('button.er-add')!);
    expect(tableOf(s().nodes.find((n) => n.id === 'b')!).columns).toHaveLength(4);
    // PK toggle
    fireEvent.click(screen.getAllByLabelText('PK, primary key: full_name')[0]);
    expect(tableOf(s().nodes.find((n) => n.id === 'b')!).columns[1].pk).toBe(true);
    // remove column
    fireEvent.click(screen.getAllByLabelText('Delete column column')[0]);
    expect(tableOf(s().nodes.find((n) => n.id === 'b')!).columns).toHaveLength(3);
    // collapse to keys only
    fireEvent.click(t.querySelector('.er-collapse')!);
    expect(t.querySelectorAll('.er-row').length).toBe(3); // id (pk), full_name (pk), user_id (fk)
    act(() => s().updateTable('b', (d) => ({ ...d, columns: d.columns.map((c) => (c.name === 'full_name' ? { ...c, pk: false } : c)) })));
    await waitFor(() => expect(screen.getByTestId('table-b').querySelectorAll('.er-row').length).toBe(2));
  });
});

import { openErExport, openErImport } from './erDialogs';
import { parseSql } from '../../lib/er/sqlParse';
import { schemaToDiagram } from '../../lib/er/convert';

describe('import / export dialogs', () => {
  const SQL = 'CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL);\nCREATE TABLE orders (id serial PRIMARY KEY, user_id int NOT NULL REFERENCES users(id));';
  it('previews counts and imports into the current page', async () => {
    open();
    act(() => void openErImport());
    const area = await screen.findByLabelText('Schema text');
    expect(screen.getByRole('button', { name: /^Import/ })).toBeDisabled();
    fireEvent.change(area, { target: { value: SQL } });
    const status = document.querySelector('.er-preview')!;
    expect(status.textContent).toMatch(/SQL DDL/);
    expect(status.textContent).toMatch(/2 tables/);
    expect(status.textContent).toMatch(/1 relation\b/);
    fireEvent.click(screen.getByRole('button', { name: /^Import 2 tables/ }));
    await waitFor(() => expect(s().nodes.filter((n) => n.type === 'table')).toHaveLength(2));
    expect(s().edges).toHaveLength(1);
    expect(relationOf(s().edges[0])!.cardinality).toBe('1:N');
  });
  it('can import into a new file and rejects empty input', async () => {
    open();
    const files = useWorkspace.getState().tree.files.length;
    act(() => void openErImport());
    const area = await screen.findByLabelText('Schema text');
    fireEvent.change(area, { target: { value: 'nothing useful here' } });
    expect(document.querySelector('.er-preview')!.textContent).toMatch(/Nothing to import/);
    fireEvent.change(area, { target: { value: 'erDiagram\n A ||--o{ B : has' } });
    expect(document.querySelector('.er-preview')!.textContent).toMatch(/Mermaid/);
    fireEvent.click(screen.getByLabelText('A new file'));
    fireEvent.click(screen.getByRole('button', { name: /^Import/ }));
    await waitFor(() => expect(useWorkspace.getState().tree.files.length).toBe(files + 1));
    await waitFor(() => expect(s().nodes.filter((n) => n.type === 'table')).toHaveLength(2));
  });
  it('imports several files in natural name order and shows the file count', async () => {
    open();
    act(() => void openErImport());
    const area = (await screen.findByLabelText('Schema text')) as HTMLTextAreaElement;
    const f = (name: string, body: string) => new File([body], name, { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('er-file'), { target: { files: [f('00010_b.sql', 'CREATE TABLE b (id int);'), f('00002_a.sql', 'CREATE TABLE a (id int);'), f('notes.txt', 'ignored')] } });
    await waitFor(() => expect(screen.getByTestId('er-file-count').textContent).toBe('2 files'));
    expect(area.value).toBe('CREATE TABLE a (id int);\nCREATE TABLE b (id int);');
    expect(document.querySelector('.er-preview')!.textContent).toMatch(/2 tables/);
  });
  it('loads the server schema into the text box', async () => {
    const spy = vi.spyOn(api, 'serverSchemaSql').mockResolvedValue('CREATE TABLE users (id int PRIMARY KEY);');
    open();
    act(() => void openErImport());
    const area = (await screen.findByLabelText('Schema text')) as HTMLTextAreaElement;
    fireEvent.click(screen.getByRole('button', { name: 'Load from server' }));
    await waitFor(() => expect(area.value).toMatch(/CREATE TABLE users/));
    expect(document.querySelector('.er-preview')!.textContent).toMatch(/1 table/);
    spy.mockRestore();
  });
  it('lists every warning in a collapsible with the count in its header', async () => {
    open();
    act(() => void openErImport());
    const area = await screen.findByLabelText('Schema text');
    fireEvent.change(area, { target: { value: 'CREATE TABLE a (id int, x int REFERENCES nope(id));\nCREATE TABLE b (id int, y int REFERENCES nada(id));\nCREATE TABLE c (id int' } });
    const sum = document.querySelector('.er-preview details summary');
    const n = Number(/^(\d+) warning/.exec(sum?.textContent ?? '')?.[1] ?? 0);
    expect(n).toBeGreaterThan(0);
    expect(document.querySelectorAll('.er-preview details li')).toHaveLength(n);
  });
  it('updates the current page keeping layout, optionally removing missing tables', async () => {
    open();
    act(() => s().loadDiagram(schemaToDiagram(parseSql(SQL).schema)));
    const users = s().nodes.find((n) => tableOf(n).label === 'users')!;
    act(() => s().updateNodeData(users.id, { accent: '#123456' }));
    act(() => void s().transform((ns, es) => ({ nodes: ns.map((n) => (n.id === users.id ? { ...n, position: { x: 777, y: 555 } } : n)), edges: es })));
    act(() => void openErImport());
    const area = await screen.findByLabelText('Schema text');
    fireEvent.change(area, { target: { value: 'CREATE TABLE users (id serial PRIMARY KEY, email text, age int);\nCREATE TABLE logs (id int);' } });
    fireEvent.click(screen.getByLabelText('Update current page (keep layout)'));
    fireEvent.click(screen.getByLabelText(/Remove missing tables/));
    fireEvent.click(screen.getByRole('button', { name: /^Import/ }));
    await waitFor(() => expect(s().nodes.map((n) => tableOf(n).label).sort()).toEqual(['logs', 'users']));
    const u = s().nodes.find((n) => tableOf(n).label === 'users')!;
    expect(u.id).toBe(users.id);
    expect(tableOf(u).accent).toBe('#123456');
    expect(u.position).toEqual({ x: 777, y: 555 });
    expect(tableOf(u).columns.map((c) => c.name)).toEqual(['id', 'email', 'age']);
    expect(s().edges).toHaveLength(0);
  });
  it('exports the page as SQL / Mermaid / DBML / Seedora JSON', async () => {
    open();
    act(() => {
      const d = schemaToDiagram(parseSql(SQL).schema);
      s().loadDiagram(d);
      void openErExport();
    });
    const out = (await screen.findByLabelText('Exported schema')) as HTMLTextAreaElement;
    expect(out.value).toContain('CREATE TABLE "orders"');
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'mermaid' } });
    expect(out.value).toMatch(/^erDiagram/);
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'dbml' } });
    expect(out.value).toContain('Table orders');
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'seedora' } });
    expect(JSON.parse(out.value).tables).toHaveLength(2);
  });
});
