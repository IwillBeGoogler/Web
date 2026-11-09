import { act, fireEvent } from '@testing-library/react';

/**
 * Smoke-drives every control under `root`: each select option, text inputs (value, empty, number), checkboxes, buttons.
 * Used to cover inspector / toolbar forms whose handlers just forward to the store.
 */
export function exercise(root: ParentNode, opts: { skipButtons?: RegExp } = {}): void {
  const live = <T extends Element>(el: T) => el.isConnected;
  for (const sel of Array.from(root.querySelectorAll('select'))) {
    for (const o of Array.from(sel.options)) if (live(sel)) act(() => { fireEvent.change(sel, { target: { value: o.value } }); });
  }
  for (const inp of Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type="text"], input:not([type]), input[type="number"], textarea'))) {
    for (const v of ['zz1', '', '7']) {
      if (!live(inp) || inp.readOnly || inp.disabled) continue;
      act(() => { fireEvent.change(inp, { target: { value: v } }); fireEvent.blur(inp); });
    }
  }
  for (const cb of Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]'))) if (live(cb) && !cb.disabled) act(() => { fireEvent.click(cb); });
  for (const b of Array.from(root.querySelectorAll<HTMLButtonElement>('button'))) {
    if (!live(b) || b.disabled) continue;
    if (opts.skipButtons?.test(b.getAttribute('aria-label') ?? b.textContent ?? '')) continue;
    act(() => { fireEvent.click(b); });
  }
}
