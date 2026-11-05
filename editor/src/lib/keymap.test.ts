import { describe, expect, it } from 'vitest';
import { keyToCommand, isTypingTarget, type KeyLike } from './keymap';

const k = (key: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key, code: '', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods });

describe('keyToCommand', () => {
  it('tool shortcuts V H R O D T N A P C (no modifiers)', () => {
    const m: Record<string, string> = { v: 'select', h: 'hand', r: 'rect', o: 'ellipse', d: 'diamond', t: 'text', n: 'sticky', a: 'arrow', p: 'pen', c: 'comment' };
    for (const [key, tool] of Object.entries(m)) expect(keyToCommand(k(key))).toEqual({ type: 'tool', tool });
    expect(keyToCommand(k('V'))).toEqual({ type: 'tool', tool: 'select' });
  });
  it('clipboard / select-all / duplicate with Cmd or Ctrl', () => {
    for (const mod of [{ metaKey: true }, { ctrlKey: true }]) {
      expect(keyToCommand(k('c', mod))).toEqual({ type: 'action', action: 'copy' });
      expect(keyToCommand(k('x', mod))).toEqual({ type: 'action', action: 'cut' });
      expect(keyToCommand(k('v', mod))).toEqual({ type: 'action', action: 'paste' });
      expect(keyToCommand(k('d', mod))).toEqual({ type: 'action', action: 'duplicate' });
      expect(keyToCommand(k('a', mod))).toEqual({ type: 'action', action: 'select-all' });
    }
  });
  it('Cmd+D is duplicate, not the diamond tool; Cmd+A is not the arrow tool', () => {
    expect(keyToCommand(k('d', { metaKey: true }))).not.toEqual({ type: 'tool', tool: 'diamond' });
    expect(keyToCommand(k('a', { metaKey: true }))).not.toEqual({ type: 'tool', tool: 'arrow' });
  });
  it('undo / redo', () => {
    expect(keyToCommand(k('z', { metaKey: true }))).toEqual({ type: 'undo' });
    expect(keyToCommand(k('z', { metaKey: true, shiftKey: true }))).toEqual({ type: 'redo' });
    expect(keyToCommand(k('y', { ctrlKey: true }))).toEqual({ type: 'redo' });
  });
  it('delete / backspace / F2 / escape', () => {
    expect(keyToCommand(k('Delete'))).toEqual({ type: 'action', action: 'delete' });
    expect(keyToCommand(k('Backspace'))).toEqual({ type: 'action', action: 'delete' });
    expect(keyToCommand(k('F2'))).toEqual({ type: 'action', action: 'edit-label' });
    expect(keyToCommand(k('Escape'))).toEqual({ type: 'escape' });
  });
  it('arrow keys nudge by 1, Shift by 10', () => {
    expect(keyToCommand(k('ArrowLeft'))).toEqual({ type: 'nudge', dx: -1, dy: 0 });
    expect(keyToCommand(k('ArrowRight', { shiftKey: true }))).toEqual({ type: 'nudge', dx: 10, dy: 0 });
    expect(keyToCommand(k('ArrowUp'))).toEqual({ type: 'nudge', dx: 0, dy: -1 });
    expect(keyToCommand(k('ArrowDown', { shiftKey: true }))).toEqual({ type: 'nudge', dx: 0, dy: 10 });
  });
  it('design tools: Shift+D dev mode, Shift+R rulers; plain D stays the diamond tool', () => {
    expect(keyToCommand(k('D', { shiftKey: true }))).toEqual({ type: 'action', action: 'dev-toggle' });
    expect(keyToCommand(k('R', { shiftKey: true }))).toEqual({ type: 'action', action: 'rulers-toggle' });
    expect(keyToCommand(k('d'))).toEqual({ type: 'tool', tool: 'diamond' });
  });
  it('group / ungroup / lock / z-order / style copy / fit', () => {
    expect(keyToCommand(k('g', { metaKey: true }))).toEqual({ type: 'action', action: 'group' });
    expect(keyToCommand(k('g', { metaKey: true, shiftKey: true }))).toEqual({ type: 'action', action: 'ungroup-selection' });
    expect(keyToCommand(k('l', { metaKey: true, shiftKey: true }))).toEqual({ type: 'action', action: 'toggle-lock' });
    expect(keyToCommand(k(']', { metaKey: true }))).toEqual({ type: 'action', action: 'bring-forward' });
    expect(keyToCommand(k('[', { metaKey: true }))).toEqual({ type: 'action', action: 'send-backward' });
    expect(keyToCommand(k(']', { metaKey: true, shiftKey: true }))).toEqual({ type: 'action', action: 'bring-front' });
    expect(keyToCommand(k('[', { metaKey: true, shiftKey: true }))).toEqual({ type: 'action', action: 'send-back' });
    expect(keyToCommand(k('c', { metaKey: true, altKey: true }))).toEqual({ type: 'action', action: 'copy-style' });
    expect(keyToCommand(k('v', { metaKey: true, altKey: true }))).toEqual({ type: 'action', action: 'paste-style' });
    expect(keyToCommand(k('!', { shiftKey: true, code: 'Digit1' }))).toEqual({ type: 'action', action: 'zoom-fit' });
  });
  it('Alt+Cmd+G wraps the selection in a cluster (also with macOS option characters)', () => {
    expect(keyToCommand(k('g', { metaKey: true, altKey: true }))).toEqual({ type: 'action', action: 'wrap-cluster' });
    expect(keyToCommand(k('©', { metaKey: true, altKey: true, code: 'KeyG' }))).toEqual({ type: 'action', action: 'wrap-cluster' });
    expect(keyToCommand(k('ç', { metaKey: true, altKey: true, code: 'KeyC' }))).toEqual({ type: 'action', action: 'copy-style' });
  });
  it('zoom keys', () => {
    expect(keyToCommand(k('=', { metaKey: true }))).toEqual({ type: 'zoom', dir: 'in' });
    expect(keyToCommand(k('-', { metaKey: true }))).toEqual({ type: 'zoom', dir: 'out' });
    expect(keyToCommand(k('0', { metaKey: true }))).toEqual({ type: 'zoom', dir: 'reset' });
  });
  it('panel toggles: Cmd+\\ sidebar, Cmd+. inspector', () => {
    expect(keyToCommand(k('\\', { metaKey: true }))).toEqual({ type: 'panel', panel: 'sidebar' });
    expect(keyToCommand(k('.', { ctrlKey: true }))).toEqual({ type: 'panel', panel: 'inspector' });
    expect(keyToCommand(k('.'))).toBeNull();
  });
  it('file shortcuts: Cmd+S save, Shift+Cmd+S save as, Cmd+O open (Cmd+O is not the ellipse tool)', () => {
    expect(keyToCommand(k('s', { metaKey: true }))).toEqual({ type: 'file', op: 'save' });
    expect(keyToCommand(k('s', { ctrlKey: true, shiftKey: true }))).toEqual({ type: 'file', op: 'save-as' });
    expect(keyToCommand(k('o', { metaKey: true }))).toEqual({ type: 'file', op: 'open' });
    expect(keyToCommand(k('o'))).toEqual({ type: 'tool', tool: 'ellipse' });
  });
  it('unknown keys and plain modifiers return null', () => {
    expect(keyToCommand(k('q'))).toBeNull();
    expect(keyToCommand(k('Shift', { shiftKey: true }))).toBeNull();
    expect(keyToCommand(k('r', { metaKey: true }))).toBeNull(); // leave browser reload alone
  });
});

describe('isTypingTarget', () => {
  it('detects inputs, textareas, selects, contenteditable', () => {
    const el = (tag: string) => document.createElement(tag);
    expect(isTypingTarget(el('input'))).toBe(true);
    expect(isTypingTarget(el('textarea'))).toBe(true);
    expect(isTypingTarget(el('select'))).toBe(true);
    expect(isTypingTarget(el('div'))).toBe(false);
    const d = el('div');
    d.contentEditable = 'true';
    Object.defineProperty(d, 'isContentEditable', { value: true });
    expect(isTypingTarget(d)).toBe(true);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('data flow shortcut', () => {
  it('Shift+F toggles data flow; plain F and Cmd+Shift+F do not', () => {
    const k = (over: Record<string, unknown>) => keyToCommand({ key: 'F', code: 'KeyF', metaKey: false, ctrlKey: false, altKey: false, shiftKey: true, ...over } as never);
    expect(k({})).toEqual({ type: 'action', action: 'toggle-flow' });
    expect(k({ shiftKey: false, key: 'f' })).not.toEqual({ type: 'action', action: 'toggle-flow' });
    expect(k({ metaKey: true })).not.toEqual({ type: 'action', action: 'toggle-flow' });
  });
});

describe('Board shortcuts', () => {
  const k = (key: string, extra: Partial<KeyLike> = {}): KeyLike => ({ key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...extra });
  it('S and N are the sticky tool, F frame, W mind map, E eraser, L highlighter, P pen', () => {
    expect(keyToCommand(k('s'))).toEqual({ type: 'tool', tool: 'sticky' });
    expect(keyToCommand(k('n'))).toEqual({ type: 'tool', tool: 'sticky' });
    expect(keyToCommand(k('f'))).toEqual({ type: 'tool', tool: 'frame' });
    expect(keyToCommand(k('w'))).toEqual({ type: 'tool', tool: 'mindmap' });
    expect(keyToCommand(k('e'))).toEqual({ type: 'tool', tool: 'eraser' });
    expect(keyToCommand(k('l'))).toEqual({ type: 'tool', tool: 'highlighter' });
    expect(keyToCommand(k('p'))).toEqual({ type: 'tool', tool: 'pen' });
  });
  it('? opens the cheatsheet; Shift+F still toggles data flow; mod+S still saves', () => {
    expect(keyToCommand(k('?', { shiftKey: true, code: 'Slash' }))).toEqual({ type: 'action', action: 'show-help' });
    expect(keyToCommand(k('F', { shiftKey: true }))).toEqual({ type: 'action', action: 'toggle-flow' });
    expect(keyToCommand(k('s', { metaKey: true }))).toEqual({ type: 'file', op: 'save' });
  });
});

describe('Phase 6 shortcuts', () => {
  it('⇧⌘E toggles the text view', () => {
    expect(keyToCommand({ key: 'E', code: 'KeyE', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false })).toEqual({ type: 'action', action: 'toggle-code' });
  });
});

describe('accessibility shortcuts', () => {
  const k = (key: string, extra: Partial<KeyboardEvent> = {}) => ({ key, code: `Key${key.toUpperCase()}`, metaKey: false, ctrlKey: false, shiftKey: true, altKey: false, ...extra });
  it('Shift+O toggles the outline, Shift+C starts keyboard connect', () => {
    expect(keyToCommand(k('O'))).toEqual({ type: 'action', action: 'outline-toggle' });
    expect(keyToCommand(k('C'))).toEqual({ type: 'action', action: 'connect-start' });
  });
});
