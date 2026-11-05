/** Presentation mode: which frame is shown, keyboard mapping, the view rect. Pure. */
import type { DiagramNode } from '../../types';
import { frameRect, orderedFrames, type FrameRect } from './frames';

export const presentationSteps = (nodes: DiagramNode[]): string[] => orderedFrames(nodes).map((f) => f.id);

export type StepDir = 'next' | 'prev' | 'first' | 'last';
export function stepPresentation(s: { index: number; count: number }, dir: StepDir): { index: number; count: number } {
  const last = Math.max(0, s.count - 1);
  const index = dir === 'next' ? s.index + 1 : dir === 'prev' ? s.index - 1 : dir === 'first' ? 0 : last;
  return { count: s.count, index: Math.max(0, Math.min(last, index)) };
}

export type PresentationAction = { type: 'step'; dir: StepDir } | { type: 'laser' } | { type: 'spotlight' } | { type: 'exit' };
export function presentationKey(key: string): PresentationAction | null {
  switch (key) {
    case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter': return { type: 'step', dir: 'next' };
    case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': return { type: 'step', dir: 'prev' };
    case 'Home': return { type: 'step', dir: 'first' };
    case 'End': return { type: 'step', dir: 'last' };
    case 'p': case 'P': return { type: 'laser' };
    case 's': case 'S': return { type: 'spotlight' };
    case 'Escape': return { type: 'exit' };
    default: return null;
  }
}

/** the flow-space rect to fit for a frame (the frame plus padding) */
export function presentationRect(frame: DiagramNode, pad = 48): FrameRect {
  const r = frameRect(frame);
  return { x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
}
