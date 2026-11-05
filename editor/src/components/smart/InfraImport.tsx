import { createElement, useId, useMemo, useRef, useState } from 'react';
import { exportPage } from '@core/exporters';
import { detectInfraFormat, importInfra, type InfraFormat, type InfraFile } from '@core/infra';
import { dialogs, type CustomApi } from '../../lib/dialogs';
import { pageToContent, pageToProject } from '../../lib/smart/infraProject';
import { importOpenedFile, openFile } from '../../workspace/actions';
import { useDiagramStore } from '../../store/diagramStore';
import { toast } from '../../store/toastStore';
import { t } from '../../i18n';

const LABEL: Record<InfraFormat, string> = { terraform: 'Terraform (HCL)', 'terraform-json': 'Terraform JSON (terraform show -json)', kubernetes: 'Kubernetes YAML', compose: 'docker-compose', cloudformation: 'CloudFormation' };
const PLACEHOLDER = `# Paste Terraform (.tf), the output of \`terraform show -json\`, Kubernetes manifests
# (also Helm-rendered), a docker-compose file or a CloudFormation template.
resource "aws_instance" "app" {
  instance_type = "t3.small"
}`;

interface Picked { files: InfraFile[]; target: 'newfile' | 'page'; name: string }

/** parse + preview, never throws */
export function previewInfra(files: InfraFile[]): { ok: true; result: ReturnType<typeof importInfra>; svg: string } | { ok: false; error: string } {
  if (!files.some((f) => f.text.trim())) return { ok: false, error: '' };
  try {
    const result = importInfra(files);
    return { ok: true, result, svg: exportPage(result.page, 'svg') };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function InfraImportForm({ done, cancel }: CustomApi<Picked>) {
  const [pasted, setPasted] = useState('');
  const [picked, setPicked] = useState<InfraFile[]>([]);
  const [target, setTarget] = useState<'newfile' | 'page'>('newfile');
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const files = useMemo<InfraFile[]>(() => (picked.length ? picked : pasted.trim() ? [{ name: 'pasted.txt', text: pasted }] : []), [picked, pasted]);
  const preview = useMemo(() => previewInfra(files), [files]);
  const ok = preview.ok ? preview : null;
  const detected = useMemo(() => { try { return files.length ? detectInfraFormat(files[0].text, files[0].name) : null; } catch { return null; } }, [files]);
  const counts = ok ? { nodes: ok.result.page.nodes.filter((n) => n.type !== 'group').length, groups: ok.result.page.nodes.filter((n) => n.type === 'group').length, edges: ok.result.page.edges.length } : null;
  const name = picked[0]?.name.replace(/\.[^.]+$/, '') || 'Imported infrastructure';
  return (
    <form className="dialog-body er-import" onSubmit={(e) => { e.preventDefault(); if (ok && counts && counts.nodes > 0) done({ files, target, name }); }}>
      <div className="er-import-row">
        <button type="button" onClick={() => fileRef.current?.click()}>{t('Choose files…')}</button>
        <input
          ref={fileRef} type="file" hidden multiple data-testid="infra-file"
          accept=".tf,.json,.yaml,.yml,.txt"
          onChange={async (e) => {
            const list = Array.from(e.target.files ?? []);
            if (!list.length) return;
            setPicked(await Promise.all(list.map(async (f) => ({ name: f.name, text: await f.text() }))));
            e.target.value = '';
          }}
        />
        {picked.length > 0 && <span className="muted">{picked.map((f) => f.name).join(', ')} <button type="button" className="link" onClick={() => setPicked([])}>{t('clear')}</button></span>}
      </div>
      {!picked.length && (
        <textarea className="er-import-text" data-autofocus spellCheck={false} placeholder={PLACEHOLDER} value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label={t('Infrastructure text')} />
      )}
      <div className="er-preview" role="status" aria-live="polite">
        {!files.length ? <span className="muted">{t('Terraform, Kubernetes, docker-compose and CloudFormation are understood. Nothing leaves your browser.')}</span>
          : !preview.ok ? <span className="er-warn">{preview.error}</span>
          : counts!.nodes === 0 ? <span className="er-warn">{t('Nothing to draw: no resources found.')}</span>
          : (<>
              <strong>{detected ? LABEL[detected] : ''}</strong>
              <span>{counts!.nodes} resources</span>
              {counts!.groups > 0 && <span>{counts!.groups} groups</span>}
              <span>{counts!.edges} connections</span>
            </>)}
        {ok && ok.result.warnings.length > 0 && <details className="er-warn"><summary>{ok.result.warnings.length} note{ok.result.warnings.length === 1 ? '' : 's'}</summary><ul>{ok.result.warnings.slice(0, 20).map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
      </div>
      {ok && counts!.nodes > 0 && <div className="infra-preview" data-testid="infra-preview" aria-label={t('Preview of the diagram')} role="img" dangerouslySetInnerHTML={{ __html: ok.svg }} />}
      <fieldset className="er-target">
        <legend>{t('Insert into')}</legend>
        {([['newfile', 'A new file'], ['page', 'This file (free area)']] as const).map(([v, l]) => (
          <label key={v}><input type="radio" name={`${id}-t`} checked={target === v} onChange={() => setTarget(v)} /> {t(l)}</label>
        ))}
      </fieldset>
      <div className="modal-foot dialog-actions">
        <button type="button" onClick={cancel}>{t('Cancel')}</button>
        <button type="submit" className="primary" disabled={!ok || counts!.nodes === 0}>{target === 'newfile' ? t('Insert as new file') : t('Insert')}</button>
      </div>
    </form>
  );
}

/** ⌘K "Import infrastructure…": previews the diagram, then inserts it as a new file (or into this one). */
export async function openInfraImport(): Promise<void> {
  const r = await dialogs.custom<Picked>({ title: t('Import infrastructure'), className: 'er-dialog', render: (api) => createElement(InfraImportForm, api) });
  if (!r) return;
  const { page } = importInfra(r.files, { name: r.name });
  if (r.target === 'page') useDiagramStore.getState().insertContent(pageToContent(page));
  else {
    const placed = importOpenedFile(pageToProject(page, r.name));
    openFile(placed.fileId);
  }
  toast.success(t('Imported {n} resources', { n: page.nodes.filter((n) => n.type !== 'group').length }));
}
