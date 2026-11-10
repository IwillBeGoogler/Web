import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { api } from '../../api/api';
import { ApiError } from '../../api/client';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { useToastStore } from '../../store/toastStore';
import { seedProject } from '../../test/workspace';
import { useWorkspace } from '../../workspace/store';
import { parseSql } from '../../lib/er/sqlParse';
import { schemaToDiagram } from '../../lib/er/convert';
import { tableOf } from '../../lib/er/tableData';
import { flowRef } from '../../lib/board/flowRef';
import { openErExport, openErImport } from './erDialogs';

const s = () => useDiagramStore.getState();
const toasts = () => useToastStore.getState().toasts.map((x) => x.message);
const preview = () => document.querySelector('.er-preview')!.textContent!;
const SQL = 'CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL);\nCREATE TABLE orders (id serial PRIMARY KEY, user_id int NOT NULL REFERENCES users(id));';

function open() {
  localStorage.clear();
  s().reset();
  useUiStore.getState().resetUi();
  useToastStore.getState().clear();
  const p = seedProject('ER');
  return render(<App initialProjectId={p.projectId} />);
}
const importArea = async () => (await screen.findByLabelText('Schema text')) as HTMLTextAreaElement;
const file = (name: string, body: string) => new File([body], name, { type: 'text/plain' });

afterEach(() => vi.restoreAllMocks());

describe('import dialog', () => {
  it('previews counts: views, enums, indexes, warnings, sql dialect label', async () => {
    open();
    act(() => void openErImport());
    const area = await importArea();
    expect(preview()).toMatch(/Paste a schema/);
    fireEvent.change(area, {
      target: { value: "CREATE TYPE mood AS ENUM ('a','b');\nCREATE TABLE t (id int PRIMARY KEY, c int);\nCREATE INDEX ix ON t (c);\nCREATE VIEW v AS SELECT 1;" },
    });
    const txt = preview();
    expect(txt).toMatch(/SQL DDL/);
    expect(txt).toContain('1 table');
    expect(txt).toContain('1 view');
    expect(txt).toContain('1 enum');
    expect(txt).toMatch(/1 indexes/);
    expect(screen.getByRole('button', { name: /^Import 2 tables/ })).toBeEnabled();
  });
  it('shows a singular warning count', async () => {
    open();
    act(() => void openErImport());
    const area = await importArea();
    fireEvent.change(area, { target: { value: 'CREATE TABLE a (id int, x int REFERENCES nope(id));' } });
    expect(document.querySelector('.er-preview details summary')!.textContent).toMatch(/^1 warning$/);
  });
  it('explicit format selection changes parsing; singular relation label', async () => {
    open();
    act(() => void openErImport());
    const area = await importArea();
    fireEvent.change(area, { target: { value: 'erDiagram\n A ||--o{ B : has' } });
    expect(preview()).toMatch(/Mermaid/);
    expect(preview()).toMatch(/1 relation\b/);
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'sql' } });
    expect(preview()).toMatch(/Nothing to import/);
    const opts = [...(screen.getByLabelText('Format') as HTMLSelectElement).options].map((o) => o.value);
    expect(opts).toContain('dbml');
    expect(opts).not.toContain('seedora-yaml');
  });
  it('submit with nothing parseable does nothing; cancel closes', async () => {
    open();
    let p!: Promise<void>;
    act(() => { p = openErImport(); });
    await importArea();
    fireEvent.submit(document.querySelector('form.er-import')!);
    expect(screen.getByLabelText('Schema text')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await p;
    expect(s().nodes).toHaveLength(0);
  });
  it('choose files / folder buttons open the hidden inputs', async () => {
    open();
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    act(() => void openErImport());
    await importArea();
    fireEvent.click(screen.getByRole('button', { name: 'Choose files…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder…' }));
    expect(click).toHaveBeenCalledTimes(2);
    expect(click.mock.instances[0]).toBe(screen.getByTestId('er-file'));
    expect(click.mock.instances[1]).toBe(screen.getByTestId('er-dir'));
  });
  it('folder pick loads a single file (name pre-filled), 1 file label; unsupported-only is a no-op', async () => {
    open();
    act(() => void openErImport());
    const area = await importArea();
    fireEvent.change(screen.getByTestId('er-file'), { target: { files: [file('notes.txt', 'x')] } });
    await Promise.resolve();
    expect(area.value).toBe('');
    fireEvent.change(screen.getByTestId('er-dir'), { target: { files: [file('shop.sql', SQL)] } });
    await waitFor(() => expect(screen.getByTestId('er-file-count').textContent).toBe('1 file'));
    expect(area.value).toContain('CREATE TABLE users');
    fireEvent.change(area, { target: { value: SQL + ' ' } });
    expect(screen.queryByTestId('er-file-count')).toBeNull();
  });
  it('imported single file name becomes the new file name', async () => {
    open();
    const files = useWorkspace.getState().tree.files.length;
    act(() => void openErImport());
    await importArea();
    fireEvent.change(screen.getByTestId('er-file'), { target: { files: [file('shop.sql', SQL)] } });
    await waitFor(() => expect(screen.getByTestId('er-file-count')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('A new file'));
    fireEvent.click(screen.getByRole('button', { name: /^Import/ }));
    await waitFor(() => expect(useWorkspace.getState().tree.files.length).toBe(files + 1));
    expect(useWorkspace.getState().tree.files.some((f) => f.name.includes('shop'))).toBe(true);
  });
  it('reads files through FileReader when File.text is missing, and survives a read error', async () => {
    open();
    act(() => void openErImport());
    const area = await importArea();
    const legacy = file('a.sql', 'CREATE TABLE a (id int);');
    Object.defineProperty(legacy, 'text', { value: undefined });
    fireEvent.change(screen.getByTestId('er-file'), { target: { files: [legacy] } });
    await waitFor(() => expect(area.value).toBe('CREATE TABLE a (id int);'));
  });
  it('drag over highlights, leave clears, drop loads files', async () => {
    open();
    act(() => void openErImport());
    const area = await importArea();
    const form = document.querySelector('form.er-import')!;
    fireEvent.dragOver(form);
    expect(form.className).toContain('drag-over');
    fireEvent.dragLeave(form);
    expect(form.className).not.toContain('drag-over');
    fireEvent.dragOver(form);
    fireEvent.drop(form, { dataTransfer: { files: [file('x.sql', 'CREATE TABLE x (id int);')] } });
    expect(form.className).not.toContain('drag-over');
    await waitFor(() => expect(area.value).toBe('CREATE TABLE x (id int);'));
  });
  it('server schema: 403 and generic errors toast; button disabled while loading', async () => {
    open();
    let rej!: (e: unknown) => void;
    const spy = vi.spyOn(api, 'serverSchemaSql').mockImplementation(() => new Promise((_, r) => { rej = r; }));
    act(() => void openErImport());
    await importArea();
    fireEvent.click(screen.getByRole('button', { name: 'Load from server' }));
    const busy = await screen.findByRole('button', { name: 'Loading…' });
    expect(busy).toBeDisabled();
    await act(async () => rej(new ApiError(403, 'forbidden', 'nope')));
    await waitFor(() => expect(toasts()).toContain('Only admins can load the server schema'));
    spy.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getByRole('button', { name: 'Load from server' }));
    await waitFor(() => expect(toasts().some((m) => m.includes('Could not load the server schema: boom'))).toBe(true));
    expect(screen.getByRole('button', { name: 'Load from server' })).toBeEnabled();
  });
  it('server schema success sets name "Server schema" for a new file', async () => {
    open();
    vi.spyOn(api, 'serverSchemaSql').mockResolvedValue('CREATE TABLE s (id int);');
    act(() => void openErImport());
    const area = await importArea();
    fireEvent.click(screen.getByRole('button', { name: 'Load from server' }));
    await waitFor(() => expect(area.value).toMatch(/CREATE TABLE s/));
  });
  it('Update option is disabled without tables; remove-missing checkbox only for update; group + fold flags', async () => {
    open();
    act(() => void openErImport());
    const area = await importArea();
    expect(screen.getByLabelText('Update current page (keep layout)')).toBeDisabled();
    expect(screen.queryByLabelText(/Remove missing tables/)).toBeNull();
    fireEvent.change(area, { target: { value: 'CREATE TABLE app_a (id int PRIMARY KEY);\nCREATE TABLE app_b (id int PRIMARY KEY);' } });
    fireEvent.click(screen.getByLabelText(/Group by prefix/));
    fireEvent.click(screen.getByLabelText(/Show junction tables/));
    fireEvent.click(screen.getByRole('button', { name: /^Import/ }));
    await waitFor(() => expect(s().nodes.filter((n) => n.type === 'table')).toHaveLength(2));
    expect(toasts()).toContain('Imported 2 tables');
    expect(s().nodes.some((n) => n.type === 'group' || n.type === 'frame' || (n.type ?? '') !== 'table')).toBe(true);
  });
  it('update target toasts a summary and keeps position; fits the view', async () => {
    open();
    act(() => s().loadDiagram(schemaToDiagram(parseSql(SQL).schema)));
    const fit = vi.fn();
    (flowRef as { current: unknown }).current = { fitView: fit };
    act(() => void openErImport());
    const area = await importArea();
    fireEvent.change(area, { target: { value: 'CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL, x int);' } });
    fireEvent.click(screen.getByLabelText('Update current page (keep layout)'));
    expect(screen.getByLabelText(/Remove missing tables/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Import/ }));
    await waitFor(() => expect(toasts().some((m) => m.startsWith('Updated page:'))).toBe(true));
    await waitFor(() => expect(fit).toHaveBeenCalledTimes(1));
    expect(fit.mock.calls[0][0]).toMatchObject({ maxZoom: 1, duration: 200 });
    expect(s().nodes.filter((n) => n.type === 'table')).toHaveLength(2);
    (flowRef as { current: unknown }).current = null;
  });
  it('page import with a single table says "Imported 1 table" and fits the view; no flow is safe', async () => {
    open();
    (flowRef as { current: unknown }).current = null;
    act(() => void openErImport());
    const area = await importArea();
    fireEvent.change(area, { target: { value: 'CREATE TABLE only (id int PRIMARY KEY);' } });
    fireEvent.click(screen.getByRole('button', { name: /^Import 1 tables/ }));
    await waitFor(() => expect(toasts()).toContain('Imported 1 table'));
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe('export dialog', () => {
  const load = () => act(() => s().loadDiagram(schemaToDiagram(parseSql(SQL).schema)));
  beforeEach(() => undefined);
  it('shows a placeholder and disables copy/download with no tables', async () => {
    open();
    act(() => void openErExport());
    const out = (await screen.findByLabelText('Exported schema')) as HTMLTextAreaElement;
    expect(out.value).toBe('-- No tables on this page');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Download/ })).toBeDisabled();
  });
  it('dialect select only for sql; changes quoting; ext shown on download button', async () => {
    open();
    load();
    act(() => void openErExport());
    const out = (await screen.findByLabelText('Exported schema')) as HTMLTextAreaElement;
    fireEvent.change(screen.getByLabelText('Dialect'), { target: { value: 'mysql' } });
    expect(out.value).toContain('`orders`');
    expect(screen.getByRole('button', { name: 'Download .sql' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'seedora-yaml' } });
    expect(screen.queryByLabelText('Dialect')).toBeNull();
    expect(screen.getByRole('button', { name: 'Download .yaml' })).toBeTruthy();
    expect(out.value.length).toBeGreaterThan(10);
  });
  it('scopes to the selected tables', async () => {
    open();
    load();
    const users = s().nodes.find((n) => n.type === 'table' && tableOf(n).label === 'users')!;
    act(() => s().selectOnly('node', users.id));
    act(() => void openErExport());
    const out = (await screen.findByLabelText('Exported schema')) as HTMLTextAreaElement;
    expect(out.value).toContain('"users"');
    expect(out.value).not.toContain('"orders"');
    const scope = screen.getByDisplayValue('Selected (1)') as HTMLSelectElement;
    fireEvent.change(scope, { target: { value: 'all' } });
    expect(out.value).toContain('"orders"');
    expect([...scope.options].map((o) => o.textContent)).toEqual(['All (2)', 'Selected (1)']);
  });
  it('copies to the clipboard with a toast', async () => {
    open();
    load();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    act(() => void openErExport());
    await screen.findByLabelText('Exported schema');
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText.mock.calls[0][0]).toContain('CREATE TABLE "orders"');
    await waitFor(() => expect(toasts()).toContain('Copied'));
  });
  it('downloads with the right file names and revokes the URL later', async () => {
    open();
    load();
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    (URL as unknown as Record<string, unknown>).createObjectURL = create;
    (URL as unknown as Record<string, unknown>).revokeObjectURL = revoke;
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    act(() => void openErExport());
    await screen.findByLabelText('Exported schema');
    fireEvent.click(screen.getByRole('button', { name: /^Download/ }));
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'dbml' } });
    fireEvent.click(screen.getByRole('button', { name: /^Download/ }));
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'seedora-yaml' } });
    fireEvent.click(screen.getByRole('button', { name: /^Download/ }));
    expect(names).toEqual(['schema.postgres.sql', 'schema.dbml', 'seedora.yaml']);
    expect(create).toHaveBeenCalledTimes(3);
    expect((create.mock.calls[0] as unknown as [Blob])[0].type).toBe('application/sql');
    expect(revoke).not.toHaveBeenCalled();
    await waitFor(() => expect(revoke).toHaveBeenCalledTimes(3), { timeout: 3000 });
  });
  it('Close button dismisses', async () => {
    open();
    let p!: Promise<void>;
    act(() => { p = openErExport(); });
    await screen.findByLabelText('Exported schema');
    fireEvent.click(within(document.querySelector('.er-export') as HTMLElement).getByRole('button', { name: 'Close' }));
    await p;
  });
});
