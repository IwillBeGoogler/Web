import { createElement, useId, useMemo, useRef, useState } from 'react';
import { dialogs, type CustomApi } from '../../lib/dialogs';
import { useDiagramStore } from '../../store/diagramStore';
import { toast } from '../../store/toastStore';
import { useLayoutStore } from '../../store/layoutStore';
import { flowRef } from '../../lib/board/flowRef';
import { fitPadding } from '../../lib/viewport';
import { t } from '../../i18n';
import { api } from '../../api/api';
import type { ApiError } from '../../api/client';
import { diagramToSchema } from '../../lib/er/convert';
import { ER_FORMATS, IMPORT_EXTS, combineFiles, exportErText, importErText, isImportFile, type ErFormat } from '../../lib/er/io';
import { applySchema, mergeSchemaIntoPage, type ImportTarget } from '../../lib/er/apply';
import { DIALECTS, schemaCounts, type Dialect, type ErSchemaDef } from '../../lib/er/types';

const SAMPLE = `-- Paste SQL DDL, a Mermaid erDiagram, DBML or a Seedora schema JSON
CREATE TABLE users (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE
);
CREATE TABLE orders (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total numeric(10,2) NOT NULL DEFAULT 0
);`;

interface ImportResult { schema: ErSchemaDef; target: ImportTarget; name: string; fold: boolean; group: boolean; removeMissing: boolean }

const readFile = (f: File): Promise<string> => (typeof f.text === 'function' ? f.text() : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(f); }));

function ImportForm({ done, cancel }: CustomApi<ImportResult>) {
  const [text, setText] = useState('');
  const [format, setFormat] = useState<ErFormat | 'auto'>('auto');
  const [target, setTarget] = useState<ImportTarget>('page');
  const [fileName, setFileName] = useState('');
  const [fold, setFold] = useState(false);
  const [group, setGroup] = useState(false);
  const [removeMissing, setRemoveMissing] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const [over, setOver] = useState(false);
  const hasTables = useDiagramStore((s) => s.nodes.some((n) => n.type === 'table'));
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  // several files (or a folder): only readable kinds, joined in natural name order
  const load = async (list: File[]) => {
    const files = list.filter((f) => isImportFile(f.name));
    if (!files.length) return;
    const texts = await Promise.all(files.map(async (f) => ({ name: f.name, path: f.webkitRelativePath, text: await readFile(f) })));
    setText(combineFiles(texts));
    setFileCount(files.length);
    setFileName(files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : '');
  };
  // the app's own live schema (admin endpoint)
  const [loadingServer, setLoadingServer] = useState(false);
  const loadServer = async () => {
    setLoadingServer(true);
    try {
      setText(await api.serverSchemaSql());
      setFileCount(0);
      setFileName('Server schema');
    } catch (err) {
      toast.error((err as ApiError).status === 403 ? t('Only admins can load the server schema') : t('Could not load the server schema: {msg}', { msg: (err as Error).message }));
    } finally {
      setLoadingServer(false);
    }
  };
  const id = useId();
  const parsed = useMemo(() => (text.trim() ? importErText(text, format) : null), [text, format]);
  const counts = parsed ? schemaCounts(parsed.schema) : null;
  const empty = !counts || counts.tables + counts.views + counts.enums === 0;
  const label = ER_FORMATS.find((f) => f.id === parsed?.format)?.label;
  return (
    <form
      className={`dialog-body er-import${over ? ' drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void load([...e.dataTransfer.files]); }}
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed && !empty) done({ schema: parsed.schema, target, name: fileName || 'Imported schema', fold, group, removeMissing });
      }}
    >
      <div className="er-import-row">
        <label className="dialog-field" htmlFor={`${id}-fmt`}>
          <span>{t('Format')}</span>
          <select id={`${id}-fmt`} value={format} onChange={(e) => setFormat(e.target.value as ErFormat | 'auto')}>
            <option value="auto">{t('Detect automatically')}</option>
            {ER_FORMATS.filter((f) => f.canImport !== false).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => fileRef.current?.click()}>{t('Choose files…')}</button>
        <button type="button" onClick={() => dirRef.current?.click()}>{t('Choose folder…')}</button>
        <button type="button" disabled={loadingServer} onClick={() => void loadServer()}>{loadingServer ? t('Loading…') : t('Load from server')}</button>
        {fileCount > 0 && <span className="muted" data-testid="er-file-count">{t(fileCount === 1 ? '{n} file' : '{n} files', { n: fileCount })}</span>}
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept={IMPORT_EXTS.map((x) => `.${x}`).join(',')}
          data-testid="er-file"
          onChange={(e) => { const l = [...(e.target.files ?? [])]; e.target.value = ''; void load(l); }}
        />
        <input
          ref={dirRef}
          type="file"
          hidden
          multiple
          {...{ webkitdirectory: '' }}
          data-testid="er-dir"
          onChange={(e) => { const l = [...(e.target.files ?? [])]; e.target.value = ''; void load(l); }}
        />
      </div>
      <textarea
        className="er-import-text"
        data-autofocus
        spellCheck={false}
        placeholder={SAMPLE}
        value={text}
        onChange={(e) => { setText(e.target.value); setFileCount(0); }}
        aria-label={t('Schema text')}
      />
      <div className="er-preview" role="status" aria-live="polite">
        {!parsed ? (
          <span className="muted">{t('Paste a schema or choose a file. PostgreSQL, MySQL / MariaDB and SQLite DDL, Mermaid erDiagram, DBML and Seedora JSON are understood.')}</span>
        ) : empty ? (
          <span className="er-warn">{t('Nothing to import: no tables found.')}</span>
        ) : (
          <>
            <strong>{label}{parsed.format === 'sql' && parsed.dialect ? ` · ${DIALECTS.find((d) => d.id === parsed.dialect)?.label}` : ''}</strong>
            <span>{t(counts!.tables === 1 ? '{n} table' : '{n} tables', { n: counts!.tables })}</span>
            {counts!.views > 0 && <span>{t(counts!.views === 1 ? '{n} view' : '{n} views', { n: counts!.views })}</span>}
            <span>{t('{n} columns', { n: counts!.columns })}</span>
            <span>{t(counts!.relations === 1 ? '{n} relation' : '{n} relations', { n: counts!.relations })}</span>
            {counts!.enums > 0 && <span>{t(counts!.enums === 1 ? '{n} enum' : '{n} enums', { n: counts!.enums })}</span>}
            {counts!.indexes > 0 && <span>{t('{n} indexes', { n: counts!.indexes })}</span>}
          </>
        )}
        {parsed && parsed.warnings.length > 0 && <details className="er-warn"><summary>{t(parsed.warnings.length === 1 ? '{n} warning' : '{n} warnings', { n: parsed.warnings.length })}</summary><ul>{parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
      </div>
      <fieldset className="er-target">
        <legend>{t('Insert into')}</legend>
        {([['page', 'This file (free area)'], ['update', 'Update current page (keep layout)'], ['newfile', 'A new file']] as const).map(([v, l]) => (
          <label key={v}><input type="radio" name={`${id}-t`} checked={target === v} disabled={v === 'update' && !hasTables} onChange={() => setTarget(v)} /> {t(l)}</label>
        ))}
      </fieldset>
      {target === 'update' && <label className="er-fold"><input type="checkbox" checked={removeMissing} onChange={(e) => setRemoveMissing(e.target.checked)} /> {t('Remove missing tables (tables on the page that are not in the import)')}</label>}
      <label className="er-fold"><input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} /> {t('Group by prefix (tables sharing a name prefix before the first _ go into a group)')}</label>
      <label className="er-fold"><input type="checkbox" checked={fold} onChange={(e) => setFold(e.target.checked)} /> {t('Show junction tables (two foreign keys forming the composite key) as many-to-many')}</label>
      <div className="modal-foot dialog-actions">
        <button type="button" onClick={cancel}>{t('Cancel')}</button>
        <button type="submit" className="primary" disabled={empty}>{t('Import')}{counts && !empty ? ` ${t('{n} tables', { n: counts.tables + counts.views })}` : ''}</button>
      </div>
    </form>
  );
}

/** File › Import schema…: SQL DDL, Mermaid, DBML, Seedora JSON, previewed, then laid out automatically. */
export async function openErImport(): Promise<void> {
  const r = await dialogs.custom<ImportResult>({ title: t('Import database schema'), className: 'er-dialog', render: (api) => createElement(ImportForm, api) });
  if (!r) return;
  const opts = { foldJunctions: r.fold, groupByPrefix: r.group, removeMissing: r.removeMissing };
  if (r.target === 'update') {
    const m = mergeSchemaIntoPage(r.schema, opts);
    toast.success(t('Updated page: {a} added, {u} updated, {r} removed', { a: m.added, u: m.updated, r: m.removed }));
    fitImported();
    return;
  }
  const n = applySchema(r.schema, r.target, r.name, opts);
  toast.success(t(n === 1 ? 'Imported {n} table' : 'Imported {n} tables', { n }));
  if (r.target === 'page') fitImported();
}

/** Show the whole page once the new tables are measured, clear of the open side panels. */
function fitImported(): void {
  requestAnimationFrame(() => {
    const { sidebarOpen, inspectorOpen, wsbar } = useLayoutStore.getState();
    void flowRef.current?.fitView({ padding: fitPadding(sidebarOpen, inspectorOpen, wsbar), maxZoom: 1, duration: 200 });
  });
}

function ExportForm({ cancel }: CustomApi<null>) {
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const [format, setFormat] = useState<ErFormat>('sql');
  const [dialect, setDialect] = useState<Dialect>('postgres');
  const selected = nodes.filter((n) => n.type === 'table' && n.selected).length;
  const [scope, setScope] = useState<'all' | 'selected'>(selected >= 1 ? 'selected' : 'all');
  const id = useId();
  const out = useMemo(() => {
    const keep = scope === 'selected' ? new Set(nodes.filter((n) => n.selected).map((n) => n.id)) : null;
    const ns = keep ? nodes.filter((n) => keep.has(n.id)) : nodes;
    const es = keep ? edges.filter((e) => keep.has(e.source) && keep.has(e.target)) : edges;
    return exportErText(diagramToSchema(ns, es), format, dialect);
  }, [nodes, edges, format, dialect, scope]);
  const meta = ER_FORMATS.find((f) => f.id === format)!;
  const tableCount = nodes.filter((n) => n.type === 'table').length;
  return (
    <div className="dialog-body er-export">
      <div className="er-import-row">
        <label className="dialog-field" htmlFor={`${id}-f`}>
          <span>{t('Format')}</span>
          <select id={`${id}-f`} value={format} onChange={(e) => setFormat(e.target.value as ErFormat)}>
            {ER_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        {format === 'sql' && (
          <label className="dialog-field" htmlFor={`${id}-d`}>
            <span>{t('Dialect')}</span>
            <select id={`${id}-d`} value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)}>
              {DIALECTS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
        )}
        {selected > 0 && (
          <label className="dialog-field">
            <span>{t('Tables')}</span>
            <select value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'selected')}>
              <option value="all">{t('All ({n})', { n: tableCount })}</option>
              <option value="selected">{t('Selected ({n})', { n: selected })}</option>
            </select>
          </label>
        )}
      </div>
      <textarea className="er-import-text" readOnly value={tableCount ? out : '-- ' + t('No tables on this page')} aria-label={t('Exported schema')} spellCheck={false} />
      <div className="modal-foot dialog-actions">
        <button type="button" onClick={cancel}>{t('Close')}</button>
        <button type="button" disabled={!tableCount} onClick={() => void navigator.clipboard?.writeText(out).then(() => toast.success(t('Copied')))}>{t('Copy')}</button>
        <button
          type="button"
          className="primary"
          disabled={!tableCount}
          onClick={() => {
            const url = URL.createObjectURL(new Blob([out], { type: meta.mime }));
            const a = document.createElement('a');
            a.href = url;
            a.download = format === 'seedora-yaml' ? 'seedora.yaml' : `schema${format === 'sql' ? `.${dialect}` : ''}.${meta.ext}`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          {t('Download .{ext}', { ext: meta.ext })}
        </button>
      </div>
    </div>
  );
}

/** File › Export schema…: SQL DDL per dialect, Mermaid, DBML, Seedora JSON. */
export async function openErExport(): Promise<void> {
  await dialogs.custom<null>({ title: t('Export database schema'), className: 'er-dialog', render: (api) => createElement(ExportForm, api) });
}
