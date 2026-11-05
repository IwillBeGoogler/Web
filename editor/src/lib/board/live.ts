/** Live facilitation: present, bring everyone to me, emoji reactions. They need a live (Yjs) file to reach other people; alone they still work locally. */
import { useCollabStore } from '../../collab/store';
import type { Rect } from '../../collab/presenceMath';
import { useBoardStore } from '../../store/boardStore';
import { useDiagramStore } from '../../store/diagramStore';
import { toast } from '../../store/toastStore';
import { orderedFrames } from './frames';

const session = () => useCollabStore.getState().session;

/** start presenting at a frame (or the first one); false when there is no frame */
export function startPresentation(fromFrameId?: string): boolean {
  const frames = orderedFrames(useDiagramStore.getState().nodes);
  if (!frames.length) {
    toast.info('Add a frame first (press F), then present.');
    return false;
  }
  const at = fromFrameId ? Math.max(0, frames.findIndex((f) => f.id === fromFrameId)) : 0;
  useBoardStore.getState().set({ presenting: { index: at, laser: false, spotlight: false }, popover: null });
  return true;
}
export function stopPresentation(): void {
  useBoardStore.getState().set({ presenting: null });
  session()?.setPresence({ presenting: undefined, laser: undefined });
}

/** the people in the file who would be moved */
export const othersInFile = (): number => useCollabStore.getState().people.length;

/** "Bring everyone to me": everybody else's view jumps to my current view */
export function bringEveryoneToMe(view: Rect): 'sent' | 'alone' | 'local' {
  const s = session();
  if (!s) {
    toast.info('Bring everyone to me works in a shared file. Share this file first.');
    return 'local';
  }
  if (!othersInFile()) {
    toast.info('Nobody else is in this file right now.');
    return 'alone';
  }
  s.setPresence({ summon: { seq: Date.now(), rect: view } });
  toast.success('Everyone was brought to your view');
  return 'sent';
}

type Listener = (r: { emoji: string; at: { x: number; y: number } | null; mine: boolean }) => void;
const listeners = new Set<Listener>();
export const onReaction = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
/** the last place my cursor was on the canvas (flow coordinates) */
export const cursor: { at: { x: number; y: number } | null } = { at: null };

/** float an emoji on my screen and on everybody else's */
export function sendReaction(emoji: string): void {
  for (const l of listeners) l({ emoji, at: cursor.at, mine: true });
  session()?.setPresence({ reaction: { emoji, seq: Date.now(), at: cursor.at ?? { x: 0, y: 0 } } });
}
export function emitRemoteReaction(emoji: string, at: { x: number; y: number }): void {
  for (const l of listeners) l({ emoji, at, mine: false });
}
