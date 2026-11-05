import { useMemo, useState, type CSSProperties } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { Lock } from 'lucide-react';
import type { DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { useResolvedSettings } from '../../store/settingsStore';
import { resolveNodeStyle } from '../../lib/settings';
import { addNextStickyFrom, isMasked, mmAddChild, mmAddSibling, mmPromote, mmSetLabel, mmToggleCollapse, myBoardId } from '../../lib/board/actions';
import { fitFontSize } from '../../lib/board/sticky';
import { drawPathOf } from '../../lib/board/freehand';
import { mindmapSize } from '../../lib/board/mindmap';
import { hiddenCount } from '../../lib/board/mindmapOps';
import { BufferedInput } from '../BufferedInput';
import { InlineEditor } from './InlineEditor';
import '../../styles/board.css';
import { t } from '../../i18n';

const SIDES: [string, Position][] = [['top', Position.Top], ['right', Position.Right], ['bottom', Position.Bottom], ['left', Position.Left]];
const Handles = () => (
  <>
    {SIDES.map(([id, pos]) => <Handle key={id} id={id} type="source" position={pos} className="handle" />)}
  </>
);
function useEditing(id: string) {
  const editing = useUiStore((s) => s.editingId === id);
  const setEditing = useUiStore((s) => s.setEditing);
  return { editing, start: () => setEditing(id), stop: () => setEditing(null) };
}

// ------------------------------------------------------------------ sticky
export function StickyBoardNode({ id, data, selected, width, height }: NodeProps<DiagramNode>) {
  const ed = useEditing(id);
  const settings = useResolvedSettings();
  const v = resolveNodeStyle(data, 'sticky', settings);
  const update = useDiagramStore((s) => s.updateNodeData);
  const snapshot = useDiagramStore((s) => s.snapshot);
  const [live, setLive] = useState<string | null>(null);
  const w = width ?? 160;
  const h = height ?? 140;
  const masked = isMasked({ id, type: 'sticky', position: { x: 0, y: 0 }, data }, myBoardId());
  const text = ed.editing && live !== null ? live : data.label;
  const auto = data.autoFont !== false && data.autoFont !== undefined;
  const fontSize = auto ? fitFontSize(text, w, h) : data.fontSize ?? 14;
  const textStyle: CSSProperties = { fontSize, fontWeight: data.bold ? 700 : undefined, textAlign: data.align, color: v.textColor, lineHeight: 1.25 };
  const box: CSSProperties = {
    borderRadius: v.radius,
    border: v.border ? `${v.borderWidth}px ${v.borderStyle} ${v.borderColor}` : undefined,
    boxShadow: v.shadow ? '0 2px 8px rgba(20,28,45,.18)' : undefined,
  };
  return (
    <div className={`node-sticky${data.umlNote ? ' uml-note' : ''}${selected ? ' selected' : ''}${masked ? ' masked' : ''}`} style={box} onDoubleClick={() => !masked && ed.start()} data-testid={masked ? 'sticky-masked' : undefined}>
      <NodeResizer isVisible={!!selected && !data.locked} minWidth={80} minHeight={60} onResizeStart={snapshot} />
      <div className="node-bg" style={{ borderRadius: v.radius, background: v.fill, opacity: v.opacity / 100 }} />
      <Handles />
      {masked ? (
        <div className="sticky-hidden" aria-label={t('Hidden until revealed')}>
          <Lock size={Math.min(28, w / 5)} strokeWidth={1.6} aria-hidden />
          <span>{data.author ? t("{name}'s idea", { name: String(data.author) }) : t('Hidden')}</span>
        </div>
      ) : ed.editing ? (
        <InlineEditor
          multiline
          value={data.label}
          aria-label={t('Sticky text')}
          style={textStyle}
          onInput={setLive}
          onCommit={(t) => update(id, { label: t })}
          onDone={() => { setLive(null); ed.stop(); }}
          onKey={(e, commit) => {
            if (e.key === 'Tab' && !e.shiftKey) { commit(); addNextStickyFrom(id, 'right'); return true; }
            if (e.key === 'Enter' && e.shiftKey) { commit(); addNextStickyFrom(id, 'below'); return true; }
            return false;
          }}
        />
      ) : (
        <div className="shape-label sticky-text" style={textStyle}>{data.label}</div>
      )}
      {!masked && data.author ? <span className="sticky-author">{String(data.author)}</span> : null}
      {!masked && data.private ? <Lock className="sticky-private" size={12} aria-label={t('Private until revealed')} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ frame
export function FrameNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const ed = useEditing(id);
  const update = useDiagramStore((s) => s.updateNodeData);
  const snapshot = useDiagramStore((s) => s.snapshot);
  const accent = (data.accent as string | undefined) ?? '#5b5bf7';
  return (
    <div className={`node-frame${selected ? ' selected' : ''}`} style={{ ['--frame-accent' as string]: accent }}>
      <NodeResizer isVisible={!!selected && !data.locked} minWidth={160} minHeight={100} onResizeStart={snapshot} />
      <div className="frame-body" />
      <div className="frame-title" onDoubleClick={ed.start} data-testid="frame-title">
        {ed.editing ? (
          <BufferedInput autoFocus value={data.label} onCommit={(label) => update(id, { label })} onDone={ed.stop} className="nodrag inline-edit" aria-label={t('Frame name')} />
        ) : (
          <span>{data.label || 'Frame'}</span>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ mind map
export function MindMapNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const ed = useEditing(id);
  const seed = useUiStore((s) => (s.editingId === id ? s.editSeed : null));
  const dropHere = useUiStore((s) => s.mmDrop === id);
  const isRoot = data.root === true;
  const accent = (data.accent as string | undefined) ?? '#5b5bf7';
  const kids = useDiagramStore((s) => s.edges.filter((e) => e.source === id).length);
  const hidden = useDiagramStore((s) => (data.collapsed ? hiddenCount(s.nodes, s.edges, id) : 0));
  const size = mindmapSize(data.label, isRoot);
  const side = data.side === 'l' ? 'l' : 'r';
  const plus = (cls: string, label: string, run: () => void) => (
    <button type="button" className={`mm-plus nodrag nopan ${cls}`} aria-label={t(label)} title={t(label)} onClick={(e) => { e.stopPropagation(); run(); }}>+</button>
  );
  return (
    <div className={`node-mindmap${isRoot ? ' root' : ''}${selected ? ' selected' : ''}${dropHere ? ' mm-drop' : ''}`} style={{ ['--mm-accent' as string]: accent, width: '100%', minHeight: size.height }} onDoubleClick={ed.start}>
      <Handles />
      {ed.editing ? (
        <InlineEditor
          value={data.label}
          seed={seed}
          aria-label={t('Mind map text')}
          onCommit={(t) => mmSetLabel(id, t)}
          onDone={ed.stop}
          onKey={(e, commit) => {
            if (e.key === 'Tab') { commit(); if (e.shiftKey) mmPromote(id); else mmAddChild(id); return true; }
            if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { commit(); mmAddSibling(id); return true; }
            return false;
          }}
        />
      ) : (
        <span className="mm-label">{data.label || (isRoot ? t('Central idea') : t('Idea'))}</span>
      )}
      {selected && !ed.editing && (
        <>
          {(isRoot || side === 'r') && plus('r', isRoot ? 'Add a topic on the right' : 'Add a subtopic', () => mmAddChild(id, 'r'))}
          {(isRoot || side === 'l') && plus('l', isRoot ? 'Add a topic on the left' : 'Add a subtopic', () => mmAddChild(id, 'l'))}
          {!isRoot && plus('b', 'Add a sibling', () => mmAddSibling(id))}
        </>
      )}
      {kids > 0 && (
        <button type="button" className={`mm-toggle nodrag${data.collapsed ? ' collapsed' : ''} ${side}`} aria-label={data.collapsed ? t('Expand branch ({n} hidden)', { n: hidden }) : t('Collapse branch')} aria-expanded={!data.collapsed} title={data.collapsed ? t('{n} hidden', { n: hidden }) : t('Collapse')} onClick={(e) => { e.stopPropagation(); mmToggleCollapse(id); }}>
          {data.collapsed ? hidden : null}
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ stamp
export function StampNode({ data, selected, width, height }: NodeProps<DiagramNode>) {
  const snapshot = useDiagramStore((s) => s.snapshot);
  const size = Math.min(width ?? 56, height ?? 56);
  return (
    <div className={`node-stamp${selected ? ' selected' : ''}`}>
      <NodeResizer isVisible={!!selected && !data.locked} minWidth={28} minHeight={28} keepAspectRatio onResizeStart={snapshot} />
      <span style={{ fontSize: size * 0.78, lineHeight: 1 }} role="img" aria-label={t('Stamp')}>{String(data.emoji ?? '👍')}</span>
    </div>
  );
}

// ------------------------------------------------------------------ freehand
export function DrawBoardNode({ data, selected }: NodeProps<DiagramNode>) {
  const pts = typeof data.pts === 'string';
  const d = useMemo(() => (pts ? drawPathOf({ data }) : ((data.path as string | undefined) ?? '')), [pts, data]);
  const stroke = (data.stroke as string | undefined) ?? '#2d3340';
  const hl = data.brush === 'highlighter';
  return (
    <div className={`node-draw${selected ? ' selected' : ''}${hl ? ' highlighter' : ''}`}>
      <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
        {pts ? (
          <path d={d} fill={stroke} stroke="none" fillOpacity={hl ? 0.38 : 1} />
        ) : (
          <path d={d} fill="none" stroke={stroke} strokeWidth={(data.strokeWidth as number | undefined) ?? 2.5} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </div>
  );
}
