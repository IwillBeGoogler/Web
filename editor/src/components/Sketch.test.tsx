import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { useSettingsStore } from '../store/settingsStore';
import { createStoredProject } from '../lib/projects';
import { SKETCH_FILTER_ID } from '../lib/sketch';

const canvas = () => document.querySelector<HTMLElement>('.canvas');

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  useSettingsStore.getState().resetGlobal();
});

describe('sketch look', () => {
  it('is off by default: no class, no filter', () => {
    const p = createStoredProject(localStorage, 'Plain');
    render(<App initialProjectId={p.id} />);
    expect(canvas()!.classList.contains('canvas-sketch')).toBe(false);
    expect(document.getElementById(SKETCH_FILTER_ID)).toBeNull();
  });
  it('global setting adds the canvas class and the inline filter; a project override turns it off again', async () => {
    useSettingsStore.getState().patch({ canvas: { sketch: true } });
    const p = createStoredProject(localStorage, 'Sketchy');
    render(<App initialProjectId={p.id} />);
    expect(canvas()!.classList.contains('canvas-sketch')).toBe(true);
    const f = document.getElementById(SKETCH_FILTER_ID)!;
    expect(f.querySelector('feTurbulence')?.getAttribute('seed')).toBe('7');
    expect(f.querySelector('feDisplacementMap')).toBeTruthy();
    await act(async () => useDiagramStore.getState().setProjectSettings({ canvas: { sketch: false } }));
    expect(canvas()!.classList.contains('canvas-sketch')).toBe(false);
    expect(document.getElementById(SKETCH_FILTER_ID)).toBeNull();
  });
  it('the project-level setting alone turns it on', async () => {
    const p = createStoredProject(localStorage, 'Proj');
    render(<App initialProjectId={p.id} />);
    await act(async () => useDiagramStore.getState().setProjectSettings({ canvas: { sketch: true } }));
    expect(canvas()!.classList.contains('canvas-sketch')).toBe(true);
  });
});
