import { createElement, useId, useMemo, useRef, useState } from 'react';
import { diffSchemas, migrationSql } from '@core/schema/migrate';
import { pageToSchema } from '@core/schema/fromPage';
import type { Dialect, Schema } from '@core/schema/types';
import type { CPage } from '@core/types';
import { api, type IntrospectResult } from '../../api/api';
import { ApiError } from '../../api/client';
import { dialogs, type CustomApi } from '../../lib/dialogs';
import { applySchema, type ImportTarget } from '../../lib/er/apply';
import { schemaCounts, type ErSchemaDef } from '../../lib/er/types';
import { activePage } from '../../lib/dsl/bridge';
import { listCompareTargets, loadBaseline, type CompareTarget } from '../../lib/smart/review';
import { downloadText } from '../../lib/export';
import { toast } from '../../store/toastStore';
import { features } from '../../lib/features';
import type { Page, Project } from '../../types';
import { t as tr } from '../../i18n';

/** the schema model is the same shape as the ER import model, plus the (unused here) loose relations */
export const toErSchema = (s: Schema): ErSchemaDef => ({ tables: s.tables as ErSchemaDef['tables'], enums: s.enums, loose: [] });

// ------------------------------------------------------------------------------------------------ live database
interface Picked { result: IntrospectResult; target: ImportTarget; name: string }

export function LiveDbForm({ done, cancel }: CustomApi<Picked>) {
  const id = useId();
  const [dialect, setDialect] = useState<'postgres' | 'mysql' | 'sqlite'>('postgres');
  const [f, setF] = useState({ host: 'localhost', port: '', user: '', password: '', database: '', schema: '', ssl: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<IntrospectResult | null>(null);
  const [name, setName] = useState('');
  const [target, setTarget] = useState<ImportTarget>('newfile');
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.introspectDb({ dialect: dialect as 'postgres' | 'mysql', host: f.host.trim(), ...(f.port ? { port: Number(f.port) } : {}), user: f.user, ...(f.password ? { password: f.password } : {}), database: f.database.trim(), ssl: f.ssl, ...(f.schema ? { schema: f.schema.trim() } : {}) });
      setF((x) => ({ ...x, password: '' })); // the password lived in this form only; it is not kept after the connection
      setName(f.database.trim() || 'Database');
      setResult(r);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const onFile = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      setName(file.name.replace(/\.[^.]+$/, ''));
      setResult(await api.introspectSqlite(file));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const counts = result ? schemaCounts(toErSchema(result.schema)) : null;
  return (
    <form className="dialog-body er-import" autoComplete="off" onSubmit={(e) => { e.preventDefault(); if (result && counts && counts.tables + counts.views > 0) done({ result, target, name }); else if (dialect !== 'sqlite') void connect(); }}>
      <p className="muted">{tr('The server connects once, read-only, runs fixed catalog queries and forgets the password. Nothing is written to your database.')}</p>
      <div className="er-import-row">
        <label className="dialog-field"><span>{tr('Database')}</span>
          <select value={dialect} aria-label={tr('Database type')} onChange={(e) => { setDialect(e.target.value as typeof dialect); setResult(null); }}>
            <option value="postgres">PostgreSQL</option><option value="mysql">MySQL / MariaDB</option><option value="sqlite">{tr('SQLite file')}</option>
          </select>
        </label>
      </div>
      {dialect === 'sqlite' ? (
        <div className="er-import-row">
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>{tr('Choose a .db / .sqlite file…')}</button>
          <input ref={fileRef} type="file" hidden data-testid="sqlite-file" accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3,application/octet-stream" onChange={(e) => { const file = e.target.files?.[0]; if (file) void onFile(file); e.target.value = ''; }} />
        </div>
      ) : (
        <div className="livedb-grid">
          <label className="dialog-field" htmlFor={`${id}-h`}><span>{tr('Host')}</span><input id={`${id}-h`} value={f.host} onChange={(e) => set('host', e.target.value)} /></label>
          <label className="dialog-field" htmlFor={`${id}-p`}><span>{tr('Port')}</span><input id={`${id}-p`} type="number" placeholder={dialect === 'postgres' ? '5432' : '3306'} value={f.port} onChange={(e) => set('port', e.target.value)} /></label>
          <label className="dialog-field" htmlFor={`${id}-u`}><span>{tr('User')}</span><input id={`${id}-u`} autoComplete="off" value={f.user} onChange={(e) => set('user', e.target.value)} /></label>
          <label className="dialog-field" htmlFor={`${id}-w`}><span>{tr('Password')}</span><input id={`${id}-w`} type="password" autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} /></label>
          <label className="dialog-field" htmlFor={`${id}-d`}><span>{tr('Database')}</span><input id={`${id}-d`} value={f.database} onChange={(e) => set('database', e.target.value)} /></label>
          <label className="dialog-field" htmlFor={`${id}-s`}><span>{tr('Schema')}</span><input id={`${id}-s`} placeholder={dialect === 'postgres' ? 'public' : tr('(the database)')} value={f.schema} onChange={(e) => set('schema', e.target.value)} /></label>
          <label className="prop-check"><input type="checkbox" checked={f.ssl} onChange={(e) => set('ssl', e.target.checked)} /> {tr('Use TLS')}</label>
        </div>
      )}
      {error && <p className="er-warn" role="alert">{error}</p>}
      {result && counts && (
        <div className="er-preview" role="status">
          <strong>{tr('{n} tables', { n: result.counts.tables })}</strong>
          {result.counts.views > 0 && <span>{tr('{n} views', { n: result.counts.views })}</span>}
          <span>{tr('{n} columns', { n: counts.columns })}</span><span>{tr('{n} relations', { n: counts.relations })}</span>{counts.indexes > 0 && <span>{tr('{n} indexes', { n: counts.indexes })}</span>}
          {result.warnings.length > 0 && <details className="er-warn"><summary>{tr(result.warnings.length === 1 ? '{n} note' : '{n} notes', { n: result.warnings.length })}</summary><ul>{result.warnings.slice(0, 20).map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
        </div>
      )}
      {result && (
        <fieldset className="er-target">
          <legend>{tr('Insert into')}</legend>
          {([['newfile', 'A new file'], ['page', 'This file (free area)']] as const).map(([v, l]) => (
            <label key={v}><input type="radio" name={`${id}-t`} checked={target === v} onChange={() => setTarget(v)} /> {tr(l)}</label>
          ))}
        </fieldset>
      )}
      <div className="modal-foot dialog-actions">
        <button type="button" onClick={cancel}>{tr('Cancel')}</button>
        {result ? <button type="submit" className="primary">{tr('Import {n} tables', { n: counts!.tables + counts!.views })}</button> : dialect !== 'sqlite' && <button type="submit" className="primary" disabled={busy || !f.host || !f.user || !f.database}>{busy ? tr('Connecting…') : tr('Read schema')}</button>}
      </div>
    </form>
  );
}

/** ⌘K "Import schema from a live database…": PostgreSQL / MySQL over a read-only server-side connection, or an uploaded SQLite file */
export async function openLiveDbImport(): Promise<void> {
  if (!features().schemaTools) { toast.info(tr('Importing from a live database is not available here')); return; }
  const r = await dialogs.custom<Picked>({ title: tr('Import schema from a database'), className: 'er-dialog', render: (a) => createElement(LiveDbForm, a) });
  if (!r) return;
  const n = applySchema(toErSchema(r.result.schema), r.target, r.name);
  toast.success(tr(n === 1 ? 'Imported {n} table' : 'Imported {n} tables', { n }));
}

// ------------------------------------------------------------------------------------------------ migration SQL
const pageOf = (p: Project): CPage => {
  const pg: Page = p.pages.find((x) => x.id === p.activePageId) ?? p.pages[0];
  return { id: pg.id, name: pg.name, nodes: pg.nodes as unknown as CPage['nodes'], edges: pg.edges as unknown as CPage['edges'] };
};

export function MigrationView({ before, after, label }: { before: Schema; after: Schema; label: string }) {
  const [dialect, setDialect] = useState<Dialect>('postgres');
  const [reverse, setReverse] = useState(false);
  const sql = useMemo(() => (reverse ? migrationSql(after, before, dialect) : migrationSql(before, after, dialect)), [before, after, dialect, reverse]);
  const diff = useMemo(() => diffSchemas(reverse ? after : before, reverse ? before : after), [before, after, reverse]);
  return (
    <div className="dialog-body er-export">
      <div className="er-import-row">
        <label className="dialog-field"><span>{tr('Dialect')}</span>
          <select aria-label={tr('Dialect')} value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)}><option value="postgres">PostgreSQL</option><option value="mysql">MySQL / MariaDB</option><option value="sqlite">SQLite</option></select>
        </label>
        <label className="prop-check"><input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} /> {tr('Revert (undo this change)')}</label>
      </div>
      <p className="muted" data-testid="migration-summary">{label}: {diff.isEmpty ? tr('no schema changes') : `${tr(diff.addedTables.length === 1 ? '{n} table added' : '{n} tables added', { n: diff.addedTables.length })}, ${tr('{n} dropped', { n: diff.droppedTables.length })}, ${tr('{n} changed', { n: diff.tables.length })}${diff.renamedTables.length + diff.tables.reduce((n, t) => n + t.renamedColumns.length, 0) ? `, ${tr('{n} renamed', { n: diff.renamedTables.length + diff.tables.reduce((n, t) => n + t.renamedColumns.length, 0) })}` : ''}`}</p>
      <textarea className="er-import-text" readOnly value={sql} aria-label={tr('Migration SQL')} spellCheck={false} />
      <div className="modal-foot dialog-actions">
        <button type="button" onClick={() => void navigator.clipboard?.writeText(sql).then(() => toast.success(tr('Copied')))}>{tr('Copy')}</button>
        <button type="button" className="primary" disabled={diff.isEmpty} onClick={() => downloadText(sql, `migration.${dialect}${reverse ? '.down' : ''}.sql`, 'application/sql')}>{tr('Download .sql')}</button>
      </div>
    </div>
  );
}

function PickBaseline({ done, cancel }: CustomApi<CompareTarget>) {
  const [targets, setTargets] = useState<CompareTarget[] | null>(null);
  if (targets === null) void listCompareTargets().then(setTargets);
  return (
    <div className="dialog-body">
      <p className="muted">{tr('The migration turns the chosen file or version (before) into the open file (after).')}</p>
      {targets === null && <p className="muted">{tr('Loading…')}</p>}
      {targets?.length === 0 && <p className="muted">{tr('There is no other file or saved version to start from.')}</p>}
      <ul className="share-list" aria-label={tr('Start from')}>
        {targets?.map((t) => <li key={`${t.kind}-${t.id}`}><span>{t.name}</span><button type="button" onClick={() => done(t)}>{tr('Use')}</button></li>)}
      </ul>
      <div className="modal-foot dialog-actions"><button type="button" onClick={cancel}>{tr('Cancel')}</button></div>
    </div>
  );
}

/** ⌘K "Migration SQL from changes…": ALTER statements between another file / a version and the open ERD, per dialect */
export async function openMigration(): Promise<void> {
  const t = await dialogs.custom<CompareTarget>({ title: tr('Migration SQL: start from…'), className: 'share-dialog', render: (a) => createElement(PickBaseline, a) });
  if (!t) return;
  try {
    const base = await loadBaseline(t);
    const before = pageToSchema(pageOf(base));
    const after = pageToSchema(activePage());
    await dialogs.custom<null>({ title: tr('Migration SQL'), className: 'er-dialog', render: (a) => createElement('div', null, createElement(MigrationView, { before, after, label: `${t.name} → ${tr('Current')}` }), createElement('div', { className: 'modal-foot dialog-actions' }, createElement('button', { type: 'button', onClick: a.cancel }, tr('Close')))) });
  } catch (e) {
    toast.error(tr('Could not prepare the migration: {msg}', { msg: e instanceof Error ? e.message : String(e) }));
  }
}
