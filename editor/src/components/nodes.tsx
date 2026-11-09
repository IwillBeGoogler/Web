import { memo, useState, type CSSProperties, type ReactNode } from 'react';
import { addTag, updateTag, CARD_INK, CARD_TINT_PCT } from '../lib/card';
import { motion } from 'motion/react';
import { Handle, NodeResizer, Position, useNodeId, type NodeProps } from '@xyflow/react';
import { nodeSize } from '../lib/graph';
import type { CardTag, DiagramNode } from '../types';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useResolvedSettings } from '../store/settingsStore';
import { resolveNodeStyle, type NodeVisual } from '../lib/settings';
import { strokeDasharray } from '../lib/shapes';
import { IconGlyph } from './IconGlyph';
import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react';
import { regionDividers } from '../lib/state/regions';
import { memberCount } from '../clusters/collapse';
import { roleKind, roleSummary } from '../clusters/roles';
import { BufferedInput } from './BufferedInput';
import { useTip } from './Tooltip';
import { TableNode } from './er/TableNode';
import { ClassNode } from './uml/ClassNode';
import { SequenceNode } from './seq/SequenceNode';
import { TimingNode } from './timing/TimingNode';
import { StateNode } from './state/StateNode';
import { UseCaseNode } from './usecase/UseCaseNode';
import { ActivityNode } from './activity/ActivityNode';
import { DeploymentNode } from './deployment/DeploymentNode';
import { ObjectNode } from './object/ObjectNode';
import { ComponentNode } from './component/ComponentNode';
import { DrawBoardNode, FrameNode, MindMapNode, StampNode, StickyBoardNode } from './board/BoardNodes';
import { t } from '../i18n';
import { nodeBadges } from '@core/arch';

/** Spring pop-in when a node mounts (reduced-motion users get none via MotionConfig). */
function PopIn({ children, fill }: { children: ReactNode; fill?: boolean }) {
  return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 30 }} style={fill ? { width: '100%', height: '100%' } : undefined}>
      {children}
    </motion.div>
  );
}

const SIDES: [string, Position][] = [
  ['top', Position.Top],
  ['right', Position.Right],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
];

function Handles() {
  return (
    <>
      {SIDES.map(([id, pos]) => (
        <Handle key={id} id={id} type="source" position={pos} className="handle" />
      ))}
    </>
  );
}

function useLabelEditing(id: string) {
  const editing = useUiStore((s) => s.editingId === id);
  const setEditing = useUiStore((s) => s.setEditing);
  const update = useDiagramStore((s) => s.updateNodeData);
  return { editing, start: () => setEditing(id), stop: () => setEditing(null), update: (label: string) => update(id, { label }) };
}

const textStyle = (d: DiagramNode['data'], v: NodeVisual): CSSProperties => ({
  fontSize: d.fontSize,
  fontWeight: d.bold ? 700 : undefined,
  textAlign: d.align,
  color: v.textColor,
});

/** Container border + shadow; the fill lives in a separate layer so `opacity` only fades the background. */
const frameStyle = (v: NodeVisual, round?: boolean): CSSProperties => ({
  borderRadius: round ? '50%' : v.radius,
  border: v.border ? `${v.borderWidth}px ${v.borderStyle} ${v.borderColor}` : undefined,
  boxShadow: v.shadow ? '0 2px 8px rgba(20,28,45,.18)' : undefined,
});
const fillStyle = (v: NodeVisual, round?: boolean): CSSProperties => ({
  borderRadius: round ? '50%' : v.radius,
  background: v.background === 'filled' ? v.fill : 'transparent',
  opacity: v.background === 'filled' ? v.opacity / 100 : undefined,
});

/** architecture pills (OLTP, PR·async, RF3 ...) under a component; at most 3 */
function ArchBadges({ type, data }: { type: string; data: DiagramNode['data'] }) {
  const badges = data.arch ? nodeBadges({ type, data } as never).slice(0, 3) : [];
  if (!badges.length) return null;
  return <div className="arch-badges" aria-label={t('Architecture')} data-testid="arch-badges">{badges.map((b) => <span key={b} className="arch-badge">{b}</span>)}</div>;
}

export function IconNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const ed = useLabelEditing(id);
  const labelTip = useTip({ title: data.label, path: data.subtitle }, { onlyWhenTruncated: true });
  const settings = useResolvedSettings();
  const v = resolveNodeStyle(data, 'icon', settings);
  const filled = v.background === 'filled';
  return (
    <PopIn>
    <div className={`node-icon${selected ? ' selected' : ''}${filled || v.border ? ' carded' : ''}`} style={frameStyle(v)} onDoubleClick={ed.start}>
      {filled && <div className="node-bg" style={fillStyle(v)} />}
      <Handles />
      <div className="node-content">
        <IconGlyph iconId={data.iconId} size={data.iconSize} />
        {ed.editing ? (
          <BufferedInput autoFocus value={data.label} onCommit={ed.update} onDone={ed.stop} className="nodrag inline-edit" aria-label={t('Node label')} />
        ) : (
          <div className="node-label" style={{ ...textStyle(data, v), ...(data.labelColor ? { color: data.labelColor } : {}) }} {...labelTip}>{data.label}</div>
        )}
        {data.subtitle ? <div className="node-subtitle" style={data.subtitleColor ? { color: data.subtitleColor } : v.textColor ? { color: v.textColor } : undefined}>{data.subtitle}</div> : null}
        <ArchBadges type="icon" data={data} />
        {data.role ? <span className={`role-pill role-${roleKind(data.role)}`}>{data.role}</span> : null}
        {data.partitions && data.partitions.length > 0 ? (
          <div className="part-strip" aria-label={t('Partitions')}>
            {data.partitions.map((p) => (
              <span key={`${p.topic}-${p.partition}`} className={`part-chip${p.leader ? ' leader' : ''}`} title={t(p.leader ? '{topic} partition {n} (leader)' : '{topic} partition {n}', { topic: p.topic, n: p.partition })}>
                P{p.partition}{p.leader ? '★' : ''}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
    </PopIn>
  );
}

function Resizer({ selected, locked, min = [40, 30] }: { selected?: boolean; locked?: boolean; min?: [number, number] }) {
  const id = useNodeId();
  const snapshot = useDiagramStore((s) => s.snapshot);
  return <NodeResizer isVisible={!!selected && !locked} minWidth={min[0]} minHeight={min[1]} onResizeStart={snapshot} onResizeEnd={() => id && keepChildrenInside(id)} />;
}

/** a shrunk group / cluster pulls its children back inside its box (title band on top, a small margin elsewhere) */
function keepChildrenInside(parentId: string) {
  const PAD = 12, TOP = 36, GAP = 16;
  useDiagramStore.setState((s) => {
    const parent = s.nodes.find((n) => n.id === parentId);
    if (!parent) return s;
    const box = nodeSize(parent);
    const kids = s.nodes.filter((n) => n.parentId === parentId && !n.hidden).sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    if (!kids.length) return s;
    // 1. clamp every child into the box  2. slide any that now overlap a placed sibling to the right, wrapping to a new row
    type R = { x: number; y: number; w: number; h: number };
    const placed: R[] = [];
    const hit = (r: R) => placed.find((p) => r.x < p.x + p.w && p.x < r.x + r.w && r.y < p.y + p.h && p.y < r.y + r.h);
    const pos = new Map<string, { x: number; y: number }>();
    for (const k of kids) {
      const { width: w, height: h } = nodeSize(k);
      const r: R = { x: Math.max(PAD, Math.min(k.position.x, box.width - w - PAD)), y: Math.max(TOP, Math.min(k.position.y, box.height - h - PAD)), w, h };
      for (let p = hit(r), guard = 0; p && guard < 500; p = hit(r), guard++) {
        r.x = p.x + p.w + GAP;
        if (r.x + w > box.width - PAD) { r.x = PAD; r.y = p.y + p.h + GAP; }
      }
      placed.push(r);
      pos.set(k.id, { x: r.x, y: r.y });
    }
    // 3. whatever still sticks out grows the box (nothing is ever pushed outside or stacked)
    const width = Math.max(box.width, ...placed.map((r) => r.x + r.w + PAD));
    const height = Math.max(box.height, ...placed.map((r) => r.y + r.h + PAD));
    const nodes = s.nodes.map((n) => {
      if (n.id === parentId && (width !== box.width || height !== box.height)) return { ...n, width, height, style: { ...(n.style ?? {}), width, height } };
      const p = pos.get(n.id);
      return p && (p.x !== n.position.x || p.y !== n.position.y) ? { ...n, position: p } : n;
    });
    return { nodes };
  });
}

function Label({ id, data, v, multiline }: { id: string; data: DiagramNode['data']; v: NodeVisual; multiline?: boolean }) {
  const ed = useLabelEditing(id);
  if (ed.editing)
    return <BufferedInput autoFocus multiline={multiline} value={data.label} onCommit={ed.update} onDone={ed.stop} className="nodrag inline-edit" style={textStyle(data, v)} aria-label={t('Label')} />;
  return <div className="shape-label" style={textStyle(data, v)}>{data.label}</div>;
}

export function ShapeNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const ed = useLabelEditing(id);
  const settings = useResolvedSettings();
  const v = resolveNodeStyle(data, 'shape', settings);
  const shape = data.shape ?? 'rect';
  const dash = strokeDasharray(v.borderStyle);
  let body: ReactNode;
  if (shape === 'diamond') {
    body = (
      <svg className="shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon
          points="50,1 99,50 50,99 1,50"
          fill={v.background === 'filled' ? v.fill : 'none'}
          fillOpacity={v.opacity / 100}
          stroke={v.border ? v.borderColor : 'none'}
          strokeWidth={v.borderWidth}
          strokeDasharray={dash}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }
  if (shape === 'ellipsis')
    return (
      <div className={`node-ellipsis${selected ? ' selected' : ''}`} data-testid="ellipsis" style={{ color: v.textColor }}>
        <Resizer selected={selected} locked={!!data.locked} min={[24, 16]} />
        <Handles />
        <span aria-label={t('and so on')}>···</span>
      </div>
    );
  if (shape === 'cylinder') {
    const fill = v.background === 'filled' ? v.fill : 'none';
    const stroke = v.border || data.stroke ? v.borderColor : '#2d3340';
    body = (
      <svg className="shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none" data-testid="cylinder-svg">
        <path d="M2 14C2 5 98 5 98 14V86C98 95 2 95 2 86Z" fill={fill} fillOpacity={v.opacity / 100} stroke={stroke} strokeWidth={Math.max(1.2, v.borderWidth)} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />
        <path d="M2 14C2 23 98 23 98 14" fill="none" stroke={stroke} strokeWidth={Math.max(1.2, v.borderWidth)} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }
  const round = shape === 'ellipse';
  const svgShape = shape === 'diamond' || shape === 'cylinder';
  return (
    <PopIn fill>
    <div
      className={`node-shape${selected ? ' selected' : ''}`}
      style={svgShape ? { filter: v.shadow ? 'drop-shadow(0 2px 6px rgba(20,28,45,.25))' : undefined } : frameStyle(v, round)}
      onDoubleClick={ed.start}
    >
      <Resizer selected={selected} locked={!!data.locked} />
      {svgShape ? body : v.background === 'filled' && <div className="node-bg" style={fillStyle(v, round)} />}
      <Handles />
      <Label id={id} data={data} v={v} multiline />
    </div>
    </PopIn>
  );
}

export function StickyNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const ed = useLabelEditing(id);
  const settings = useResolvedSettings();
  const v = resolveNodeStyle(data, 'sticky', settings);
  return (
    <PopIn fill>
    <div className={`node-sticky${data.umlNote ? ' uml-note' : ''}${selected ? ' selected' : ''}`} style={frameStyle(v)} onDoubleClick={ed.start}>
      <Resizer selected={selected} locked={!!data.locked} min={[80, 60]} />
      <div className="node-bg" style={fillStyle(v)} />
      <Handles />
      <Label id={id} data={data} v={v} multiline />
    </div>
    </PopIn>
  );
}

export function GroupNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const ed = useLabelEditing(id);
  const settings = useResolvedSettings();
  const v = resolveNodeStyle(data, 'group', settings);
  const variant = data.variant;
  const accent = (data.accent as string | undefined) ?? '#2f6fdb';
  const card = variant === 'card';
  // concurrent regions of a composite state: `axis:pos` pairs, as a string so the selector stays stable
  const dividerKey = useDiagramStore((s) => (variant === 'composite' ? regionDividers(s.nodes.filter((n) => n.parentId === id)).map((d) => `${d.axis}:${Math.round(d.pos)}`).join(',') : ''));
  const lane = variant === 'lane';
  const boxy = variant === 'composite' || variant === 'boundary' || lane;
  const frame: CSSProperties = boxy ? { borderRadius: variant === 'composite' ? 18 : lane ? 0 : 6, border: `${variant === 'boundary' ? 2 : 1.6}px solid ${accent}`, boxShadow: v.shadow ? '0 2px 8px rgba(20,28,45,.18)' : undefined } : card ? { ...frameStyle(v), border: `1.5px solid color-mix(in srgb, ${accent} 55%, transparent)` } : frameStyle(v);
  const bg: CSSProperties = boxy
    ? { borderRadius: variant === 'composite' ? 16 : lane ? 0 : 4, background: `color-mix(in srgb, ${accent} ${variant === 'composite' ? 7 : 3}%, transparent)` }
    : card
    ? { borderRadius: v.radius, background: `color-mix(in srgb, ${accent} 9%, transparent)` }
    : { borderRadius: v.radius, background: v.fill, opacity: v.fillOpacity / 100 };
  return (
    <div className={`node-group${selected ? ' selected' : ''}${selected && !data.locked ? ' resizable' : ''}${variant ? ` variant-${variant}` : ''}${lane && data.laneOrient === 'h' ? ' lane-h' : ''}`} style={lane ? { ...frame, ['--lane-accent' as string]: accent } : frame}>
      <Resizer selected={selected} locked={!!data.locked} min={[120, 80]} />
      <Handles />
      <div className="node-bg" style={bg} />
      {variant === 'package' && (
        <div className="pkg-tab" onDoubleClick={ed.start} style={{ color: v.textColor ?? undefined }}>
          {ed.editing ? <BufferedInput autoFocus value={data.label} onCommit={ed.update} onDone={ed.stop} className="nodrag inline-edit" aria-label={t('Package name')} /> : data.label}
        </div>
      )}
      {dividerKey && dividerKey.split(',').map((k) => {
        const [axis, pos] = k.split(':');
        return <div key={k} className={`region-divider ${axis}`} data-testid="region-divider" style={axis === 'x' ? { left: Number(pos) } : { top: Number(pos) }} />;
      })}
      {variant === 'composite' && <div className="group-rule" style={{ background: `color-mix(in srgb, ${accent} 55%, transparent)` }} />}
      <div className="group-head" style={variant === 'package' ? { display: 'none' } : undefined}>
        {data.groupIcon ? <IconGlyph iconId={data.groupIcon} size={card ? 28 : 24} /> : null}
        {ed.editing ? (
          <BufferedInput autoFocus value={data.label} onCommit={ed.update} onDone={ed.stop} className="nodrag inline-edit" aria-label={t('Group title')} />
        ) : (
          <div className="group-titles" onDoubleClick={ed.start}>
            <div className="group-title" style={{ color: v.textColor ?? undefined, fontSize: data.fontSize, textAlign: data.align }}>{data.label}</div>
            {card && data.subtitle ? <div className="group-subtitle">{data.subtitle}</div> : null}
          </div>
        )}
      </div>
      {variant === 'dashed' && data.caption ? <div className="group-caption" data-testid="group-caption">{data.caption}</div> : null}
    </div>
  );
}

export function TextNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const ed = useLabelEditing(id);
  const settings = useResolvedSettings();
  const v = resolveNodeStyle(data, 'text', settings);
  const style = { ...textStyle(data, v), fontSize: data.fontSize ?? 14, ...(v.background === 'filled' && !v.textColor ? { color: '#2d3340' } : {}) };
  return (
    <div className={`node-text${selected ? ' selected' : ''}`} style={{ ...style, ...(v.border || v.background === 'filled' ? { ...frameStyle(v), background: v.background === 'filled' ? v.fill : undefined } : {}) }} onDoubleClick={ed.start}>
      {ed.editing ? (
        <BufferedInput autoFocus multiline value={data.label} onCommit={ed.update} onDone={ed.stop} className="nodrag inline-edit" style={style} aria-label={t('Text')} />
      ) : (
        data.label || 'Text'
      )}
    </div>
  );
}

export function DrawNode({ data, selected }: NodeProps<DiagramNode>) {
  return (
    <div className={`node-draw${selected ? ' selected' : ''}`}>
      <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
        <path d={data.path ?? ''} fill="none" stroke={data.stroke ?? '#2d3340'} strokeWidth={data.strokeWidth ?? 2.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function ClusterNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const ed = useLabelEditing(id);
  const settings = useResolvedSettings();
  const v = resolveNodeStyle(data, 'cluster', settings);
  const toggle = useDiagramStore((s) => s.toggleCollapse);
  const count = useDiagramStore((s) => memberCount(s.nodes, id));
  const summary = useDiagramStore((s) => roleSummary(s.nodes, id));
  const warnings = data.warnings ?? [];
  const warnTip = useTip(warnings.length ? { title: `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`, lines: warnings } : null);
  const collapsed = !!data.collapsed;
  const accent = (data.accent as string | undefined) ?? '#5b5bf7';
  return (
    <PopIn fill>
      <div className={`node-cluster${selected ? ' selected' : ''}${collapsed ? ' collapsed' : ''}${selected && !collapsed && !data.locked ? ' resizable' : ''}`} style={{ ...frameStyle(v), ['--cluster-accent' as string]: accent }} data-testid={`cluster-${id}`}>
        {!collapsed && <Resizer selected={selected} locked={!!data.locked} min={[160, 100]} />}
        <Handles />
        {collapsed ? (
          <motion.div key="compact" className="cluster-compact" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 32 }}>
            <span className="stack stack-2" aria-hidden />
            <span className="stack stack-1" aria-hidden />
            <div className="cluster-card">
              <button type="button" className="cluster-toggle nodrag" aria-label={t('Expand cluster')} aria-expanded={false} onClick={() => toggle(id)}>
                <ChevronRight size={14} aria-hidden />
              </button>
              {data.iconId ? <span className="cluster-logo"><IconGlyph iconId={data.iconId} size={30} /></span> : null}
              <div className="cluster-card-text">
                <div className="cluster-title">{data.label}</div>
                {summary || data.subtitle ? <div className="cluster-sub">{summary || data.subtitle}</div> : null}
              </div>
              <span className="count-badge" aria-label={t('{n} members', { n: count })}>×{count}</span>
              {warnings.length > 0 && (
                <span className="cluster-warn" tabIndex={0} aria-label={t('{n} warnings', { n: warnings.length })} {...warnTip}>
                  <TriangleAlert size={14} aria-hidden />
                </span>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div key="expanded" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} style={{ position: 'absolute', inset: 0 }}>
            <div className="node-bg" style={{ borderRadius: v.radius, background: v.fill, opacity: v.fillOpacity / 100 }} />
            <div className="cluster-head" style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)`, borderBottom: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`, borderRadius: `${v.radius}px ${v.radius}px 0 0` }}>
              <button type="button" className="cluster-toggle nodrag" aria-label={t('Collapse cluster')} aria-expanded onClick={() => toggle(id)}>
                <ChevronDown size={14} aria-hidden />
              </button>
              {data.iconId ? <IconGlyph iconId={data.iconId} size={22} /> : null}
              {ed.editing ? (
                <BufferedInput autoFocus value={data.label} onCommit={ed.update} onDone={ed.stop} className="nodrag inline-edit" aria-label={t('Cluster title')} />
              ) : (
                <div className="cluster-heading" onDoubleClick={ed.start}>
                  <span className="cluster-title">{data.label}</span>
                  {data.subtitle ? <span className="cluster-sub">{data.subtitle}</span> : null}
                </div>
              )}
              {warnings.length > 0 && (
                <span className="cluster-warn-badge" tabIndex={0} aria-label={t('{n} warnings', { n: warnings.length })} {...warnTip}>
                  <TriangleAlert size={13} aria-hidden /> {warnings.length}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </PopIn>
  );
}

export function CardNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const ed = useLabelEditing(id);
  const update = useDiagramStore((st) => st.updateNodeData);
  const [editTag, setEditTag] = useState<number | null>(null);
  const accent = (data.accent as string | undefined) ?? '#2f6fdb';
  const tags = data.tags ?? [];
  const horizontal = data.layout === 'horizontal';
  const setTags = (next: CardTag[]) => update(id, { tags: next });
  return (
    <PopIn fill>
      <div
        className={`node-card ${horizontal ? 'horizontal' : 'vertical'}${selected ? ' selected' : ''}`}
        style={{ ['--card-accent' as string]: accent, color: CARD_INK, background: `color-mix(in srgb, ${accent} ${CARD_TINT_PCT}%, white)`, borderColor: `color-mix(in srgb, ${accent} 40%, transparent)` }}
        data-testid={`card-${id}`}
      >
        <Resizer selected={selected} locked={!!data.locked} min={[140, 70]} />
        <Handles />
        {data.iconId ? <IconGlyph iconId={data.iconId} size={horizontal ? 40 : 36} /> : null}
        <div className="card-body">
          {ed.editing ? (
            <BufferedInput autoFocus value={data.label} onCommit={ed.update} onDone={ed.stop} className="nodrag inline-edit" aria-label={t('Card title')} />
          ) : (
            <div className="card-title" onDoubleClick={ed.start}>{data.label}</div>
          )}
          {data.subtitle ? <div className="card-sub">{data.subtitle}</div> : null}
          <ArchBadges type="card" data={data} />
          <div className="card-tags" aria-label={t('Tags')}>
            {tags.map((tg, i) =>
              editTag === i ? (
                <BufferedInput key={i} autoFocus value={tg.text} onCommit={(text) => setTags(updateTag(tags, i, { text }))} onDone={() => setEditTag(null)} className="nodrag inline-edit tag-input" aria-label={t('Tag {n}', { n: i + 1 })} />
              ) : (
                <span key={i} className="card-tag nodrag" style={{ ['--tag' as string]: tg.color }} onDoubleClick={() => setEditTag(i)} data-testid="card-tag">
                  {tg.text}
                </span>
              ),
            )}
            {selected && !data.locked ? (
              <button type="button" className="card-tag-add nodrag" aria-label={t('Add tag')} onClick={() => { setTags(addTag(tags)); setEditTag(tags.length); }}>+</button>
            ) : null}
          </div>
        </div>
      </div>
    </PopIn>
  );
}

export function JunctionNode({ selected, data }: NodeProps<DiagramNode>) {
  const join = (data as { join?: { dot: boolean; color?: string } }).join;
  return (
    <div className={`node-junction${selected ? ' selected' : ''}`} data-testid="junction">
      {join?.dot && <span className="junction-dot" data-testid="junction-dot" style={{ background: join.color }} />}
      <Handles />
    </div>
  );
}

const rawNodeTypes = { icon: IconNode, group: GroupNode, cluster: ClusterNode, card: CardNode, junction: JunctionNode, table: TableNode, class: ClassNode, sequence: SequenceNode, timing: TimingNode, state: StateNode, usecase: UseCaseNode, activity: ActivityNode, component: ComponentNode, deployment: DeploymentNode, object: ObjectNode, text: TextNode, shape: ShapeNode, sticky: StickyBoardNode, draw: DrawBoardNode, frame: FrameNode, mindmap: MindMapNode, stamp: StampNode };
// memoized: React Flow re-renders a node only when its own props change (a drag of one node must not re-render 5k others)
export const nodeTypes = Object.fromEntries(Object.entries(rawNodeTypes).map(([k, C]) => [k, memo(C)])) as unknown as typeof rawNodeTypes;
