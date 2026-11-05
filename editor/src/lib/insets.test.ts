import { describe, expect, it } from 'vitest';
import { clickInsets } from './clickAdd';
import { fitPadding, TOP_INSET, WSBAR_INSET } from './viewport';
import { useLayoutStore } from '../store/layoutStore';

describe('viewport insets', () => {
  it('without the workspace bar the top inset is the floating top bar only', () => {
    expect(clickInsets(true, true).top).toBe(TOP_INSET);
  });
  it('with the workspace bar (file tabs + page row) the top inset grows', () => {
    expect(clickInsets(true, true, true).top).toBe(TOP_INSET + WSBAR_INSET);
    expect(WSBAR_INSET).toBeGreaterThanOrEqual(70);
  });
  it('fit padding uses the same numbers as click-add', () => {
    expect(fitPadding(true, false, true)).toEqual({ top: `${TOP_INSET + WSBAR_INSET}px`, bottom: '96px', left: '324px', right: '32px' });
    expect(fitPadding(false, true, false).top).toBe(`${TOP_INSET}px`);
  });
  it('layout store tracks the workspace bar', () => {
    useLayoutStore.getState().setWsbar(true);
    expect(useLayoutStore.getState().wsbar).toBe(true);
    useLayoutStore.getState().reset();
    expect(useLayoutStore.getState().wsbar).toBe(false);
  });
});
