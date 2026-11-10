import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../../App';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { seedProject } from '../../test/workspace';
import { parseSql } from '../../lib/er/sqlParse';
import { schemaToDiagram } from '../../lib/er/convert';
import { tableOf } from '../../lib/er/tableData';

const s = () => useDiagramStore.getState();
const byLabel = (l: string) => s().nodes.find((n) => n.type === 'table' && tableOf(n).label === l)!;
const idOf = (l: string) => byLabel(l).id;

const SQL = `
CREATE TABLE users (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  bio text DEFAULT 'x'
);
CREATE INDEX ix_email ON users (email);
CREATE TABLE orders (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id),
  total numeric
);
`;

async function mount(sql = SQL) {
  localStorage.clear();
  s().reset();
  useUiStore.getState().resetUi();
  const p = seedProject('ER');
  render(<App initialProjectId={p.projectId} />);
  act(() => s().loadDiagram(schemaToDiagram(parseSql(sql).schema)));
  await waitFor(() => expect(screen.getAllByTestId(/^table-/).length).toBeGreaterThan(0));
}
const card = (l: string) => screen.getByTestId(`table-${idOf(l)}`);
const cols = (l: string) => tableOf(byLabel(l)).columns;

describe('TableNode behaviours', () => {
  beforeEach(() => undefined);
  it('shows badges, defaults, index footer, schema label and kind', async () => {
    await mount(SQL);
    const u = card('users');
    expect(u.querySelector('.er-flag.uq')).toBeTruthy();
    expect(u.querySelector('.er-flag.ix')).toBeTruthy();
    expect(u.querySelector('.er-flag.nn')).toBeTruthy();
    expect(u.querySelector('.er-flag.null')).toBeTruthy();
    expect(u.querySelector('.er-default')!.textContent).toContain("'x'");
    expect(u.querySelector('.er-foot-text')!.textContent).toContain('(email)');
    expect(u.querySelector('.er-count')!.textContent).toBe('3');
    expect(u.querySelector('.er-kind')).toBeNull();
    act(() => s().updateTable(idOf('users'), (d) => ({ ...d, schema: 'app', tableKind: 'view', indexes: [...d.indexes, { columns: ['id'], unique: true }, { name: 'n', columns: ['id'], unique: false }], checks: [{ name: 'ck', expr: 'id > 0' }, { expr: 'x' }, { expr: 'y' }] })));
    await waitFor(() => expect(card('users').querySelector('.er-schema')!.textContent).toBe('app'));
    const u2 = card('users');
    expect(u2.querySelector('.er-kind')!.textContent).toBe('view');
    expect(u2.querySelector('.er-tag.uq')!.textContent).toBe('UNIQUE');
    expect(u2.querySelector('.er-more-line')).toBeTruthy();
  });
  it('edits type and comment inline; Escape cancels', async () => {
    await mount();
    const o = card('orders');
    fireEvent.doubleClick(o.querySelectorAll('.er-type')[2]);
    const inp = o.querySelector('input.er-type') as HTMLInputElement;
    fireEvent.change(inp, { target: { value: '  money ' } });
    fireEvent.keyDown(inp, { key: 'Enter' });
    expect(cols('orders')[2].type).toBe('money');
    // blank keeps previous value
    fireEvent.doubleClick(card('orders').querySelectorAll('.er-type')[2]);
    const inp2 = card('orders').querySelector('input.er-type') as HTMLInputElement;
    fireEvent.change(inp2, { target: { value: ' ' } });
    fireEvent.keyDown(inp2, { key: 'Enter' });
    expect(cols('orders')[2].type).toBe('money');
    // comment
    fireEvent.click(screen.getByLabelText('Comment: total'));
    const ci = card('orders').querySelector('input.er-name') as HTMLInputElement;
    expect(ci.getAttribute('aria-label')).toBe('Column comment');
    fireEvent.change(ci, { target: { value: 'sum' } });
    fireEvent.keyDown(ci, { key: 'Enter' });
    expect(cols('orders')[2].comment).toBe('sum');
    expect(card('orders').querySelector('.er-has-comment')).toBeTruthy();
    expect(card('orders').querySelectorAll('.er-name')[2].getAttribute('title')).toBe('total: sum');
    fireEvent.click(screen.getByLabelText('Comment: total'));
    const ci2 = card('orders').querySelector('input.er-name') as HTMLInputElement;
    fireEvent.change(ci2, { target: { value: '  ' } });
    fireEvent.keyDown(ci2, { key: 'Enter' });
    expect(cols('orders')[2].comment).toBeUndefined();
    // escape
    fireEvent.doubleClick(card('orders').querySelectorAll('.er-name')[2]);
    const ni = card('orders').querySelector('input.er-name') as HTMLInputElement;
    fireEvent.change(ni, { target: { value: 'zzz' } });
    fireEvent.keyDown(ni, { key: 'Escape' });
    expect(cols('orders')[2].name).toBe('total');
    expect(card('orders').querySelector('input.er-name')).toBeNull();
  });
  it('toggles NN / UQ / PK flags', async () => {
    await mount();
    fireEvent.click(screen.getByLabelText('NN, not null: total'));
    expect(cols('orders')[2].nullable).toBe(false);
    fireEvent.click(screen.getByLabelText('UQ, unique: total'));
    expect(cols('orders')[2].unique).toBe(true);
    fireEvent.click(screen.getByLabelText('PK, primary key: total'));
    expect(cols('orders')[2].pk).toBe(true);
    fireEvent.click(screen.getByLabelText('PK, primary key: total'));
    expect(cols('orders')[2].pk).toBe(false);
  });
  it('FK jump selects the parent table; missing parent is a no-op', async () => {
    await mount();
    fireEvent.click(screen.getByLabelText('Go to users'));
    expect(s().nodes.find((n) => n.selected)!.id).toBe(idOf('users'));
    act(() => s().updateTable(idOf('users'), (d) => ({ ...d, label: 'people' })));
    act(() => s().selectOnly('node', idOf('orders')));
    fireEvent.click(screen.getByLabelText('Go to users'));
    expect(s().nodes.find((n) => n.selected)!.id).toBe(idOf('orders'));
  });
  it('renames the header on double-click; blank keeps the name', async () => {
    await mount();
    fireEvent.doubleClick(card('orders').querySelector('.er-titles')!);
    let inp = card('orders').querySelector('input.er-title-input') as HTMLInputElement;
    fireEvent.change(inp, { target: { value: ' ' } });
    fireEvent.keyDown(inp, { key: 'Enter' });
    expect(byLabel('orders')).toBeTruthy();
    fireEvent.doubleClick(card('orders').querySelector('.er-titles')!);
    inp = card('orders').querySelector('input.er-title-input') as HTMLInputElement;
    fireEvent.change(inp, { target: { value: 'sales' } });
    fireEvent.keyDown(inp, { key: 'Enter' });
    expect(byLabel('sales')).toBeTruthy();
    expect(useUiStore.getState().editingId).toBeNull();
  });
  it('collapse button toggles and shows "+n more"', async () => {
    await mount();
    const btn = () => card('users').querySelector('.er-collapse') as HTMLElement;
    fireEvent.click(btn());
    expect(btn().getAttribute('aria-label')).toBe('Show all columns');
    expect(card('users').querySelector('.er-more')!.textContent).toBe('+2 more');
    expect(card('users').querySelector('button.er-add')).toBeNull();
    fireEvent.click(btn());
    expect(btn().getAttribute('aria-expanded')).toBe('true');
  });
  it('locked table has no edit controls and ignores double-click', async () => {
    await mount();
    act(() => s().updateNodeData(idOf('orders'), { locked: true }));
    await waitFor(() => expect(card('orders').querySelector('.er-actions')).toBeNull());
    expect(card('orders').querySelector('button.er-add')).toBeNull();
    fireEvent.doubleClick(card('orders').querySelectorAll('.er-name')[1]);
    fireEvent.doubleClick(card('orders').querySelector('.er-titles')!);
    expect(card('orders').querySelector('input')).toBeNull();
    // grip is inert when locked
    fireEvent.pointerDown(card('orders').querySelector('.er-grip')!, { clientY: 0 });
    expect(card('orders').querySelector('.dragging')).toBeNull();
  });
  it('enum tables show value rows only and add empty values', async () => {
    await mount("CREATE TYPE mood AS ENUM ('sad','ok');\nCREATE TABLE t (id int);");
    const e = card('mood');
    expect(e.querySelector('.er-grip')).toBeNull();
    expect(e.querySelector('.er-flags')).toBeNull();
    expect(screen.queryByLabelText('PK, primary key: sad')).toBeNull();
    fireEvent.click(e.querySelector('button.er-add')!);
    expect(cols('mood')).toHaveLength(3);
    expect(cols('mood')[2].name).toBe('value');
    expect(cols('mood')[2].type).toBe('');
  });
  it('drag-reorders a column via the grip', async () => {
    await mount();
    const before = cols('users').map((c) => c.name);
    const grip = card('users').querySelectorAll('.er-grip')[2];
    fireEvent.pointerDown(grip, { clientY: 100 });
    expect(card('users').querySelector('.dragging')).toBeTruthy();
    act(() => { window.dispatchEvent(Object.assign(new Event('pointermove'), { clientY: 20 })); });
    await waitFor(() => expect(card('users').querySelector('[class*="drop-"]')).toBeTruthy());
    act(() => { window.dispatchEvent(new Event('pointerup')); });
    const after = cols('users').map((c) => c.name);
    expect(after).not.toEqual(before);
    expect([...after].sort()).toEqual([...before].sort());
  });
});
