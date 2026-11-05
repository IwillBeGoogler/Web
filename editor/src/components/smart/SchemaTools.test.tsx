import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyText } from '../../lib/dsl/bridge';
import { exportErText } from '../../lib/er/io';
import { diagramToSchema } from '../../lib/er/convert';
import { api } from '../../api/api';
import { useDiagramStore } from '../../store/diagramStore';
import { pageToSchema } from '@core/schema/fromPage';
import { activePage } from '../../lib/dsl/bridge';
import { LiveDbForm, MigrationView } from './SchemaTools';

const s = () => useDiagramStore.getState();
beforeEach(() => s().reset());
const SCHEMA = { tables: [{ name: 'users', kind: 'table', columns: [{ name: 'id', type: 'int', pk: true, unique: false, nullable: false }], indexes: [], checks: [] }], enums: [] };

describe('live database import form', () => {
  it('sends the connection once, shows counts, clears the password and hands the result on', async () => {
    const spy = vi.spyOn(api, 'introspectDb').mockResolvedValue({ schema: SCHEMA as never, warnings: ['note one'], counts: { tables: 1, views: 0, enums: 0, columns: 1 } });
    const done = vi.fn();
    render(<LiveDbForm done={done} cancel={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Read schema' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('User'), { target: { value: 'bob' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });
    fireEvent.change(screen.getByLabelText('Database', { selector: 'input' }), { target: { value: 'shop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Read schema' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 tables'));
    expect(spy).toHaveBeenCalledWith({ dialect: 'postgres', host: 'localhost', user: 'bob', password: 'hunter2', database: 'shop', ssl: false });
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe(''); // not kept
    expect(screen.getByRole('status')).toHaveTextContent('1 note');
    fireEvent.click(screen.getByRole('button', { name: /Import 1 tables/ }));
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ target: 'newfile', name: 'shop' }));
    spy.mockRestore();
  });
  it('shows the server error without crashing', async () => {
    const spy = vi.spyOn(api, 'introspectDb').mockRejectedValue(new Error('Private addresses are not allowed'));
    render(<LiveDbForm done={() => undefined} cancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText('User'), { target: { value: 'bob' } });
    fireEvent.change(screen.getByLabelText('Database', { selector: 'input' }), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Read schema' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Private addresses are not allowed');
    spy.mockRestore();
  });
  it('SQLite mode takes a file instead of credentials', async () => {
    const spy = vi.spyOn(api, 'introspectSqlite').mockResolvedValue({ schema: SCHEMA as never, warnings: [], counts: { tables: 1, views: 0, enums: 0, columns: 1 } });
    render(<LiveDbForm done={() => undefined} cancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Database type'), { target: { value: 'sqlite' } });
    expect(screen.queryByLabelText('Password')).toBeNull();
    fireEvent.change(screen.getByTestId('sqlite-file'), { target: { files: [new File(['x'], 'shop.sqlite')] } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 tables'));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('migration SQL view', () => {
  const before = () => { applyText('#!sdd 1\ntable users {\n id int [pk]\n email text\n}\n'); const sc = pageToSchema(activePage()); s().reset(); return sc; };
  it('shows the SQL for the chosen dialect, a summary, and can be reverted', () => {
    const b = before();
    applyText('#!sdd 1\ntable users {\n id int [pk]\n email text\n nick text\n}\ntable posts {\n id int [pk]\n}\n');
    const a = pageToSchema(activePage());
    render(<MigrationView before={b} after={a} label="v1 → Current" />);
    expect(screen.getByTestId('migration-summary')).toHaveTextContent('1 table added, 0 dropped, 1 changed');
    const sql = () => (screen.getByLabelText('Migration SQL') as HTMLTextAreaElement).value;
    expect(sql()).toContain('ALTER TABLE "users" ADD COLUMN "nick" text;');
    fireEvent.change(screen.getByLabelText('Dialect'), { target: { value: 'mysql' } });
    expect(sql()).toContain('ALTER TABLE `users` ADD COLUMN `nick` text;');
    fireEvent.click(screen.getByLabelText('Revert (undo this change)'));
    expect(sql()).toContain('ALTER TABLE `users` DROP COLUMN `nick`;');
    expect(sql()).toContain('DROP TABLE `posts`;');
  });
});

describe('Seedora yaml export in the ER export formats', () => {
  it('renders seedora.yaml from the canvas schema', () => {
    applyText('#!sdd 1\ntable users {\n id uuid [pk]\n email text [not null]\n}\ntable orders {\n id int [pk]\n user_id uuid [ref: > users.id]\n}\n');
    const yaml = exportErText(diagramToSchema(s().nodes, s().edges), 'seedora-yaml');
    expect(yaml).toMatch(/^# seedora\.yaml/);
    expect(yaml).toContain('generator: email');
    expect(yaml).toContain('generator: reference');
  });
});
