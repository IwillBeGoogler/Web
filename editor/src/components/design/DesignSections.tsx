import { useMemo } from 'react';
import type { AccordionSection } from '../Accordion';
import { BufferedInput } from '../BufferedInput';
import { ColorField } from '../ui/ColorField';
import { useDiagramStore } from '../../store/diagramStore';
import { useWorkspace } from '../../workspace/store';
import { useLibraryDoc } from '../../lib/library/store';
import { addColorStyle, addTextStyle, stylesInUse, updateColorStyle, removeStyle, type StyleSlot } from '../../lib/library/styles';
import { instanceOf } from '../../lib/library/components';
import { DEFAULT_AUTOLAYOUT } from '../../lib/autolayout/autolayout';
import { executeAction } from '../../lib/actions';
import { findBacklinks, validLink } from '../../lib/links/links';
import { loadFile } from '../../workspace/storage';
import { newId } from '../../lib/graph';
import type { AutoLayoutConfig, DiagramNode, NodeConstraints, NodeLink, SizingMode } from '../../types';
import { FILL_PRESETS } from '../../lib/presets';
import { t } from '../../i18n';

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (<div className="prop-row"><span className="prop-label">{t(label)}</span>{children}</div>);
function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (<div className="seg" role="group" aria-label={t(label)}>{options.map(([v, o]) => (<button key={v} type="button" className={value === v ? 'active' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{t(o)}</button>))}</div>);
}
const num = (v: string, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const patchData = (id: string, p: Record<string, unknown>) => useDiagramStore.getState().updateNodesData([id], p);

function AutoLayoutSection({ node }: { node: DiagramNode }) {
  const parent = useDiagramStore((s) => (node.parentId ? s.nodes.find((n) => n.id === node.parentId) : undefined));
  const cfg = node.data.autoLayout;
  const set = (p: Partial<AutoLayoutConfig>) => executeSet({ ...(cfg ?? DEFAULT_AUTOLAYOUT), ...p });
  const executeSet = (c: AutoLayoutConfig) => useDiagramStore.getState().transform((ns, es) => ({ nodes: ns.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, autoLayout: c } } : n)), edges: es }));
  const sizing = node.data.layoutSizing ?? { w: 'fixed', h: 'fixed' };
  return (
    <div className="prop-body">
      {node.type === 'group' && (
        <>
          <Row label="Direction">
            <Seg label="Auto layout direction" value={cfg?.mode ?? 'off'} options={[['off', 'Off'], ['row', 'Row'], ['column', 'Column'], ['grid', 'Grid']]} onChange={(m) => executeAction(m === 'off' ? 'auto-layout:off' : `auto-layout:${m}`, { nodeId: node.id })} />
          </Row>
          {cfg && (
            <>
              <Row label="Gap"><input type="number" min={0} max={200} aria-label={t('Gap')} value={cfg.gap} onChange={(e) => set({ gap: num(e.target.value, cfg.gap) })} /></Row>
              <Row label="Padding"><input type="number" min={0} max={200} aria-label={t('Padding')} value={cfg.padding} onChange={(e) => set({ padding: num(e.target.value, cfg.padding) })} /></Row>
              {cfg.mode === 'grid' && <Row label="Columns"><input type="number" min={1} max={12} aria-label={t('Columns')} value={cfg.columns ?? 3} onChange={(e) => set({ columns: Math.max(1, Math.round(num(e.target.value, 3))) })} /></Row>}
              <Row label="Align"><Seg label="Cross alignment" value={cfg.align} options={[['start', 'Start'], ['center', 'Center'], ['end', 'End'], ['stretch', 'Stretch']]} onChange={(align) => set({ align })} /></Row>
              {cfg.mode !== 'grid' && <Row label="Distribute"><Seg label="Main alignment" value={cfg.justify} options={[['start', 'Start'], ['center', 'Center'], ['end', 'End'], ['between', 'Space']]} onChange={(justify) => set({ justify })} /></Row>}
              <Row label="Size"><Seg label="Container width" value={cfg.hugW ? 'hug' : 'fixed'} options={[['hug', 'Hug W'], ['fixed', 'Fixed W']]} onChange={(v) => set({ hugW: v === 'hug' })} /></Row>
              <Row label=" "><Seg label="Container height" value={cfg.hugH ? 'hug' : 'fixed'} options={[['hug', 'Hug H'], ['fixed', 'Fixed H']]} onChange={(v) => set({ hugH: v === 'hug' })} /></Row>
            </>
          )}
        </>
      )}
      {parent?.data.autoLayout && (
        <>
          <Row label="Width"><Seg<SizingMode> label="Child width" value={sizing.w} options={[['fixed', 'Fixed'], ['fill', 'Fill']]} onChange={(w) => patchData(node.id, { layoutSizing: { ...sizing, w } })} /></Row>
          <Row label="Height"><Seg<SizingMode> label="Child height" value={sizing.h} options={[['fixed', 'Fixed'], ['fill', 'Fill']]} onChange={(h) => patchData(node.id, { layoutSizing: { ...sizing, h } })} /></Row>
          <label className="prop-check"><input type="checkbox" checked={!!node.data.layoutAbsolute} onChange={(e) => patchData(node.id, { layoutAbsolute: e.target.checked || undefined })} /> {t('Ignore auto layout (absolute)')}</label>
        </>
      )}
    </div>
  );
}

function ConstraintsSection({ node }: { node: DiagramNode }) {
  const c: NodeConstraints = node.data.constraints ?? { h: 'left', v: 'top' };
  return (
    <div className="prop-body">
      <Row label="Horizontal"><Seg label="Horizontal constraint" value={c.h} options={[['left', 'Left'], ['right', 'Right'], ['center', 'Center'], ['stretch', 'Both'], ['scale', 'Scale']]} onChange={(h) => patchData(node.id, { constraints: { ...c, h } })} /></Row>
      <Row label="Vertical"><Seg label="Vertical constraint" value={c.v} options={[['top', 'Top'], ['bottom', 'Bottom'], ['center', 'Center'], ['stretch', 'Both'], ['scale', 'Scale']]} onChange={(v) => patchData(node.id, { constraints: { ...c, v } })} /></Row>
      <p className="muted">{t('Applied when the frame is resized.')}</p>
    </div>
  );
}

function LinkSection({ node }: { node: DiagramNode }) {
  const tree = useWorkspace((s) => s.tree);
  const here = useDiagramStore((s) => s.projectId);
  const link = validLink(node.data.link) ? node.data.link : null;
  const files = tree.files;
  const targetNodes = useMemo(() => {
    if (!link) return [];
    if (link.fileId === here) return useDiagramStore.getState().nodes;
    return loadFile(localStorage, link.fileId)?.pages[0]?.nodes ?? [];
  }, [link, here]);
  const back = useMemo(() => {
    const all = files.map((f) => ({ id: f.id, name: f.name, nodes: f.id === here ? useDiagramStore.getState().nodes : loadFile(localStorage, f.id)?.pages[0]?.nodes ?? [] }));
    return findBacklinks(all, { fileId: here, nodeId: node.id }, { includeSelf: true });
  }, [files, here, node.id]);
  const set = (l: NodeLink | null) => patchData(node.id, { link: l ?? undefined });
  return (
    <div className="prop-body">
      <Row label="Opens">
        <select aria-label={t('Link target file')} value={link?.fileId ?? ''} onChange={(e) => set(e.target.value ? { fileId: e.target.value } : null)}>
          <option value="">{t('No link')}</option>
          {files.map((f) => (<option key={f.id} value={f.id}>{f.name}{f.id === here ? ` ${t('(this file)')}` : ''}</option>))}
        </select>
      </Row>
      {link && (
        <Row label="Node">
          <select aria-label={t('Link target node')} value={link.nodeId ?? ''} onChange={(e) => set({ fileId: link.fileId, ...(e.target.value ? { nodeId: e.target.value } : {}) })}>
            <option value="">{t('Whole file')}</option>
            {targetNodes.filter((n) => n.data.label).map((n) => (<option key={n.id} value={n.id}>{String(n.data.label).slice(0, 40)}</option>))}
          </select>
        </Row>
      )}
      {link && <button type="button" onClick={() => executeAction('link-follow', { nodeId: node.id })}>{t('Go to link')} <span className="muted">{t('⌘ click')}</span></button>}
      <Row label="Source"><BufferedInput value={(node.data.source as string | undefined) ?? ''} placeholder={t('src/orders.ts:42 or a URL')} aria-label={t('Source link')} onCommit={(v) => patchData(node.id, { source: v.trim() || undefined })} /></Row>
      {back.length > 0 && (
        <div className="backlinks" aria-label={t('Linked from')}>
          <span className="prop-label">{t('Linked from')}</span>
          <ul>{back.map((b) => (<li key={`${b.fileId}:${b.nodeId}`}><button type="button" className="linkish" onClick={() => executeAction(`link-open:${b.fileId}:${b.nodeId}`)}>{b.label || b.nodeId}<small> · {b.fileName}</small></button></li>))}</ul>
        </div>
      )}
    </div>
  );
}

function StylesSection({ node }: { node: DiagramNode }) {
  const lib = useLibraryDoc((s) => s.doc);
  const update = useLibraryDoc((s) => s.update);
  const all = useDiagramStore((s) => s.nodes);
  const used = useMemo(() => stylesInUse(all), [all]);
  const colors = Object.values(lib.styles.colors);
  const texts = Object.values(lib.styles.texts);
  const effects = Object.values(lib.styles.effects);
  const pick = (slot: StyleSlot, label: string, list: { id: string; name: string }[]) => (
    <Row label={label}>
      <select aria-label={t('{style} style', { style: t(label) })} value={node.data.styles?.[slot] ?? ''} onChange={(e) => (e.target.value ? executeAction(`style-apply:${slot}:${e.target.value}`) : executeAction(`style-detach:${slot}`, { nodeId: node.id }))}>
        <option value="">{t('None')}</option>
        {list.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
      </select>
    </Row>
  );
  return (
    <div className="prop-body">
      {colors.length > 0 && pick('fill', 'Fill', colors)}
      {colors.length > 0 && pick('stroke', 'Stroke', colors)}
      {texts.length > 0 && pick('text', 'Text', texts)}
      {effects.length > 0 && pick('effect', 'Effect', effects)}
      <div className="btn-row">
        <button type="button" onClick={() => { const id = newId('sty'); update((l) => addColorStyle(l, { id, name: t('Colour {n}', { n: colors.length + 1 }), value: (node.data.fill as string | undefined) ?? '#2f6fdb' })); }}>{t('+ Colour from fill')}</button>
        <button type="button" onClick={() => { const id = newId('sty'); update((l) => addTextStyle(l, { id, name: t('Text {n}', { n: texts.length + 1 }), fontSize: node.data.fontSize, bold: node.data.bold, align: node.data.align, color: node.data.textColor })); }}>{t('+ Text from this')}</button>
      </div>
      {colors.length > 0 && (
        <div className="style-edit" aria-label={t('Edit colour styles')}>
          <span className="prop-label">{t('Edit colour styles')}</span>
          {colors.map((c) => (
            <div key={c.id} className="style-row">
              <BufferedInput value={c.name} aria-label={t('Style name {name}', { name: c.name })} onCommit={(name) => update((l) => updateColorStyle(l, c.id, { name }))} />
              <ColorField label={t('{name} light', { name: c.name })} value={/^#[0-9a-f]{6}$/i.test(c.value) ? c.value : '#2f6fdb'} presets={FILL_PRESETS.filter((p) => p !== 'transparent')} onChange={(value) => update((l) => updateColorStyle(l, c.id, { value }))} />
              <ColorField label={t('{name} dark', { name: c.name })} value={c.dark && /^#[0-9a-f]{6}$/i.test(c.dark) ? c.dark : '#7aa2ff'} presets={FILL_PRESETS.filter((p) => p !== 'transparent')} onChange={(dark) => update((l) => updateColorStyle(l, c.id, { dark }))} />
              <small className="muted">{t('{n} used', { n: used[c.id] ?? 0 })}</small>
              <button type="button" aria-label={t('Delete style {name}', { name: c.name })} onClick={() => update((l) => removeStyle(l, 'color', c.id))}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InstanceSection({ node }: { node: DiagramNode }) {
  const lib = useLibraryDoc((s) => s.doc);
  const cid = useDiagramStore((s) => instanceOf(s.nodes, node.id));
  const def = cid ? lib.components[cid] : undefined;
  return (
    <div className="prop-body">
      <p className="muted">{def ? t('Instance of “{name}”. Text, colours and icon can be changed here; everything else follows the main component.', { name: def.name }) : t('Instance of a deleted component.')}</p>
      <div className="btn-row">
        <button type="button" onClick={() => executeAction('go-to-main', { nodeId: node.id })}>{t('Go to main')}</button>
        <button type="button" onClick={() => executeAction('reset-overrides', { nodeId: node.id })}>{t('Reset overrides')}</button>
        <button type="button" onClick={() => executeAction('detach-instance', { nodeId: node.id })}>{t('Detach')}</button>
      </div>
    </div>
  );
}

/** extra inspector sections for one selected node. Each appears only when it applies; all start collapsed. */
export function designSections(node: DiagramNode, nodes: DiagramNode[], hasStyles: boolean): AccordionSection[] {
  const out: AccordionSection[] = [];
  const parent = node.parentId ? nodes.find((n) => n.id === node.parentId) : undefined;
  const inFrame = nodes.some((f) => f.type === 'frame' && f.id !== node.id && node.position.x >= f.position.x && node.position.y >= f.position.y && node.position.x <= f.position.x + (f.width ?? 0) && node.position.y <= f.position.y + (f.height ?? 0));
  if (instanceOf(nodes, node.id) || node.data.componentMain) {
    if (node.data.instance || node.data.componentMain) out.push({ id: 'instance', label: node.data.componentMain ? t('Main component') : t('Instance'), content: node.data.componentMain ? <MainNote node={node} /> : <InstanceSection node={node} /> });
  }
  if (node.type === 'group' || parent?.data.autoLayout) out.push({ id: 'autolayout', label: t('Auto layout'), content: <AutoLayoutSection node={node} /> });
  if (parent || inFrame) out.push({ id: 'constraints', label: t('Constraints'), content: <ConstraintsSection node={node} /> });
  out.push({ id: 'link', label: node.data.link ? t('Link') : t('Link & source'), content: <LinkSection node={node} /> });
  if (hasStyles || node.data.styles || node.type !== 'draw') out.push({ id: 'styles', label: t('Styles'), content: <StylesSection node={node} /> });
  return out;
}
function MainNote({ node }: { node: DiagramNode }) {
  const lib = useLibraryDoc((s) => s.doc);
  const def = lib.components[node.data.componentMain as string];
  return (
    <div className="prop-body">
      <p className="muted">{def ? t('Main component “{name}” (revision {rev}). Edit it here and every instance in the project follows.', { name: def.name, rev: def.rev }) : t('Main component.')}</p>
    </div>
  );
}
