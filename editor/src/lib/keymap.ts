import { toolForKey, type Tool } from './shapes';

export interface KeyLike {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}
export type Command =
  | { type: 'tool'; tool: Tool }
  | { type: 'action'; action: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'escape' }
  | { type: 'nudge'; dx: number; dy: number }
  | { type: 'zoom'; dir: 'in' | 'out' | 'reset' }
  | { type: 'panel'; panel: 'sidebar' | 'inspector' }
  | { type: 'file'; op: 'open' | 'save' | 'save-as' };

const MOD_ACTIONS: Record<string, string> = { c: 'copy', x: 'cut', v: 'paste', d: 'duplicate', a: 'select-all', g: 'group' };

export function keyToCommand(e: KeyLike): Command | null {
  const mod = e.metaKey || e.ctrlKey;
  // macOS Option+letter produces another character in `key` (Option+C -> c-cedilla): use the physical key for Alt combos
  const key = e.altKey && /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (key === 'Escape') return { type: 'escape' };
  if (key === 'F2') return { type: 'action', action: 'edit-label' };
  if (key === 'Delete' || key === 'Backspace') return { type: 'action', action: 'delete' };

  if (key.startsWith('Arrow')) {
    const step = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[key];
    return d ? { type: 'nudge', dx: d[0], dy: d[1] } : null;
  }

  if (mod) {
    if (key === 'z') return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
    if (key === 'y') return { type: 'redo' };
    if (e.altKey && key === 'g') return { type: 'action', action: 'wrap-cluster' };
    if (e.altKey && key === 'c') return { type: 'action', action: 'copy-style' };
    if (e.altKey && key === 'v') return { type: 'action', action: 'paste-style' };
    if (key === 'e' && e.shiftKey && !e.altKey) return { type: 'action', action: 'toggle-code' };
    if (key === 'g' && e.shiftKey) return { type: 'action', action: 'ungroup-selection' };
    if (key === 'l' && e.shiftKey) return { type: 'action', action: 'toggle-lock' };
    if (key === ']') return { type: 'action', action: e.shiftKey ? 'bring-front' : 'bring-forward' };
    if (key === '[') return { type: 'action', action: e.shiftKey ? 'send-back' : 'send-backward' };
    if (key === 's') return { type: 'file', op: e.shiftKey ? 'save-as' : 'save' };
    if (key === 'o') return { type: 'file', op: 'open' };
    if (key === '\\') return { type: 'panel', panel: 'sidebar' };
    if (key === '.') return { type: 'panel', panel: 'inspector' };
    if (key === '=' || key === '+') return { type: 'zoom', dir: 'in' };
    if (key === '-') return { type: 'zoom', dir: 'out' };
    if (key === '0') return { type: 'zoom', dir: 'reset' };
    const a = MOD_ACTIONS[key];
    return a ? { type: 'action', action: a } : null;
  }

  if (key === '?' || (e.shiftKey && e.code === 'Slash')) return { type: 'action', action: 'show-help' };
  if (e.shiftKey && (e.code === 'Digit1' || key === '!')) return { type: 'action', action: 'zoom-fit' };
  if (e.shiftKey && !e.altKey && key === 'f') return { type: 'action', action: 'toggle-flow' };
  if (e.shiftKey && !e.altKey && key === 'd') return { type: 'action', action: 'dev-toggle' };
  if (e.shiftKey && !e.altKey && key === 'r') return { type: 'action', action: 'rulers-toggle' };
  if (e.shiftKey && !e.altKey && key === 'o') return { type: 'action', action: 'outline-toggle' };
  if (e.shiftKey && !e.altKey && key === 'l') return { type: 'action', action: 'auto-arrange' };
  if (e.shiftKey && !e.altKey && key === 'c') return { type: 'action', action: 'connect-start' };
  if (e.altKey || e.shiftKey) return null;
  const tool = toolForKey(key);
  return tool ? { type: 'tool', tool } : null;
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || !!el.isContentEditable;
}
