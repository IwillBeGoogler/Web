import { ArrowUpRight, Circle, Diamond, Frame, Hand, LayoutList, MessageSquarePlus, MousePointer2, Network, Pen, SmilePlus, Square, StickyNote, Type, type LucideIcon } from 'lucide-react';
import { useCommentsStore } from '../comments/store';
import { canComment } from '../lib/roles';
import { useEditorSession } from '../sync/status';
import { Fragment } from 'react';
import { motion } from 'motion/react';
import { useUiStore } from '../store/uiStore';
import { useBoardStore } from '../store/boardStore';
import { useDiagramStore } from '../store/diagramStore';
import type { Tool } from '../lib/shapes';
import { t } from '../i18n';

const SEPARATE_BEFORE = new Set<Tool>(['rect', 'text', 'arrow']);
const PEN_GROUP = new Set<Tool>(['pen', 'highlighter', 'eraser']);
const TOOLS: { tool: Tool; label: string; key: string; Icon: LucideIcon; hint?: string }[] = [
  { tool: 'select', label: 'Select', key: 'V', Icon: MousePointer2 },
  { tool: 'hand', label: 'Hand', key: 'H', Icon: Hand },
  { tool: 'rect', label: 'Rectangle', key: 'R', Icon: Square },
  { tool: 'ellipse', label: 'Ellipse', key: 'O', Icon: Circle },
  { tool: 'diamond', label: 'Diamond', key: 'D', Icon: Diamond },
  { tool: 'text', label: 'Text', key: 'T', Icon: Type },
  { tool: 'sticky', label: 'Sticky note', key: 'S', Icon: StickyNote },
  { tool: 'frame', label: 'Frame', key: 'F', Icon: Frame },
  { tool: 'mindmap', label: 'Mind map', key: 'W', Icon: Network },
  { tool: 'arrow', label: 'Arrow / connector', key: 'A', Icon: ArrowUpRight },
  { tool: 'pen', label: 'Pen', key: 'P', Icon: Pen, hint: 'Pen, highlighter, eraser' },
  { tool: 'comment', label: 'Comment', key: 'C', Icon: MessageSquarePlus },
];

/** Floating tool dock (bottom-centre). The active tool has a sliding accent pill. */
export function ToolPalette() {
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);
  const commentsOn = useCommentsStore((s) => !!s.fileId);
  const role = useEditorSession((s) => s.role);
  const popover = useBoardStore((b) => b.popover);
  const setBoard = useBoardStore((b) => b.set);
  const hasFrames = useDiagramStore((d) => d.nodes.some((n) => n.type === 'frame'));
  const visible = TOOLS.filter(({ tool: t }) => t !== 'comment' || (commentsOn && canComment(role)));
  return (
    <div className="dock glass" role="toolbar" aria-label={t('Tools')}>
      {visible.map(({ tool: tid, label, key, Icon, hint }, i) => (
        <Fragment key={tid}>
        {(SEPARATE_BEFORE.has(tid) || tid === 'comment') && i > 0 && <span className="dock-sep" aria-hidden />}
        <motion.button
          type="button"
          className={tool === tid || (tid === 'pen' && PEN_GROUP.has(tool)) ? 'active' : ''}
          aria-pressed={tool === tid || (tid === 'pen' && PEN_GROUP.has(tool))}
          aria-label={t(label)}
          title={`${t(hint ?? label)} (${key})`}
          whileTap={{ scale: 0.92 }}
          onClick={() => setTool(tid)}
        >
          {(tool === tid || (tid === 'pen' && PEN_GROUP.has(tool))) && <motion.span layoutId="dock-pill" className="dock-pill" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
          <Icon size={17} strokeWidth={1.8} aria-hidden />
        </motion.button>
        </Fragment>
      ))}
      <span className="dock-sep" aria-hidden />
      <motion.button type="button" className={popover === 'emoji' ? 'active pop' : ''} aria-pressed={popover === 'emoji'} aria-label={t('Reactions and stamps')} title={t('Reactions and stamps')} whileTap={{ scale: 0.92 }} onClick={() => setBoard({ popover: popover === 'emoji' ? null : 'emoji' })}>
        <SmilePlus size={17} strokeWidth={1.8} aria-hidden />
      </motion.button>
      {hasFrames && (
        <motion.button type="button" className={popover === 'frames' ? 'active pop' : ''} aria-pressed={popover === 'frames'} aria-label={t('Frames')} title={t('Frames')} whileTap={{ scale: 0.92 }} onClick={() => setBoard({ popover: popover === 'frames' ? null : 'frames' })}>
          <LayoutList size={17} strokeWidth={1.8} aria-hidden />
        </motion.button>
      )}
    </div>
  );
}
