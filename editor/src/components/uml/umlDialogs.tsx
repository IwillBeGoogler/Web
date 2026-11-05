import { createElement, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DiagramNode } from '../../types';
import { dialogs, type CustomApi } from '../../lib/dialogs';
import { useDiagramStore } from '../../store/diagramStore';
import { toast } from '../../store/toastStore';
import { t } from '../../i18n';
import { diagramToModel } from '../../lib/uml/convert';
import { UML_EXPORT_FORMATS, UML_IMPORT_FORMATS, exportUmlText, importUmlText, type UmlFormat, type UmlImport } from '../../lib/uml/io';
import { modelCounts, type UmlModel } from '../../lib/uml/model';
import { applyUmlModel } from '../../lib/uml/apply';
import { useDriftStore } from '../../lib/uml/driftStore';
import type { ImportTarget } from '../../lib/er/apply';
import { applyDiagramModel, describeImport, detectDiagramKind, importDiagramText, type AnyImport } from '../../lib/uml2/importAny';
import { diagramToActivityModel, isActivityLike, isActivityNode } from '../../lib/activity/convert';
import { renderActivityMermaid } from '../../lib/activity/mermaid';
import { renderActivityPlantuml } from '../../lib/activity/plantuml';
import { diagramToUseCaseModel, isUseCaseLike, isUseCaseNode } from '../../lib/usecase/convert';
import { renderUseCaseMermaid } from '../../lib/usecase/mermaid';
import { renderUseCasePlantuml } from '../../lib/usecase/plantuml';
import { diagramToComponentModel, isCompNode } from '../../lib/component/convert';
import { renderComponentPlantuml } from '../../lib/component/plantuml';
import { diagramToDeploymentModel, isDeploymentNode } from '../../lib/deployment/convert';
import { renderDeploymentPlantuml } from '../../lib/deployment/plantuml';
import { diagramToPackageModel, isPackageNode } from '../../lib/package/convert';
import { renderPackagePlantuml } from '../../lib/package/plantuml';
import { diagramToObjectModel, isObjectNode } from '../../lib/object/convert';
import { renderObjectPlantuml } from '../../lib/object/plantuml';
import { renderTimingPlantuml } from '../../lib/timing/plantuml';
import { isTimingNode, timingOf } from '../../lib/timing/node';
import { SEQ_FORMATS, exportSeqText } from '../../lib/seq/io';
import { sequenceOf } from '../../lib/seq/node';
import { diagramToStateModel, isStateLike } from '../../lib/state/convert';
import { renderStateMermaid, renderStatePlantUml } from '../../lib/state/mermaid';

const SAMPLE = `// Paste TypeScript, Java, Python, Go or C# source, a Mermaid classDiagram / sequenceDiagram / stateDiagram-v2 or PlantUML
export interface Repository<T> {
  find(id: string): Promise<T>;
}
export abstract class Shape {
  protected name: string;
  abstract area(): number;
}
export class Circle extends Shape {
  radius = 1;
  area(): number { return Math.PI * this.radius ** 2; }
}`;

type SyncTarget = ImportTarget | 'sync';
type ImportResult = { model: UmlModel; target: SyncTarget; name: string; removed?: boolean; any?: undefined } | { any: AnyImport; target: ImportTarget; name: string; model?: undefined }

const countMessages = (items: { type: string; sections?: { items: unknown[] }[] }[]): number => items.reduce((n, i) => n + (i.type === 'message' ? 1 : i.type === 'fragment' ? countMessages((i.sections ?? []).flatMap((x) => x.items as never[])) : 0), 0);

function ImportForm({ done, cancel, initialSync }: CustomApi<ImportResult> & { initialSync?: boolean }) {
  const hasClasses = useDiagramStore((st) => st.nodes.some((n) => n.type === 'class'));
  const [text, setText] = useState('');
  const [format, setFormat] = useState<UmlFormat | 'auto'>('auto');
  const [target, setTarget] = useState<SyncTarget>(initialSync && hasClasses ? 'sync' : 'page');
  const [removed, setRemoved] = useState(false);
  const [assoc, setAssoc] = useState(true);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<UmlImport | null>(null);
  const [other, setOther] = useState<AnyImport | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const run = useRef(0);
  // parse as the text changes (TypeScript loads the compiler on first use, so this is async)
  useEffect(() => {
    const n = ++run.current;
    if (!text.trim()) { setParsed(null); setOther(null); return; }
    // sequence and state diagrams are not class models: they get their own preview and node
    if (format === 'auto' && detectDiagramKind(text)) { setOther(importDiagramText(text) ?? null); setParsed(null); setBusy(false); return; }
    setOther(null);
    setBusy(true);
    void importUmlText(text, format, { associations: assoc }).then((r) => { if (n === run.current) { setParsed(r); setBusy(false); } }).catch((e: unknown) => { if (n === run.current) { setParsed({ model: { classes: [], relations: [] }, warnings: [String(e)], format: 'typescript' }); setBusy(false); } });
  }, [text, format, assoc]);
  const counts = parsed ? modelCounts(parsed.model) : null;
  const total = counts ? counts.classes + counts.interfaces + counts.enums : 0;
  const otherCount = other ? describeImport(other).size : 0;
  const empty = other ? otherCount === 0 : !counts || total === 0;
  const label = UML_IMPORT_FORMATS.find((f) => f.id === parsed?.format)?.label;
  return (
    <form
      className="dialog-body er-import"
      onSubmit={(e) => {
        e.preventDefault();
        if (other && !empty) done({ any: other, target: target === 'sync' ? 'page' : target, name: fileName || describeImport(other).name });
        else if (parsed && !empty) done({ model: parsed.model, target, name: fileName || 'Imported classes', removed });
      }}
    >
      <div className="er-import-row">
        <label className="dialog-field" htmlFor={`${id}-fmt`}>
          <span>{t('Language / format')}</span>
          <select id={`${id}-fmt`} value={format} onChange={(e) => setFormat(e.target.value as UmlFormat | 'auto')}>
            <option value="auto">{t('Detect automatically')}</option>
            {UML_IMPORT_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => fileRef.current?.click()}>{t('Choose file…')}</button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".ts,.tsx,.java,.py,.go,.cs,.mmd,.mermaid,.puml,.plantuml,.pu,.md,.txt"
          data-testid="uml-file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setText(await f.text());
            setFileName(f.name.replace(/\.[^.]+$/, ''));
            e.target.value = '';
          }}
        />
      </div>
      <textarea className="er-import-text" data-autofocus spellCheck={false} placeholder={SAMPLE} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('Source text')} />
      <div className="er-preview" role="status" aria-live="polite">
        {other ? (
          empty ? <span className="er-warn">{t('Nothing to import.')}{other.warnings[0] ? ` ${other.warnings[0]}` : ''}</span> : other.kind === 'usecase' || other.kind === 'activity' || other.kind === 'component' || other.kind === 'deployment' || other.kind === 'package' || other.kind === 'object' || other.kind === 'timing' ? (
            <><strong>{describeImport(other).title}</strong>{describeImport(other).counts.map((c) => <span key={c}>{c}</span>)}</>
          ) : other.kind === 'sequence' ? (
            <><strong>{t('Sequence diagram')} ({other.format === 'mermaid' ? 'Mermaid' : 'PlantUML'})</strong><span>{t('{n} participants', { n: other.model.participants.length })}</span><span>{t('{n} messages', { n: countMessages(other.model.items) })}</span></>
          ) : (
            <><strong>{t('State machine')} ({other.format === 'plantuml' ? 'PlantUML' : 'Mermaid'})</strong><span>{t('{n} states', { n: other.model.states.length })}</span><span>{t('{n} transitions', { n: other.model.transitions.length })}</span></>
          )
        ) : !parsed ? (
          <span className="muted">{busy ? t('Reading…') : t('Paste source code or a diagram, or choose a file. TypeScript, Java, Python, Go, C#, Mermaid (class, sequence and state diagrams) and PlantUML are understood.')}</span>
        ) : empty ? (
          <span className="er-warn">{t('Nothing to import: no classes found.')}{parsed.warnings[0] ? ` ${parsed.warnings[0]}` : ''}</span>
        ) : (
          <>
            <strong>{label}</strong>
            <span>{t(counts!.classes === 1 ? '{n} class' : '{n} classes', { n: counts!.classes })}</span>
            {counts!.interfaces > 0 && <span>{t(counts!.interfaces === 1 ? '{n} interface' : '{n} interfaces', { n: counts!.interfaces })}</span>}
            {counts!.enums > 0 && <span>{t(counts!.enums === 1 ? '{n} enum' : '{n} enums', { n: counts!.enums })}</span>}
            <span>{t('{n} members', { n: counts!.members })}</span>
            <span>{t(counts!.relations === 1 ? '{n} relation' : '{n} relations', { n: counts!.relations })}</span>
          </>
        )}
        {parsed && parsed.warnings.length > 0 && !empty && <details className="er-warn"><summary>{t(parsed.warnings.length === 1 ? '{n} warning' : '{n} warnings', { n: parsed.warnings.length })}</summary><ul>{parsed.warnings.slice(0, 20).map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
      </div>
      {!other && <label className="er-fold"><input type="checkbox" checked={assoc} onChange={(e) => setAssoc(e.target.checked)} /> {t('Draw associations for members typed with another class (TypeScript, Java, Python)')}</label>}
      <fieldset className="er-target">
        <legend>{t('Insert into')}</legend>
        {([['page', 'This file (free area)'], ['newfile', 'A new file'], ...(hasClasses && !other ? [['sync', 'Update this class diagram (keeps positions, you review each change)']] : [])] as [SyncTarget, string][]).map(([v, l]) => (
          <label key={v}><input type="radio" name={`${id}-t`} checked={target === v} onChange={() => setTarget(v)} /> {t(l)}</label>
        ))}
        {target === 'sync' && <label className="er-fold"><input type="checkbox" checked={removed} onChange={(e) => setRemoved(e.target.checked)} /> {t('Also mark classes that are not in this code as removed')}</label>}
      </fieldset>
      <div className="modal-foot dialog-actions">
        <button type="button" onClick={cancel}>{t('Cancel')}</button>
        <button type="submit" className="primary" disabled={empty}>{t('Import')}{!empty ? (other ? ` ${describeImport(other).noun}` : ` ${t('{n} classes', { n: total })}`) : ''}</button>
      </div>
    </form>
  );
}

/** File › Import code…: TypeScript, Java, Python, Mermaid classDiagram and PlantUML, previewed, then laid out (parents above children). */
export async function openUmlImport(opts: { sync?: boolean } = {}): Promise<void> {
  const r = await dialogs.custom<ImportResult>({ title: opts.sync ? t('Update the class diagram from code') : t('Import UML from code or diagram text'), className: 'er-dialog', render: (api) => createElement(ImportForm, { ...api, initialSync: opts.sync }) });
  if (!r) return;
  if (r.target === 'sync' && r.model) {
    useDriftStore.getState().start(r.model, r.name, { removed: r.removed });
    const v = useDriftStore.getState().visible();
    if (!v || v.isEmpty) { useDriftStore.getState().clear(); return void toast.success(t('The diagram already matches the code')); }
    return void toast.info(t('Review the differences in the Code sync panel'));
  }
  if (r.any) {
    applyDiagramModel(r.any, r.target, r.name);
    return void toast.success(r.any.kind === 'sequence' ? t('Imported a sequence diagram') : t('Imported {what}', { what: describeImport(r.any).noun }));
  }
  const n = applyUmlModel(r.model, r.target as ImportTarget, r.name);
  toast.success(t(n === 1 ? 'Imported {n} class' : 'Imported {n} classes', { n }));
}

/** any UML content on the page (class, sequence, state, use case, activity, component, deployment, package, object) */
export const hasUmlNodes = (nodes: DiagramNode[]): boolean => nodes.some((n) => n.type === 'class' || n.type === 'timing' || n.type === 'sequence' || isStateLike(n) || isUseCaseLike(n) || isCompNode(n) || isActivityLike(n) || isDeploymentNode(n) || isPackageNode(n) || isObjectNode(n));

/** PlantUML / Mermaid text of the page's UML diagrams. Pure text, generated in the browser: nothing is sent anywhere. `embedded` drops the Close button (used inside the image export dialog). */
export function UmlExportForm({ cancel, embedded }: { cancel?: () => void; embedded?: boolean }) {
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const seqNodes = nodes.filter((n) => n.type === 'sequence');
  const hasStates = nodes.some((n) => n.type === 'state');
  const hasUc = nodes.some(isUseCaseLike);
  const hasComp = nodes.some(isCompNode);
  const hasAct = nodes.some(isActivityLike);
  const hasDep = nodes.some(isDeploymentNode);
  const hasPkg = nodes.some(isPackageNode);
  const hasObj = nodes.some(isObjectNode);
  const timingNodes = nodes.filter((n) => isTimingNode(n));
  const selObj = nodes.some((n) => n.selected && isObjectNode(n));
  const selDep = nodes.some((n) => n.selected && isDeploymentNode(n));
  const selAct = nodes.some((n) => n.selected && isActivityLike(n));
  const selUc = nodes.some((n) => n.selected && isUseCaseLike(n));
  const selComp = nodes.some((n) => n.selected && isCompNode(n));
  const bare = !seqNodes.length && !timingNodes.length && !hasStates && !hasUc && !hasComp && !hasAct && !hasDep && !hasObj && !hasPkg;
  const classCount = nodes.filter((n) => n.type === 'class').length;
  const selSeq = seqNodes.find((n) => n.selected);
  const selState = nodes.some((n) => n.selected && isStateLike(n));
  const selTiming = timingNodes.find((n) => n.selected);
  const [what, setWhat] = useState<string>(selTiming ? `timing:${selTiming.id}` : selSeq ? `seq:${selSeq.id}` : selState && hasStates ? 'state' : selUc ? 'usecase' : selAct ? 'activity' : selObj ? 'object' : selDep ? 'deployment' : selComp ? 'component' : hasPkg ? 'packages' : classCount || bare ? 'classes' : seqNodes.length ? `seq:${seqNodes[0].id}` : timingNodes.length ? `timing:${timingNodes[0].id}` : hasStates ? 'state' : hasUc ? 'usecase' : hasAct ? 'activity' : hasObj ? 'object' : hasDep ? 'deployment' : 'component');
  const isSeq = what.startsWith('seq:');
  const isTiming = what.startsWith('timing:');
  const [format, setFormat] = useState<string>('mermaid');
  const selected = nodes.filter((n) => n.type === 'class' && n.selected).length;
  const [scope, setScope] = useState<'all' | 'selected'>(selected >= 2 ? 'selected' : 'all');
  const id = useId();
  const formats = isTiming ? [{ id: 'plantuml', label: 'PlantUML timing', ext: 'puml', mime: 'text/plain' }] : what === 'activity' ? [{ id: 'mermaid', label: 'Mermaid flowchart', ext: 'mmd', mime: 'text/plain' }, { id: 'plantuml', label: 'PlantUML activity', ext: 'puml', mime: 'text/plain' }] : what === 'usecase' ? [{ id: 'mermaid', label: 'Mermaid flowchart', ext: 'mmd', mime: 'text/plain' }, { id: 'plantuml', label: 'PlantUML use case', ext: 'puml', mime: 'text/plain' }] : what === 'object' ? [{ id: 'plantuml', label: 'PlantUML object', ext: 'puml', mime: 'text/plain' }] : what === 'packages' ? [{ id: 'plantuml', label: 'PlantUML package', ext: 'puml', mime: 'text/plain' }] : what === 'deployment' ? [{ id: 'plantuml', label: 'PlantUML deployment', ext: 'puml', mime: 'text/plain' }] : what === 'component' ? [{ id: 'plantuml', label: 'PlantUML component', ext: 'puml', mime: 'text/plain' }] : isSeq ? SEQ_FORMATS.map((f) => ({ ...f, mime: 'text/plain' })) : what === 'state' ? [{ id: 'mermaid', label: 'Mermaid stateDiagram-v2', ext: 'mmd', mime: 'text/plain' }, { id: 'plantuml', label: 'PlantUML state', ext: 'puml', mime: 'text/plain' }] : UML_EXPORT_FORMATS;
  const fmt = formats.find((f) => f.id === format) ?? formats[0];
  const out = useMemo(() => {
    if (isSeq) {
      const n = seqNodes.find((x) => x.id === what.slice(4));
      return n ? exportSeqText(sequenceOf(n), fmt.id as 'mermaid' | 'plantuml') : '';
    }
    if (isTiming) {
      const n = timingNodes.find((x) => x.id === what.slice(7));
      return n ? renderTimingPlantuml(timingOf(n)) : '';
    }
    if (what === 'activity') { const m = diagramToActivityModel(nodes, edges); return fmt.id === 'plantuml' ? renderActivityPlantuml(m) : renderActivityMermaid(m); }
    if (what === 'usecase') { const m = diagramToUseCaseModel(nodes, edges); return fmt.id === 'plantuml' ? renderUseCasePlantuml(m) : renderUseCaseMermaid(m); }
    if (what === 'object') return renderObjectPlantuml(diagramToObjectModel(nodes, edges));
    if (what === 'packages') return renderPackagePlantuml(diagramToPackageModel(nodes, edges));
    if (what === 'deployment') return renderDeploymentPlantuml(diagramToDeploymentModel(nodes, edges));
    if (what === 'component') return renderComponentPlantuml(diagramToComponentModel(nodes, edges));
    if (what === 'state') return (fmt.id === 'plantuml' ? renderStatePlantUml : renderStateMermaid)(diagramToStateModel(nodes, edges));
    const keep = scope === 'selected' ? new Set(nodes.filter((n) => n.selected).map((n) => n.id)) : null;
    const ns = keep ? nodes.filter((n) => keep.has(n.id)) : nodes;
    const es = keep ? edges.filter((e) => keep.has(e.source) && keep.has(e.target)) : edges;
    return exportUmlText(diagramToModel(ns, es), fmt.id as UmlFormat);
  }, [nodes, edges, what, scope, fmt.id]);
  const meta = fmt;
  const count = isSeq || isTiming ? 1 : what === 'activity' ? nodes.filter(isActivityNode).length : what === 'usecase' ? nodes.filter(isUseCaseNode).length : what === 'object' ? nodes.filter(isObjectNode).length : what === 'packages' ? nodes.filter(isPackageNode).length : what === 'deployment' ? nodes.filter(isDeploymentNode).length : what === 'component' ? nodes.filter(isCompNode).length : what === 'state' ? nodes.filter(isStateLike).length : classCount;
  const options = [
    ...(classCount || bare ? [['classes', t('Classes ({n})', { n: classCount })]] : []),
    ...seqNodes.map((n, i) => [`seq:${n.id}`, t('Sequence: {name}', { name: String(n.data.label || `#${i + 1}`) })]),
    ...timingNodes.map((n, i) => [`timing:${n.id}`, t('Timing: {name}', { name: String(n.data.label || `#${i + 1}`) })]),
    ...(hasStates ? [['state', t('State machine')]] : []),
    ...(hasUc ? [['usecase', t('Use case diagram')]] : []),
    ...(hasAct ? [['activity', t('Activity diagram')]] : []),
    ...(hasComp ? [['component', t('Component diagram')]] : []),
    ...(hasDep ? [['deployment', t('Deployment diagram')]] : []),
    ...(hasPkg ? [['packages', t('Package diagram')]] : []),
    ...(hasObj ? [['object', edges.some((e) => (e.data?.uml?.messages?.length ?? 0) > 0) ? t('Communication diagram') : t('Object diagram')]] : []),
  ];
  return (
    <div className="dialog-body er-export">
      <div className="er-import-row">
        {options.length > 1 && (
          <label className="dialog-field" htmlFor={`${id}-w`}>
            <span>{t('Diagram')}</span>
            <select id={`${id}-w`} value={what} onChange={(e) => { setWhat(e.target.value); setFormat('mermaid'); }}>
              {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}
        <label className="dialog-field" htmlFor={`${id}-f`}>
          <span>{t('Format')}</span>
          <select id={`${id}-f`} value={fmt.id} onChange={(e) => setFormat(e.target.value)}>
            {formats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        {what === 'classes' && selected >= 2 && (
          <label className="dialog-field">
            <span>{t('Classes')}</span>
            <select value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'selected')}>
              <option value="all">{t('All ({n})', { n: classCount })}</option>
              <option value="selected">{t('Selected ({n})', { n: selected })}</option>
            </select>
          </label>
        )}
      </div>
      <textarea className="er-import-text" readOnly value={count ? out : '// ' + t('Nothing to export on this page')} aria-label={t('Exported UML')} spellCheck={false} />
      <div className="modal-foot dialog-actions">
        {!embedded && <button type="button" onClick={cancel}>{t('Close')}</button>}
        <button type="button" disabled={!count} onClick={() => void navigator.clipboard?.writeText(out).then(() => toast.success(t('Copied')))}>{t('Copy')}</button>
        <button
          type="button"
          className="primary"
          disabled={!count}
          onClick={() => {
            const url = URL.createObjectURL(new Blob([out], { type: meta.mime }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `${isSeq ? 'sequence' : isTiming ? 'timing' : what === 'activity' ? 'activity' : what === 'usecase' ? 'usecases' : what === 'object' ? 'objects' : what === 'packages' ? 'packages' : what === 'deployment' ? 'deployment' : what === 'component' ? 'components' : what === 'state' ? 'states' : 'classes'}.${meta.ext}`;
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

/** File › Export UML…: class diagrams (Mermaid, PlantUML, TypeScript, Java skeletons), sequence diagrams (Mermaid, PlantUML) and state machines (Mermaid). */
export async function openUmlExport(): Promise<void> {
  await dialogs.custom<null>({ title: t('Export UML'), className: 'er-dialog', render: (api) => createElement(UmlExportForm, { cancel: api.cancel }) });
}
