import { useId, useState } from 'react';
import type { CustomApi } from '../../lib/dialogs';
import { t as tr } from '../../i18n';
import { useDiagramStore } from '../../store/diagramStore';
import { UmlExportForm, hasUmlNodes } from '../uml/umlDialogs';

export interface NewProjectResult {
  name: string;
  /** template id, or null for a blank project */
  templateId: string | null;
}

export function NewProjectForm({ templates, done, cancel }: CustomApi<NewProjectResult> & { templates: { id: string; name: string }[] }) {
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const nameId = useId();
  const tplId = useId();
  return (
    <form
      className="dialog-body"
      onSubmit={(e) => {
        e.preventDefault();
        done({ name: name.trim() || 'Untitled', templateId: templateId || null });
      }}
    >
      <label className="dialog-field" htmlFor={nameId}>
        <span>{tr('Project name')}</span>
        <input id={nameId} data-autofocus type="text" autoComplete="off" placeholder={tr('Untitled')} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="dialog-field" htmlFor={tplId}>
        <span>{tr('Template (optional)')}</span>
        <select id={tplId} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">{tr('Blank canvas')}</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      <div className="modal-foot dialog-actions">
        <button type="button" onClick={cancel}>{tr('Cancel')}</button>
        <button type="submit" className="primary">{tr('Create project')}</button>
      </div>
    </form>
  );
}

export interface ExportChoice {
  format: 'png' | 'svg';
  scale: 1 | 2 | 3;
  transparent: boolean;
  background?: 'white' | 'black';
  pages: 'current' | 'all';
}

function Seg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group" aria-label={tr(label)}>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" className={value === v ? 'active' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{tr(text)}</button>
      ))}
    </div>
  );
}

export function ExportForm({ initial, pageCount, done, cancel }: CustomApi<ExportChoice> & { initial: ExportChoice; pageCount: number }) {
  const [v, setV] = useState<ExportChoice>(initial);
  const pagesId = useId();
  const hasUml = useDiagramStore((s) => hasUmlNodes(s.nodes));
  return (
    <form
      className="dialog-body"
      onSubmit={(e) => {
        e.preventDefault();
        done(v);
      }}
    >
      <div className="dialog-field"><span>{tr('Format')}</span><Seg label="Format" value={v.format} options={[['png', 'PNG'], ['svg', 'SVG']]} onChange={(format) => setV({ ...v, format })} /></div>
      <div className="dialog-field"><span>{tr('Scale')}</span><Seg label="Scale" value={v.scale} options={[[1, '1x'], [2, '2x'], [3, '3x']]} onChange={(scale) => setV({ ...v, scale })} /></div>
      <div className="dialog-field"><span>{tr('Background')}</span><Seg label="Background" value={v.transparent ? 'none' : (v.background ?? 'white')} options={[['white', 'White'], ['black', 'Black'], ['none', 'Transparent']]} onChange={(b) => setV({ ...v, transparent: b === 'none', background: b === 'none' ? v.background : b })} /></div>
      <label className="dialog-field" htmlFor={pagesId}>
        <span>{tr('Pages')}</span>
        <select id={pagesId} value={v.pages} onChange={(e) => setV({ ...v, pages: e.target.value as 'current' | 'all' })}>
          <option value="current">{tr('Current page')}</option>
          <option value="all" disabled={pageCount < 2}>{tr('All pages ({n})', { n: pageCount })}</option>
        </select>
      </label>
      {hasUml && (
        <details className="export-text" data-testid="export-text-preview">
          <summary>{tr('Preview as text (PlantUML / Mermaid)')}</summary>
          <p className="muted">{tr('Generated in your browser. The diagram is not sent to any render server.')}</p>
          <UmlExportForm embedded />
        </details>
      )}
      <div className="modal-foot dialog-actions">
        <button type="button" onClick={cancel}>{tr('Cancel')}</button>
        <button type="submit" className="primary" data-autofocus>{tr('Export')}</button>
      </div>
    </form>
  );
}
