import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pageToSchema } from '@core/schema/fromPage';
import type { Schema } from '@core/schema/types';
import { api } from '../../api/api';
import { ApiError } from '../../api/client';
import { applyText, activePage } from '../../lib/dsl/bridge';
import { dialogs, type CustomApi, type CustomOpts } from '../../lib/dialogs';
import * as erApply from '../../lib/er/apply';
import * as exportLib from '../../lib/export';
import { resetFeatures, setFeatures } from '../../lib/features';
import * as review from '../../lib/smart/review';
import { useDiagramStore } from '../../store/diagramStore';
import { useToastStore } from '../../store/toastStore';
import { LiveDbForm, MigrationView, openLiveDbImport, openMigration } from './SchemaTools';

const s = () => useDiagramStore.getState();
const col = (name: string, extra: Record<string, unknown> = {}) => ({ name, type: 'int', pk: false, unique: false, nullable: true, ...extra });
const table = (name: string, extra: Record<string, unknown> = {}) => ({ name, kind: 'table', columns: [col('id', { pk: true, nullable: false })], indexes: [], checks: [], ...extra });
const result = (tables: unknown[], warnings: string[] = [], views = 0) => ({ schema: { tables, enums: [] } as never, warnings, counts: { tables: tables.length - views, views, enums: 0, columns: tables.length } });
const toasts = () => useToastStore.getState().toasts.map((t) => t.message);
const fill = (user: string, db: string) => {
  fireEvent.change(screen.getByLabelText('User'), { target: { value: user } });
  fireEvent.change(screen.getByLabelText('Database', { selector: 'input' }), { target: { value: db } });
};

beforeEach(() => { cleanup(); s().reset(); resetFeatures(); useToastStore.getState().clear(); });
afterEach(() => { vi.restoreAllMocks(); resetFeatures(); });

describe('LiveDbForm branches', () => {
  it('mysql sends port, password, schema, ssl and trims host/database; shows view and index counts and plural notes', async () => {
    const spy = vi.spyOn(api, 'introspectDb').mockResolvedValue(result([table('users', { indexes: [{ name: 'i', columns: ['id'], unique: false }] }), table('v', { kind: 'view' })], ['a', 'b'], 1));
    const done = vi.fn();
    render(<LiveDbForm done={done} cancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Database type'), { target: { value: 'mysql' } });
    expect(screen.getByLabelText('Port')).toHaveAttribute('placeholder', '3306');
    expect(screen.getByLabelText('Schema')).toHaveAttribute('placeholder', '(the database)');
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: ' db.local ' } });
    fireEvent.change(screen.getByLabelText('Port'), { target: { value: '3307' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.change(screen.getByLabelText('Schema'), { target: { value: ' app ' } });
    fireEvent.click(screen.getByLabelText('Use TLS'));
    fill('bob', ' shop ');
    fireEvent.click(screen.getByRole('button', { name: 'Read schema' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 tables'));
    expect(spy).toHaveBeenCalledWith({ dialect: 'mysql', host: 'db.local', port: 3307, user: 'bob', password: 'pw', database: 'shop', ssl: true, schema: 'app' });
    const st = screen.getByRole('status');
    expect(st).toHaveTextContent('1 views');
    expect(st).toHaveTextContent('1 indexes');
    expect(st).toHaveTextContent('2 notes');
    fireEvent.click(screen.getByLabelText(/This file/));
    fireEvent.click(screen.getByRole('button', { name: /Import 2 tables/ }));
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ target: 'page', name: 'shop' }));
  });

  it('postgres placeholders; ApiError, Error and non-Error rejections show as messages', async () => {
    const spy = vi.spyOn(api, 'introspectDb').mockRejectedValueOnce(new ApiError(400, 'bad', 'denied')).mockRejectedValueOnce('plain text');
    render(<LiveDbForm done={() => undefined} cancel={() => undefined} />);
    expect(screen.getByLabelText('Port')).toHaveAttribute('placeholder', '5432');
    expect(screen.getByLabelText('Schema')).toHaveAttribute('placeholder', 'public');
    fill('bob', 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Read schema' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('denied');
    fireEvent.click(screen.getByRole('button', { name: 'Read schema' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('plain text'));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('submit with empty database falls back to the name "Database"; an empty result re-connects instead of importing', async () => {
    const spy = vi.spyOn(api, 'introspectDb').mockResolvedValue(result([]));
    const done = vi.fn();
    render(<LiveDbForm done={done} cancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText('User'), { target: { value: 'u' } });
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('0 tables'));
    expect(screen.getByRole('button', { name: /Import 0 tables/ })).toBeInTheDocument();
    fireEvent.submit(document.querySelector('form')!); // nothing to import: connects again
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(done).not.toHaveBeenCalled();
  });

  it('sqlite: button opens the picker, an empty selection is ignored, a bad file shows the error, submit without a result does nothing', async () => {
    const spy = vi.spyOn(api, 'introspectSqlite').mockRejectedValue(new Error('not a database'));
    const cancel = vi.fn();
    render(<LiveDbForm done={() => undefined} cancel={cancel} />);
    fireEvent.change(screen.getByLabelText('Database type'), { target: { value: 'sqlite' } });
    expect(screen.queryByRole('button', { name: 'Read schema' })).toBeNull();
    const click = vi.spyOn(screen.getByTestId('sqlite-file'), 'click').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: /Choose a/ }));
    expect(click).toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('sqlite-file'), { target: { files: [] } });
    expect(spy).not.toHaveBeenCalled();
    fireEvent.submit(document.querySelector('form')!);
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('sqlite-file'), { target: { files: [new File(['x'], 'bad.db')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('not a database');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalled();
  });

  it('switching dialect discards a previous result', async () => {
    vi.spyOn(api, 'introspectDb').mockResolvedValue(result([table('t')]));
    render(<LiveDbForm done={() => undefined} cancel={() => undefined} />);
    fill('u', 'd');
    fireEvent.click(screen.getByRole('button', { name: 'Read schema' }));
    await screen.findByRole('status');
    fireEvent.change(screen.getByLabelText('Database type'), { target: { value: 'mysql' } });
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('openLiveDbImport', () => {
  it('is blocked when schema tools are off', async () => {
    setFeatures({ schemaTools: false });
    const custom = vi.spyOn(dialogs, 'custom');
    await openLiveDbImport();
    expect(custom).not.toHaveBeenCalled();
    expect(toasts().some((m) => m.includes('not available'))).toBe(true);
  });
  it('does nothing when the dialog is cancelled; applies and toasts singular/plural when confirmed', async () => {
    const custom = vi.spyOn(dialogs, 'custom').mockResolvedValueOnce(null);
    const apply = vi.spyOn(erApply, 'applySchema').mockReturnValueOnce(1).mockReturnValueOnce(3);
    await openLiveDbImport();
    expect(apply).not.toHaveBeenCalled();
    const picked = { result: result([table('t')]), target: 'newfile' as const, name: 'shop' };
    custom.mockResolvedValue(picked);
    await openLiveDbImport();
    expect(toasts()).toContain('Imported 1 table');
    await openLiveDbImport();
    expect(toasts()).toContain('Imported 3 tables');
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ loose: [] }), 'newfile', 'shop');
    // the dialog renders the form
    const opts = custom.mock.calls[0][0] as CustomOpts<unknown>;
    render(<>{opts.render({ done: () => undefined, cancel: () => undefined })}</>);
    expect(screen.getByLabelText('Database type')).toBeInTheDocument();
  });
});

describe('MigrationView branches', () => {
  const schema = (src: string): Schema => { applyText(src); const sc = pageToSchema(activePage()); s().reset(); return sc; };
  it('identical schemas: no changes summary, download disabled; clipboard copy toasts', async () => {
    const a = schema('#!sdd 1\ntable users {\n id int [pk]\n}\n');
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    render(<MigrationView before={a} after={a} label="L" />);
    expect(screen.getByTestId('migration-summary')).toHaveTextContent('L: no schema changes');
    expect(screen.getByRole('button', { name: 'Download .sql' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(toasts()).toContain('Copied'));
    expect(write).toHaveBeenCalled();
  });
  it('copy is a no-op without a clipboard API', () => {
    const a = schema('#!sdd 1\ntable users {\n id int [pk]\n}\n');
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<MigrationView before={a} after={a} label="L" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(toasts()).not.toContain('Copied');
  });
  it('download names the file by dialect and direction; renames are counted; 2 tables use the plural', () => {
    const dl = vi.spyOn(exportLib, 'downloadText').mockImplementation(() => undefined);
    const b = schema('#!sdd 1\ntable users {\n id int [pk]\n email text\n}\n');
    const a = schema('#!sdd 1\ntable users {\n id int [pk]\n mail text\n}\ntable a1 {\n id int [pk]\n}\ntable a2 {\n id int [pk]\n}\n');
    render(<MigrationView before={b} after={a} label="L" />);
    const sum = screen.getByTestId('migration-summary');
    expect(sum).toHaveTextContent('2 tables added');
    expect(sum).toHaveTextContent('1 changed');
    fireEvent.click(screen.getByRole('button', { name: 'Download .sql' }));
    expect(dl).toHaveBeenLastCalledWith(expect.any(String), 'migration.postgres.sql', 'application/sql');
    fireEvent.click(screen.getByLabelText('Revert (undo this change)'));
    fireEvent.change(screen.getByLabelText('Dialect'), { target: { value: 'sqlite' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download .sql' }));
    expect(dl).toHaveBeenLastCalledWith(expect.any(String), 'migration.sqlite.down.sql', 'application/sql');
  });
});

describe('openMigration + baseline picker', () => {
  const target = { kind: 'file' as const, id: 'f1', name: 'Other' };
  const baselineProject = () => { applyText('#!sdd 1\ntable users {\n id int [pk]\n}\n'); const p = structuredClone(s().toProject()); s().reset(); return p; };

  it('picker lists targets, an empty state, and "Use" resolves with the chosen target', async () => {
    const lt = vi.spyOn(review, 'listCompareTargets').mockResolvedValueOnce([]).mockResolvedValue([target]);
    const custom = vi.spyOn(dialogs, 'custom').mockResolvedValue(null);
    await openMigration();
    const opts = custom.mock.calls[0][0] as CustomOpts<unknown>;
    const done = vi.fn();
    const cancel = vi.fn();
    const { unmount } = render(<>{opts.render({ done, cancel } as CustomApi<unknown>)}</>);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByText('There is no other file or saved version to start from.')).toBeInTheDocument();
    unmount();
    render(<>{opts.render({ done, cancel } as CustomApi<unknown>)}</>);
    fireEvent.click(await screen.findByRole('button', { name: 'Use' }));
    expect(done).toHaveBeenCalledWith(target);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalled();
    expect(lt).toHaveBeenCalled();
  });

  it('cancelled picker stops; chosen baseline opens the SQL dialog (active page falls back to the first)', async () => {
    const custom = vi.spyOn(dialogs, 'custom').mockResolvedValueOnce(null);
    const load = vi.spyOn(review, 'loadBaseline');
    await openMigration();
    expect(load).not.toHaveBeenCalled();
    const base = { ...baselineProject(), activePageId: 'missing' };
    load.mockResolvedValue(base);
    applyText('#!sdd 1\ntable users {\n id int [pk]\n nick text\n}\n');
    custom.mockResolvedValueOnce(target).mockResolvedValueOnce(null);
    await openMigration();
    const opts = custom.mock.calls[2][0] as CustomOpts<unknown>;
    const cancel = vi.fn();
    render(<>{opts.render({ done: () => undefined, cancel } as CustomApi<unknown>)}</>);
    expect(screen.getByTestId('migration-summary')).toHaveTextContent('Other → Current: 0 tables added, 0 dropped, 1 changed');
    expect((screen.getByLabelText('Migration SQL') as HTMLTextAreaElement).value).toContain('ADD COLUMN "nick"');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(cancel).toHaveBeenCalled();
  });

  it('a failing baseline load toasts the error message (Error and non-Error)', async () => {
    vi.spyOn(dialogs, 'custom').mockResolvedValue(target);
    const load = vi.spyOn(review, 'loadBaseline').mockRejectedValueOnce(new Error('no document')).mockRejectedValueOnce('weird');
    await act(() => openMigration());
    await act(() => openMigration());
    expect(load).toHaveBeenCalledTimes(2);
    expect(toasts()).toContain('Could not prepare the migration: no document');
    expect(toasts()).toContain('Could not prepare the migration: weird');
  });
});
