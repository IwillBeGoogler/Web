import { t } from '../i18n';
import { ACCENTS } from '../lib/er/tableData';
import { useMemo } from 'react';
import { useDiagramStore } from '../store/diagramStore';
import { useResolvedSettings } from '../store/settingsStore';
import { computeMixed, computeMixedEdges, type Mixed } from '../lib/bulkStyle';
import { allEdgePresets } from '../lib/edgePresets';
import { FILL_PRESETS, STROKE_PRESETS } from '../lib/presets';
import { executeAction } from '../lib/actions';
import { EDGE_COLORS } from '../types';
import type { Arrows, LineType, StrokeStyle } from '../types';
import { ColorField } from './ui/ColorField';
import { ScrubInput } from './ui/ScrubInput';
import { Field, Seg } from './ui/Inspector';
import { Select } from './ui/Select';
import { Toggle } from './ui/Toggle';

const hex = (v: unknown, dflt: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : dflt);

function Check({ label, state, onChange }: { label: string; state: Mixed | undefined; onChange: (v: boolean) => void }) {
  if (!state) return null;
  return <Toggle label={label} mixed={state.mixed} checked={!!state.value} onChange={onChange} />;
}
const Color = ({ label, m, presets, dflt, onChange }: { label: string; m: Mixed | undefined; presets: readonly string[]; dflt: string; onChange: (c: string) => void }) =>
  m ? <Field label={label} mixed={m.mixed}><ColorField quick={5} label={label} mixed={m.mixed} value={hex(m.value, dflt)} presets={presets} onChange={onChange} /></Field> : null;

/** Inspector body for a multi-selection: every field applies to all selected items it makes sense for; differing values show "Mixed". */
export function BulkStyle() {
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const apply = useDiagramStore((s) => s.updateSelectionStyle);
  const updateEdges = useDiagramStore((s) => s.updateEdges);
  const applyPreset = useDiagramStore((s) => s.applyEdgePreset);
  const settings = useResolvedSettings();
  const selNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes]);
  const selEdges = useMemo(() => edges.filter((e) => e.selected), [edges]);
  const nm = useMemo(() => computeMixed(selNodes, settings), [selNodes, settings]);
  const em = useMemo(() => computeMixedEdges(selEdges, settings), [selEdges, settings]);
  const eids = selEdges.map((e) => e.id);
  const presets = allEdgePresets(settings.edgePresets);
  const num = (label: string, m: Mixed | undefined, opts: { min?: number; max?: number; step?: number; suffix?: string }, on: (v: number) => void) =>
    m ? <div data-mixed={m.mixed ? 'true' : undefined} className="bulk-num"><ScrubInput label={label} value={Number(m.value)} {...opts} onChange={on} />{m.mixed ? <em className="mixed-tag"> {t('Mixed')}</em> : null}</div> : null;

  return (
    <div className="prop-body bulk" data-testid="bulk-style">
      <p className="prop-hint">{selNodes.length ? t(selNodes.length === 1 ? '{n} node' : '{n} nodes', { n: selNodes.length }) : ''}{selNodes.length && selEdges.length ? ' + ' : ''}{selEdges.length ? t(selEdges.length === 1 ? '{n} edge' : '{n} edges', { n: selEdges.length }) : ''} {t('selected. Changes apply to every item they make sense for.')}</p>

      {selNodes.length > 0 && (
        <fieldset>
          <legend>{t('Nodes')}</legend>
          {nm.background && (
            <Field label={t('Background')} mixed={nm.background.mixed}>
              <Seg label={t('Bulk background')} mixed={nm.background.mixed} value={nm.background.value as 'transparent' | 'filled'} options={[['transparent', t('Transparent')], ['filled', t('Filled')]]} onChange={(background) => apply({ background })} />
            </Field>
          )}
          <Color label={t('Fill')} m={nm.fill} presets={FILL_PRESETS.filter((c) => c !== 'transparent')} dflt="#ffffff" onChange={(fill) => apply({ fill, ...(nm.background ? { background: 'filled' } : {}) })} />
          {num(t('Opacity'), nm.opacity, { min: 0, max: 100, suffix: '%' }, (opacity) => apply({ opacity }))}
          <Color label={t('Stroke')} m={nm.stroke} presets={STROKE_PRESETS} dflt="#2d3340" onChange={(stroke) => apply({ stroke })} />
          {nm.strokeStyle && (
            <Field label={t('Stroke style')} mixed={nm.strokeStyle.mixed}>
              <Seg<StrokeStyle> label={t('Bulk stroke style')} mixed={nm.strokeStyle.mixed} value={nm.strokeStyle.value as StrokeStyle} options={[['solid', t('Solid')], ['dashed', t('Dashed')], ['dotted', t('Dotted')]]} onChange={(strokeStyle) => apply({ strokeStyle })} />
            </Field>
          )}
          {num(t('Stroke width'), nm.strokeWidth, { min: 0.5, max: 8, step: 0.5 }, (strokeWidth) => apply({ strokeWidth }))}
          {num(t('Radius'), nm.radius, { min: 0, max: 40 }, (radius) => apply({ radius }))}
          <Check label={t('Shadow')} state={nm.shadow} onChange={(shadow) => apply({ shadow })} />
          {num(t('Font size'), nm.fontSize, { min: 8, max: 72, suffix: 'px' }, (fontSize) => apply({ fontSize }))}
          <Check label={t('Bold')} state={nm.bold} onChange={(bold) => apply({ bold })} />
          <Color label={t('Text colour')} m={nm.textColor} presets={STROKE_PRESETS} dflt="#2d3340" onChange={(textColor) => apply({ textColor })} />
          <Color label={t('Header colour')} m={nm.accent} presets={ACCENTS} dflt="#2f6fdb" onChange={(accent) => apply({ accent })} />
          {num(t('Icon size'), nm.iconSize, { min: 16, max: 128, suffix: 'px' }, (iconSize) => apply({ iconSize }))}
        </fieldset>
      )}

      {selEdges.length > 0 && (
        <fieldset>
          <legend>{t('Edges')}</legend>
          {em.preset && (
            <Field label={t('Preset')} mixed={em.preset.mixed}>
              <Select label={t('Bulk edge preset')} mixed={em.preset.mixed} value={em.preset.mixed ? '' : String(em.preset.value)} options={[{ value: '', label: t('Custom') }, ...presets.map((p) => ({ value: p.id, label: p.name }))]} onChange={(id) => id && applyPreset(eids, id, settings.edgePresets)} />
            </Field>
          )}
          <Color label={t('Edge colour')} m={em.color} presets={EDGE_COLORS.map((c) => c.value)} dflt="#2d3340" onChange={(color) => updateEdges(eids, { color })} />
          {em.lineType && (
            <Field label={t('Line type')} mixed={em.lineType.mixed}>
              <Seg<LineType> label={t('Bulk line type')} mixed={em.lineType.mixed} value={em.lineType.value as LineType} options={[['orthogonal', t('Smart')], ['step-rounded', t('Rounded')], ['straight', t('Straight')], ['curved', t('Curved')]]} onChange={(lineType) => updateEdges(eids, { lineType })} />
            </Field>
          )}
          {em.labelSide && (
            <Field label={t('Label position')} mixed={em.labelSide.mixed}>
              <Seg<'auto' | 'on' | 'left' | 'right'> label={t('Bulk label position')} mixed={em.labelSide.mixed} value={em.labelSide.value as 'auto'} options={[['auto', t('Beside')], ['on', t('On line')], ['left', t('Left')], ['right', t('Right')]]} onChange={(labelSide) => updateEdges(eids, { labelSide })} />
            </Field>
          )}
          {em.dataFlow && (
            <Field label={t('Data flow')} mixed={em.dataFlow.mixed}>
              <Seg<'auto' | 'on' | 'off'> label={t('Bulk edge packets')} mixed={em.dataFlow.mixed} value={em.dataFlow.value === true ? 'on' : em.dataFlow.value === false ? 'off' : 'auto'} options={[['auto', t('Follow page')], ['on', t('On')], ['off', t('Off')]]} onChange={(m) => updateEdges(eids, { dataFlow: m === 'auto' ? (undefined as never) : m === 'on' })} />
            </Field>
          )}
          {em.flowSpeed && (
            <Field label={t('Flow speed')} mixed={em.flowSpeed.mixed}>
              <Seg<'slow' | 'normal' | 'fast'> label={t('Bulk flow speed')} mixed={em.flowSpeed.mixed} value={em.flowSpeed.value as 'normal'} options={[['slow', t('Slow')], ['normal', t('Normal')], ['fast', t('Fast')]]} onChange={(flowSpeed) => updateEdges(eids, { flowSpeed })} />
            </Field>
          )}
          {num(t('Packets / 100px'), em.flowDensity, { min: 0.4, max: 6, step: 0.2 }, (flowDensity) => updateEdges(eids, { flowDensity }))}
          {em.flowStyle && (
            <Field label={t('Packet style')} mixed={em.flowStyle.mixed}>
              <Seg<'dot' | 'dash' | 'pulse'> label={t('Bulk packet style')} mixed={em.flowStyle.mixed} value={em.flowStyle.value as 'dot'} options={[['dot', t('Dot')], ['dash', t('Dash')], ['pulse', t('Pulse')]]} onChange={(flowStyle) => updateEdges(eids, { flowStyle })} />
            </Field>
          )}
          {em.flowDir && (
            <Field label={t('Flow direction')} mixed={em.flowDir.mixed}>
              <Seg<'forward' | 'reverse' | 'both'> label={t('Bulk flow direction')} mixed={em.flowDir.mixed} value={em.flowDir.value as 'forward'} options={[['forward', t('Forward')], ['reverse', t('Backward')], ['both', t('Both ways')]]} onChange={(flowDir) => updateEdges(eids, { flowDir })} />
            </Field>
          )}
          {num(t('Edge width'), em.strokeWidth, { min: 0.5, max: 8, step: 0.5 }, (strokeWidth) => updateEdges(eids, { strokeWidth }))}
          {em.strokeStyle && (
            <Field label={t('Dash')} mixed={em.strokeStyle.mixed}>
              <Seg<StrokeStyle> label={t('Bulk dash')} mixed={em.strokeStyle.mixed} value={em.strokeStyle.value as StrokeStyle} options={[['solid', t('Solid')], ['dashed', t('Dashed')], ['dotted', t('Dotted')]]} onChange={(strokeStyle) => updateEdges(eids, { strokeStyle })} />
            </Field>
          )}
          {em.arrows && (
            <Field label={t('Arrowheads')} mixed={em.arrows.mixed}>
              <Seg<Arrows> label={t('Bulk arrowheads')} mixed={em.arrows.mixed} value={em.arrows.value as Arrows} options={[['none', t('None')], ['start', t('Start')], ['end', t('End')], ['both', t('Both')]]} onChange={(arrows) => updateEdges(eids, { arrows })} />
            </Field>
          )}
          <Color label={t('Label colour')} m={em.labelColor} presets={EDGE_COLORS.map((c) => c.value)} dflt="#2d3340" onChange={(labelColor) => updateEdges(eids, { labelColor })} />
          <Check label={t('Bold label')} state={em.labelBold} onChange={(labelBold) => updateEdges(eids, { labelBold })} />
          <Check label={t('Label background')} state={em.labelBg} onChange={(labelBg) => updateEdges(eids, { labelBg })} />
        </fieldset>
      )}

      <div className="btn-grid" role="group" aria-label={t('Style tools')} style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <button type="button" onClick={() => executeAction('copy-style')}>{t('Copy style')}</button>
        <button type="button" onClick={() => executeAction('paste-style')}>{t('Paste style')}</button>
        <button type="button" disabled={selNodes.length < 2} onClick={() => executeAction('match-size')}>{t('Match size')}</button>
        <button type="button" onClick={() => executeAction('reset-style')}>{t('Reset style')}</button>
      </div>
    </div>
  );
}
