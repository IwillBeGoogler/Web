import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Link2, Lock, Play, Plus } from 'lucide-react';
import { useBoardStore, QUICK_EMOJI } from '../../store/boardStore';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { STICKY_COLORS } from '../../lib/board/sticky';
import { hasPrivate, reorderFrame, revealAll } from '../../lib/board/actions';
import { frameLink, orderedFrames } from '../../lib/board/frames';
import { sendReaction, startPresentation } from '../../lib/board/live';
import { SHORTCUT_GROUPS } from '../../lib/board/shortcuts';
import { useZoomToFrame } from '../../hooks/useZoomToFrame';
import { toast } from '../../store/toastStore';
import '../../styles/board.css';
import { t as tr } from '../../i18n';

/** Esc or a click outside closes a popover */
function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void, ignore?: string) {
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (ref.current?.contains(t) || (ignore && t?.closest?.(ignore))) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key, true);
    };
  }, [ref, onClose, ignore]);
}

function Pop({ label, onClose, children, className = '' }: { label: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose, '.dock');
  return (
    <div ref={ref} className={`board-pop glass ${className}`} role="dialog" aria-label={tr(label)}>
      {children}
    </div>
  );
}

const INK = ['auto', '#d1344a', '#e8710a', '#d6a000', '#0f9d8f', '#2f6fdb', '#8e4ec6', '#d6409f'];
const HL = ['#ffd400', '#ff8fb1', '#8ce99a', '#74c0fc', '#ffa94d', '#b197fc'];

/** The options of the active tool, right above the dock. Nothing shows for tools that have none. */
export function BoardOptions() {
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);
  const b = useBoardStore();
  const priv = useDiagramStore((s) => s.nodes.some((n) => n.type === 'sticky' && n.data.private));
  void priv;
  if (tool === 'sticky')
    return (
      <div className="board-opts glass" role="group" aria-label={tr('Sticky options')}>
        <div className="sticky-swatches">
          {STICKY_COLORS.map((c) => (
            <button key={c.id} type="button" className={`sticky-swatch${b.stickyColor === c.id ? ' on' : ''}`} style={{ background: c.fill, borderColor: c.stroke }} aria-label={tr(c.name)} aria-pressed={b.stickyColor === c.id} title={tr(c.name)} onClick={() => b.set({ stickyColor: c.id })} />
          ))}
        </div>
        <span className="dock-sep" aria-hidden />
        <button type="button" className={`chip${b.showAuthor ? ' on' : ''}`} aria-pressed={b.showAuthor} onClick={() => b.set({ showAuthor: !b.showAuthor })} title={tr('Tag new stickies with your name')}>{tr('Name')}</button>
        <button type="button" className={`chip${b.privateMode ? ' on' : ''}`} aria-pressed={b.privateMode} onClick={() => b.set({ privateMode: !b.privateMode })} title={tr('New stickies are hidden from others until revealed')}><Lock size={11} aria-hidden /> {tr('Private')}</button>
        {hasPrivate() && <button type="button" className="chip" onClick={() => toast.success(tr('Revealed {n} stickies', { n: revealAll() }))}>{tr('Reveal all')}</button>}
      </div>
    );
  if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
    const hl = tool === 'highlighter';
    return (
      <div className="board-opts glass" role="group" aria-label={tr('Drawing options')}>
        <div className="seg" role="group" aria-label={tr('Brush')}>
          {([['pen', 'Pen'], ['highlighter', 'Highlighter'], ['eraser', 'Eraser']] as const).map(([t, l]) => (
            <button key={t} type="button" className={tool === t ? 'active' : ''} aria-pressed={tool === t} onClick={() => setTool(t)}>{tr(l)}</button>
          ))}
        </div>
        {tool !== 'eraser' && (
          <>
            <span className="dock-sep" aria-hidden />
            <div className="ink-swatches" role="group" aria-label={tr('Colour')}>
              {(hl ? HL : INK).map((c) => {
                const cur = hl ? b.hlColor : b.penColor;
                return <button key={c} type="button" className={`ink-swatch${cur === c ? ' on' : ''}${c === 'auto' ? ' auto' : ''}`} style={c === 'auto' ? undefined : { background: c }} title={c === 'auto' ? tr('Matches the canvas') : undefined} aria-label={c === 'auto' ? tr('Colour: automatic') : tr('Colour {c}', { c })} aria-pressed={cur === c} onClick={() => b.set(hl ? { hlColor: c } : { penColor: c })} />;
              })}
            </div>
          </>
        )}
        <span className="dock-sep" aria-hidden />
        <input type="range" className="size-range" aria-label={tr('Size')} min={hl ? 10 : tool === 'eraser' ? 6 : 1} max={hl ? 40 : tool === 'eraser' ? 40 : 16} value={hl ? b.hlSize : tool === 'eraser' ? b.eraserSize : b.penSize} onChange={(e) => b.set(hl ? { hlSize: +e.target.value } : tool === 'eraser' ? { eraserSize: +e.target.value } : { penSize: +e.target.value })} />
        {tool === 'pen' && (
          <button type="button" className={`chip${b.recognize ? ' on' : ''}`} aria-pressed={b.recognize} title={tr('Turn rough circles, rectangles, triangles and arrows into clean shapes')} onClick={() => b.set({ recognize: !b.recognize })}>{tr('Shapes')}</button>
        )}
      </div>
    );
  }
  if (tool === 'stamp')
    return (
      <div className="board-opts glass" role="group" aria-label={tr('Stamp options')}>
        {QUICK_EMOJI.map((e) => (
          <button key={e} type="button" className={`emoji-btn${b.stampEmoji === e ? ' on' : ''}`} aria-pressed={b.stampEmoji === e} aria-label={tr('Stamp {e}', { e })} onClick={() => b.set({ stampEmoji: e })}>{e}</button>
        ))}
      </div>
    );
  return null;
}

/** Quick reactions (float on everybody's screen) and stamps (stay on the canvas) */
export function EmojiPopover() {
  const set = useBoardStore((s) => s.set);
  const setTool = useUiStore((s) => s.setTool);
  const close = () => set({ popover: null });
  return (
    <Pop label="Reactions and stamps" onClose={close} className="emoji-pop">
      <div className="pop-title">{tr('React')} <small>{tr('floats and fades')}</small></div>
      <div className="emoji-row">
        {QUICK_EMOJI.map((e) => <button key={e} type="button" className="emoji-btn" aria-label={tr('React {e}', { e })} onClick={() => sendReaction(e)}>{e}</button>)}
      </div>
      <div className="pop-title">{tr('Stamp')} <small>{tr('stays on the board')}</small></div>
      <div className="emoji-row">
        {QUICK_EMOJI.map((e) => <button key={e} type="button" className="emoji-btn" aria-label={tr('Stamp {e}', { e })} onClick={() => { set({ stampEmoji: e, popover: null }); setTool('stamp'); }}>{e}</button>)}
      </div>
    </Pop>
  );
}

/** Frames in presentation order: click to zoom, drag to reorder, copy a link, present. Closed by default. */
export function FramesPopover() {
  const nodes = useDiagramStore((s) => s.nodes);
  const set = useBoardStore((s) => s.set);
  const { zoomToFrame } = useZoomToFrame();
  const frames = orderedFrames(nodes);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const close = () => set({ popover: null });
  const copy = async (id: string, name: string) => {
    try {
      await navigator.clipboard.writeText(frameLink(window.location.href, id));
      toast.success(tr('Link to “{name}” copied', { name }));
    } catch {
      toast.error(tr('Could not copy the link'));
    }
  };
  return (
    <Pop label="Frames" onClose={close} className="frames-pop">
      <div className="pop-head">
        <span className="pop-title">{tr('Frames')}</span>
        <span className="grow" />
        <button type="button" className="chip" aria-label={tr('New frame')} onClick={() => { useUiStore.getState().setTool('frame'); close(); }}><Plus size={12} aria-hidden /> {tr('New')}</button>
        <button type="button" className="chip on" disabled={!frames.length} onClick={() => { close(); startPresentation(); }}><Play size={11} aria-hidden /> {tr('Present')}</button>
      </div>
      {!frames.length ? (
        <p className="pop-empty">{tr('No frames yet. Press')} <kbd>F</kbd> {tr('and drag on the canvas.')}</p>
      ) : (
        <ol className="frame-list">
          {frames.map((f, i) => (
            <li
              key={f.id}
              className={`frame-row${dragging === f.id ? ' dragging' : ''}${over === i ? ' over' : ''}`}
              draggable
              onDragStart={(e) => { setDragging(f.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', f.id); }}
              onDragOver={(e) => { e.preventDefault(); setOver(i); }}
              onDragEnd={() => { setDragging(null); setOver(null); }}
              onDrop={(e) => { e.preventDefault(); if (dragging) reorderFrame(dragging, i); setDragging(null); setOver(null); }}
            >
              <GripVertical size={13} className="grip" aria-hidden />
              <span className="frame-n">{i + 1}</span>
              <button type="button" className="frame-name" onClick={() => { zoomToFrame(f.id); useDiagramStore.getState().selectOnly('node', f.id); }} title={tr('Zoom to this frame')}>{String(f.data.label) || tr('Frame')}</button>
              <button type="button" className="icon-btn" aria-label={tr('Move {name} up', { name: String(f.data.label) })} disabled={i === 0} onClick={() => reorderFrame(f.id, i - 1)}><ArrowUp size={12} /></button>
              <button type="button" className="icon-btn" aria-label={tr('Move {name} down', { name: String(f.data.label) })} disabled={i === frames.length - 1} onClick={() => reorderFrame(f.id, i + 1)}><ArrowDown size={12} /></button>
              <button type="button" className="icon-btn" aria-label={tr('Copy link to {name}', { name: String(f.data.label) })} title={tr('Copy link to this frame')} onClick={() => void copy(f.id, String(f.data.label))}><Link2 size={13} /></button>
              <button type="button" className="icon-btn" aria-label={tr('Present from {name}', { name: String(f.data.label) })} title={tr('Present from here')} onClick={() => { close(); startPresentation(f.id); }}><Play size={12} /></button>
            </li>
          ))}
        </ol>
      )}
    </Pop>
  );
}

/** `?`: every shortcut on one card */
export function Cheatsheet() {
  const set = useBoardStore((s) => s.set);
  return (
    <Pop label="Keyboard shortcuts" onClose={() => set({ popover: null })} className="cheatsheet">
      <div className="pop-title">{tr('Keyboard shortcuts')}</div>
      <div className="cheat-grid">
        {SHORTCUT_GROUPS.map((g) => (
          <section key={g.title}>
            <h4>{tr(g.title)}</h4>
            <dl>
              {g.items.map(([keys, what]) => (
                <div key={what}><dt>{keys.split(' ').map((k, i) => <kbd key={i}>{k}</kbd>)}</dt><dd>{tr(what)}</dd></div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Pop>
  );
}


/** everything Board that floats above the dock; renders nothing unless a tool option or a popover is open */
export function BoardLayer() {
  const popover = useBoardStore((s) => s.popover);
  return (
    <>
      <BoardOptions />
      {popover === 'emoji' && <EmojiPopover />}
      {popover === 'frames' && <FramesPopover />}
      {popover === 'help' && <Cheatsheet />}
    </>
  );
}
