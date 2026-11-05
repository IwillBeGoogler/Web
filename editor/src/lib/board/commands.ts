/** Board commands behind menu items, ⌘K and shortcuts: `executeBoardAction('board-arrange:grid', env)`. Returns false for names that are not Board actions. */
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { useBoardStore } from '../../store/boardStore';
import { toast } from '../../store/toastStore';
import type { Tool } from '../shapes';
import { addFrameFor, arrangeSelected, createMindMapAt, createStickyAt, mmAddChild, mmAddSibling, mmExport, mmImport, mmLayoutAll, mmToggleCollapse, revealAll, stampAt } from './actions';
import { viewCenter, viewRect } from './flowRef';
import { frameLink, frameRect } from './frames';
import { STICKY_COLORS } from './sticky';
import { flowRef } from './flowRef';
import { bringEveryoneToMe, sendReaction, startPresentation } from './live';

async function copyText(text: string, ok: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(ok);
  } catch {
    toast.error('Could not use the clipboard');
  }
}

export function executeBoardAction(action: string, env: { nodeId?: string; at?: { x: number; y: number } } = {}): boolean {
  const [name, ...rest] = action.split(':');
  const arg = rest.join(':');
  const st = useDiagramStore.getState();
  const board = useBoardStore.getState();
  const at = env.at ?? viewCenter();
  const selected = () => st.nodes.filter((n) => n.selected);
  switch (name) {
    case 'show-help': board.set({ popover: board.popover === 'help' ? null : 'help' }); return true;
    case 'board-tool': useUiStore.getState().setTool(arg as Tool); return true;
    case 'board-sticky': createStickyAt(at); return true;
    case 'board-frame': addFrameFor(at); return true;
    case 'board-mindmap': createMindMapAt(at); return true;
    case 'board-stamp': stampAt(at, board.stampEmoji); return true;
    case 'board-arrange': {
      const n = arrangeSelected(arg === 'color' ? 'color' : 'grid');
      if (!n) toast.info(arg === 'color' ? 'Select some stickies to group by colour' : 'Select two or more stickies to arrange');
      return true;
    }
    case 'board-reveal': {
      const n = revealAll();
      toast[n ? 'success' : 'info'](n ? `Revealed ${n} sticky note${n === 1 ? '' : 's'}` : 'Nothing is hidden');
      return true;
    }
    case 'board-private': {
      board.set({ privateMode: !board.privateMode });
      toast.info(board.privateMode ? 'New stickies are visible to everybody' : 'New stickies stay hidden from others until you reveal them');
      return true;
    }
    case 'board-author': board.set({ showAuthor: !board.showAuthor }); return true;
    case 'board-recognize': {
      board.set({ recognize: !board.recognize });
      toast.info(board.recognize ? 'Shape recognition off' : 'Shape recognition on: rough shapes become clean');
      return true;
    }
    case 'board-frames': board.set({ popover: 'frames' }); return true;
    case 'board-present': startPresentation(env.nodeId && st.nodes.find((n) => n.id === env.nodeId)?.type === 'frame' ? env.nodeId : undefined); return true;
    case 'board-frame-link': {
      const id = env.nodeId ?? selected().find((n) => n.type === 'frame')?.id;
      const f = id ? st.nodes.find((n) => n.id === id) : undefined;
      if (!f) toast.info('Select a frame first');
      else void copyText(frameLink(window.location.href, f.id), `Link to “${String(f.data.label)}” copied`);
      return true;
    }
    case 'board-color': {
      const c = STICKY_COLORS.find((x) => x.id === arg);
      if (c) st.updateSelectionStyle({ fill: c.fill, stroke: c.stroke });
      return true;
    }
    case 'board-zoom-frame': {
      const id = env.nodeId ?? selected().find((n) => n.type === 'frame')?.id;
      const f = id ? st.nodes.find((n) => n.id === id) : undefined;
      if (f) void flowRef.current?.fitBounds(frameRect(f), { duration: 450, padding: 0.1 });
      return true;
    }
    case 'board-summon': bringEveryoneToMe(viewRect()); return true;
    case 'board-react': sendReaction(arg || '👍'); return true;
    case 'board-mm-child':
    case 'board-mm-sibling':
    case 'board-mm-collapse': {
      const id = env.nodeId ?? selected().find((n) => n.type === 'mindmap')?.id;
      if (!id) { toast.info('Select a mind map node first'); return true; }
      if (name === 'board-mm-child') mmAddChild(id);
      else if (name === 'board-mm-sibling') mmAddSibling(id);
      else mmToggleCollapse(id);
      return true;
    }
    case 'board-mm-layout': {
      if (!mmLayoutAll()) toast.info('No mind map on this canvas');
      return true;
    }
    case 'board-mm-export': {
      const id = env.nodeId ?? selected().find((n) => n.type === 'mindmap')?.id;
      if (!id) toast.info('Select a mind map node first');
      else void copyText(mmExport(id), 'Mind map outline copied (Markdown)');
      return true;
    }
    case 'board-mm-import': {
      void (async () => {
        let text = '';
        try { text = await navigator.clipboard.readText(); } catch { /* denied */ }
        const root = text.trim() ? mmImport(text, at) : null;
        if (root) toast.success('Mind map created from the outline on your clipboard');
        else toast.info('Copy a Markdown outline first (# Title, then - bullets, indented for sub-branches)');
      })();
      return true;
    }
    default: return false;
  }
}
