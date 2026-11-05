import { useState } from 'react';
import { useConfirm } from '../hooks/useDialogs';
import { useUiStore } from '../store/uiStore';
import { useDiagramStore } from '../store/diagramStore';
import { useSettingsStore } from '../store/settingsStore';
import { Modal } from './ui/Modal';
import { PluginSettings } from './design/PluginSettings';
import { LintSettings } from './smart/LintSettings';
import type { LineType } from '../types';
import { toast } from '../store/toastStore';
import { BUILTIN_EDGE_PRESETS } from '../lib/edgePresets';
import { lineStyleOverrides, mergeSettings, resolveSettings, type PartialSettings, type Settings } from '../lib/settings';
import { t } from '../i18n';

type Scope = 'global' | 'project';
const LINE_LABEL: Record<LineType, string> = { straight: 'Straight', orthogonal: 'Orthogonal', curved: 'Curved', 'step-rounded': 'Rounded orthogonal' };

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="prop-row">
    <span className="prop-label">{t(label)}</span>
    <div className="prop-ctl">{children}</div>
  </div>
);
const Colour = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <span className="swatch-field">
    <input type="color" aria-label={t(label)} value={value} onChange={(e) => onChange(e.target.value)} />
    <code>{value.toUpperCase()}</code>
  </span>
);
const SECTIONS = [['set-components', 'Components'], ['set-groups', 'Groups'], ['set-edges', 'Edges'], ['set-presets', 'Edge presets'], ['set-canvas', 'Canvas'], ['set-export', 'Export'], ['set-app', 'App']] as const;
function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={t(label)}>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" className={value === v ? 'active' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{t(text)}</button>
      ))}
    </div>
  );
}
const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="prop-check"><input type="checkbox" checked={checked} aria-label={t(label)} onChange={(e) => onChange(e.target.checked)} /> {t(label)}</label>
);

export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const globalS = useSettingsStore((s) => s.global);
  const patchGlobal = useSettingsStore((s) => s.patch);
  const resetGlobal = useSettingsStore((s) => s.resetGlobal);
  const projectS = useDiagramStore((s) => s.projectSettings);
  const setProject = useDiagramStore((s) => s.setProjectSettings);
  const applyDefaults = useDiagramStore((s) => s.applyDefaultsToPage);
  const [scope, setScope] = useState<Scope>('global');
  const confirm = useConfirm();
  const [applyScope, setApplyScope] = useState<'page' | 'project'>('page');
  const applyLine = useDiagramStore((st) => st.applyLineStyleToAll);
  const pageEdges = useDiagramStore((st) => st.edges);
  const s: Settings = scope === 'global' ? resolveSettings(globalS, undefined) : resolveSettings(globalS, projectS);
  const patch = (p: PartialSettings) => (scope === 'global' ? patchGlobal(p) : setProject(mergeSettings(projectS, p)));
  const reset = () => (scope === 'global' ? resetGlobal() : setProject({}));
  const overrides = lineStyleOverrides(pageEdges, s.edge.lineType);
  const transparentCanvas = s.canvas.background === 'transparent';

  return (
    <Modal open={open} title={t('Settings')} closeLabel={t('Close settings')} onClose={() => setOpen(false)} className="settings">
        <div className="settings-top">
          <Seg<Scope> label="Settings scope" value={scope} options={[['global', 'Global defaults'], ['project', 'This project']]} onChange={setScope} />
          <p className="muted">{t('Precedence: component > project > global > built-in.')}</p>
        </div>
        <div className="settings-body">
        <nav className="settings-nav" aria-label={t('Settings sections')}>
          {SECTIONS.filter(([id]) => id !== 'set-app' || scope === 'global').map(([id, text]) => (
            <button key={id} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{t(text)}</button>
          ))}
        </nav>
        <div className="settings-sections">

        <fieldset id="set-components">
          <legend>{t('Components')}</legend>
          <Field label="Background"><Seg label="Node background" value={s.node.background} options={[['transparent', 'Transparent'], ['filled', 'Filled']]} onChange={(background) => patch({ node: { background } })} /></Field>
          <Field label="Fill"><Colour label="Node fill" value={s.node.fill} onChange={(v) => patch({ node: { fill: v } })} /></Field>
          <Field label={t('Opacity {n}%', { n: s.node.opacity })}><input type="range" min={0} max={100} aria-label={t('Node opacity')} value={s.node.opacity} onChange={(e) => patch({ node: { opacity: Number(e.target.value) } })} /></Field>
          <Check label="Border" checked={s.node.border} onChange={(border) => patch({ node: { border } })} />
          <Field label="Border colour"><Colour label="Node border colour" value={s.node.borderColor} onChange={(v) => patch({ node: { borderColor: v } })} /></Field>
          <Field label={t('Radius {n}', { n: s.node.radius })}><input type="range" min={0} max={40} aria-label={t('Node radius')} value={s.node.radius} onChange={(e) => patch({ node: { radius: Number(e.target.value) } })} /></Field>
          <Check label="Shadow" checked={s.node.shadow} onChange={(shadow) => patch({ node: { shadow } })} />
        </fieldset>

        <fieldset id="set-groups">
          <legend>{t('Groups')}</legend>
          <Field label="Fill"><Colour label="Group fill" value={s.group.fill} onChange={(v) => patch({ group: { fill: v } })} /></Field>
          <Field label={t('Fill opacity {n}%', { n: s.group.fillOpacity })}><input type="range" min={0} max={100} aria-label={t('Group fill opacity')} value={s.group.fillOpacity} onChange={(e) => patch({ group: { fillOpacity: Number(e.target.value) } })} /></Field>
          <Field label="Border"><Seg label="Group border style" value={s.group.borderStyle} options={[['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']]} onChange={(borderStyle) => patch({ group: { borderStyle } })} /></Field>
          <Field label="Border colour"><Colour label="Group border colour" value={s.group.borderColor} onChange={(v) => patch({ group: { borderColor: v } })} /></Field>
        </fieldset>

        <fieldset id="set-edges">
          <legend>{t('Edges')}</legend>
          <div className="line-style" data-testid="line-style">
            <div className="line-style-title">{t('Line style')}</div>
            <Seg<LineType> label="Line style" value={s.edge.lineType} options={[['straight', 'Straight'], ['orthogonal', 'Orthogonal'], ['curved', 'Curved'], ['step-rounded', 'Rounded orthogonal']]} onChange={(lineType) => patch({ edge: { lineType } })} />
            <p className="muted">{t('Default for edges without their own style. A line style set on a single edge still wins, unless you apply to all.')}</p>
            {overrides.total > 0 && (
              <p className="line-style-hint" data-testid="line-style-overrides" role="status">
                {t(overrides.total === 1 ? '{n} edge uses a custom style' : '{n} edges use a custom style', { n: overrides.total })}{overrides.manual ? ` ${t('({n} hand-routed)', { n: overrides.manual })}` : ''}{t(overrides.total === 1 ? ', so the default does not change it. Apply to all?' : ', so the default does not change them. Apply to all?')}
              </p>
            )}
            <Check label="Keep buses orthogonal (junction lines)" checked={s.edge.keepBusesOrthogonal} onChange={(keepBusesOrthogonal) => patch({ edge: { keepBusesOrthogonal } })} />
            <div className="line-style-apply">
              <Seg<'page' | 'project'> label="Apply scope" value={applyScope} options={[['page', 'This page'], ['project', 'Whole project']]} onChange={setApplyScope} />
              <button
                type="button"
                onClick={async () => {
                  const lt = s.edge.lineType;
                  const hand = (lt === 'curved' || lt === 'straight') && overrides.manual > 0 ? ` ${t(overrides.manual === 1 ? 'Waypoints of {n} hand-routed edge will be cleared.' : 'Waypoints of {n} hand-routed edges will be cleared.', { n: overrides.manual })}` : '';
                  if (!(await confirm({ title: t('Apply to all edges?'), message: `${t(applyScope === 'project' ? 'Set every edge in the project to {style}, including junction and hand-routed edges.' : 'Set every edge on this page to {style}, including junction and hand-routed edges.', { style: t(LINE_LABEL[lt]) })}${hand}`, confirmLabel: t('Apply'), danger: true }))) return;
                  const n = applyLine(lt, applyScope);
                  toast.success(t(n === 1 ? '{n} edge set to {style}' : '{n} edges set to {style}', { n, style: t(LINE_LABEL[lt]) }));
                }}
              >
                {t('Apply to all edges')}
              </button>
            </div>
          </div>
          <Field label="Colour"><Colour label="Edge colour" value={s.edge.color} onChange={(v) => patch({ edge: { color: v } })} /></Field>
          <Field label={t('Width {n}', { n: s.edge.width })}><input type="range" min={0.5} max={8} step={0.5} aria-label={t('Edge width')} value={s.edge.width} onChange={(e) => patch({ edge: { width: Number(e.target.value) } })} /></Field>
          <Field label="Arrowheads"><Seg label="Default arrowheads" value={s.edge.arrows} options={[['none', 'None'], ['start', 'Start'], ['end', 'End'], ['both', 'Both']]} onChange={(arrows) => patch({ edge: { arrows } })} /></Field>
          <Field label="Arrowhead size"><Seg label="Arrowhead size" value={s.edge.arrowSize} options={[['S', 'S'], ['M', 'M'], ['L', 'L']]} onChange={(arrowSize) => patch({ edge: { arrowSize } })} /></Field>
          <Check label="Label background" checked={s.edge.labelBackground} onChange={(labelBackground) => patch({ edge: { labelBackground } })} />
          <Check label="Auto-route around nodes" checked={s.edge.autoRoute} onChange={(autoRoute) => patch({ edge: { autoRoute } })} />
          <Check label="Line jumps where edges cross" checked={s.edge.jumps} onChange={(jumps) => patch({ edge: { jumps } })} />
          <Check label="Keep manual routes when nodes move" checked={s.edge.keepManual} onChange={(keepManual) => patch({ edge: { keepManual } })} />
          <Field label={t('Rounded corner radius {n}', { n: s.edge.cornerRadius })}><input type="range" min={0} max={30} aria-label={t('Default corner radius')} value={s.edge.cornerRadius} onChange={(e) => patch({ edge: { cornerRadius: Number(e.target.value) } })} /></Field>
        </fieldset>

        <fieldset id="set-presets">
          <legend>{t('Edge presets')}</legend>
          <p className="muted">{t('Built-in: {names}. Your presets appear next to them in the edge menu and inspector.', { names: BUILTIN_EDGE_PRESETS.map((p) => p.name).join(', ') })}</p>
          {s.edgePresets.map((p, i) => (
            <div key={p.id} className="prop-row" data-testid="user-preset">
              <input type="text" aria-label={t('Preset name {n}', { n: i + 1 })} value={p.name} onChange={(e) => patch({ edgePresets: s.edgePresets.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
              <input type="color" aria-label={t('Preset colour {n}', { n: i + 1 })} value={p.color} onChange={(e) => patch({ edgePresets: s.edgePresets.map((x, k) => (k === i ? { ...x, color: e.target.value } : x)) })} />
              <select aria-label={t('Preset line {n}', { n: i + 1 })} value={p.strokeStyle ?? 'solid'} onChange={(e) => patch({ edgePresets: s.edgePresets.map((x, k) => (k === i ? { ...x, strokeStyle: e.target.value as 'solid' | 'dashed' | 'dotted' } : x)) })}>
                <option value="solid">{t('Solid')}</option><option value="dashed">{t('Dashed')}</option><option value="dotted">{t('Dotted')}</option>
              </select>
              <button type="button" aria-label={t('Remove preset {n}', { n: i + 1 })} onClick={() => patch({ edgePresets: s.edgePresets.filter((_, k) => k !== i) })}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => patch({ edgePresets: [...s.edgePresets, { id: `custom-${Date.now().toString(36)}`, name: t('My preset'), color: '#7c3aed', labelBold: true }] })}>{t('+ Add preset')}</button>
        </fieldset>

        <fieldset id="set-canvas">
          <legend>{t('Canvas')}</legend>
          <Check label="Transparent canvas" checked={transparentCanvas} onChange={(tr) => patch({ canvas: { background: tr ? 'transparent' : '#ffffff' } })} />
          {!transparentCanvas && <Field label="Background"><Colour label="Canvas background" value={s.canvas.background} onChange={(v) => patch({ canvas: { background: v } })} /></Field>}
          <Check label="Show grid" checked={s.canvas.grid} onChange={(grid) => patch({ canvas: { grid } })} />
          <Field label="Grid size"><input type="number" min={5} max={100} aria-label={t('Grid size')} value={s.canvas.gridSize} onChange={(e) => patch({ canvas: { gridSize: Math.max(5, Number(e.target.value) || 20) } })} /></Field>
          <Check label="Snap to grid" checked={s.canvas.snap} onChange={(snap) => patch({ canvas: { snap } })} />
          <Check label="Sketch (hand-drawn) look" checked={s.canvas.sketch} onChange={(sketch) => patch({ canvas: { sketch } })} />
        </fieldset>

        <fieldset id="set-export">
          <legend>{t('Export')}</legend>
          <Check label="Transparent background" checked={s.export.transparent} onChange={(transparent) => patch({ export: { transparent } })} />
          <Field label="Scale"><Seg<1 | 2 | 3> label="Export scale" value={s.export.scale} options={[[1, '1x'], [2, '2x'], [3, '3x']]} onChange={(scale) => patch({ export: { scale } })} /></Field>
          <Field label="Padding"><input type="number" min={0} max={400} aria-label={t('Export padding')} value={s.export.padding} onChange={(e) => patch({ export: { padding: Math.max(0, Number(e.target.value) || 0) } })} /></Field>
        </fieldset>

        {scope === 'global' && (
          <fieldset id="set-app">
            <legend>{t('Theme')}</legend>
            <Seg label="Theme" value={s.theme} options={[['light', 'Light'], ['dark', 'Dark'], ['system', 'System']]} onChange={(theme) => patch({ theme })} />
          </fieldset>
        )}

        {scope === 'global' && <LintSettings />}

        {scope === 'global' && <PluginSettings />}
        </div>
        </div>

        <div className="modal-foot">
          <button type="button" onClick={reset}>{t(scope === 'global' ? 'Reset global settings' : 'Reset project settings')}</button>
          <button
            type="button"
            onClick={async () => {
              if (await confirm({ title: t('Apply defaults?'), message: t('Reset the style of every component on this page to the defaults. You can undo this.'), confirmLabel: t('Apply'), danger: true })) applyDefaults();
            }}
          >
            {t('Apply defaults to all components on this page')}
          </button>
        </div>
    </Modal>
  );
}
