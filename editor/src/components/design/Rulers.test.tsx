import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLayoutStore } from '../../store/layoutStore';
import { RULER, Rulers, rulersTop, TOPBAR_BOTTOM } from './PrecisionLayer';
import { WSBAR_INSET } from '../../lib/viewport';

beforeEach(() => useLayoutStore.getState().reset());

describe('rulers sit below the top bar', () => {
  it('the top bar is a 48px bar floating 12px from the top: rulers start under it', () => {
    expect(TOPBAR_BOTTOM).toBe(12 + 48);
    expect(rulersTop(false)).toBe(60);
    expect(rulersTop(true)).toBe(60 + WSBAR_INSET);
  });
  it('the top ruler, the corner and the left ruler are all placed under it, never overlapping the bar', () => {
    render(<ReactFlowProvider><Rulers /></ReactFlowProvider>);
    const top = document.querySelector('.ruler-top') as HTMLElement;
    const left = document.querySelector('.ruler-left') as HTMLElement;
    const corner = document.querySelector('.ruler-corner') as HTMLElement;
    expect(parseFloat(top.style.top)).toBeGreaterThanOrEqual(TOPBAR_BOTTOM);
    expect(parseFloat(corner.style.top)).toBeGreaterThanOrEqual(TOPBAR_BOTTOM);
    expect(parseFloat(left.style.top)).toBe(parseFloat(top.style.top) + RULER);
    expect(screen.getByTestId('rulers')).toBeInTheDocument();
  });
  it('moves further down while the file tabs row is shown', () => {
    useLayoutStore.getState().setWsbar(true);
    render(<ReactFlowProvider><Rulers /></ReactFlowProvider>);
    expect((document.querySelector('.ruler-top') as HTMLElement).style.top).toBe(`${60 + WSBAR_INSET}px`);
  });
});
