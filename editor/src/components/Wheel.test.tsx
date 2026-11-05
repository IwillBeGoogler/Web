import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { createStoredProject } from '../lib/projects';

function viewport() {
  const t = document.querySelector<HTMLElement>('.react-flow__viewport')!.style.transform;
  const m = t.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\((-?[\d.]+)\)/)!;
  return { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) };
}
const pane = () => document.querySelector<HTMLElement>('.react-flow__pane')!;

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  const p = createStoredProject(localStorage, 'Wheel');
  render(<App initialProjectId={p.id} />);
});

describe('canvas wheel / trackpad', () => {
  it('a plain wheel scroll PANS the canvas (x/y change, zoom does not)', async () => {
    const before = viewport();
    await act(async () => {
      fireEvent.wheel(pane(), { deltaX: 0, deltaY: 120 });
    });
    const after = viewport();
    expect(after.zoom).toBeCloseTo(before.zoom, 5);
    expect(after.y).not.toBeCloseTo(before.y, 3);
  });
  it('horizontal scroll pans along x', async () => {
    const before = viewport();
    await act(async () => {
      fireEvent.wheel(pane(), { deltaX: 80, deltaY: 0 });
    });
    expect(viewport().x).not.toBeCloseTo(before.x, 3);
  });
  it('Cmd/Ctrl + wheel (and trackpad pinch = ctrl+wheel) ZOOMS', async () => {
    const before = viewport();
    await act(async () => {
      fireEvent.wheel(pane(), { deltaY: -200, ctrlKey: true });
    });
    expect(viewport().zoom).toBeGreaterThan(before.zoom);
  });
});
