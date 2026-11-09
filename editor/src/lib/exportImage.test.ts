import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toPng = vi.fn();
const toSvg = vi.fn();
vi.mock('html-to-image', () => ({ toPng: (...a: unknown[]) => toPng(...a), toSvg: (...a: unknown[]) => toSvg(...a) }));
vi.mock('./sketch', () => ({ sketchDefsElement: () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'), sketchFontEmbedCss: vi.fn().mockResolvedValue('@font-face{sketch}') }));
const downloadDataUrl = vi.fn();
vi.mock('./export', async (orig) => ({ ...(await orig<typeof import('./export')>()), downloadDataUrl: (...a: unknown[]) => downloadDataUrl(...a) }));

import { exportPage } from './exportImage';
import { flowRegistry } from './flow/registry';
import type { DiagramNode } from '../types';

const node = (id: string, hidden = false): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, width: 100, height: 50, hidden, data: { label: id, iconId: 'service' } });
const opts = { transparent: false, scale: 2 as const, padding: 10 };

function viewport(sketch = false) {
  document.body.innerHTML = `<div class="${sketch ? 'canvas-sketch' : ''}"><div class="react-flow__viewport"><span class="node-label">Hello big world</span><span class="node-label">x<b>y</b></span><span class="edge-label" style="color:red">Two words</span></div></div>`;
  return document.querySelector<HTMLElement>('.react-flow__viewport')!;
}

beforeEach(() => {
  (Range.prototype as unknown as { getClientRects: () => unknown }).getClientRects = function (this: Range) { return this.startOffset < 6 ? [{ top: 0 }] : this.startOffset === 20 ? [] : [{ top: 20 }]; };
  toPng.mockReset().mockResolvedValue('data:png');
  toSvg.mockReset().mockResolvedValue('data:svg');
  downloadDataUrl.mockReset();
  flowRegistry.paths = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string) => (String(u).endsWith('.woff2') ? { blob: async () => new Blob(['x']) } : { text: async () => 'a{src:url(https://fonts.gstatic.com/a.woff2)}' })));
});
afterEach(() => { vi.unstubAllGlobals(); document.head.innerHTML = ''; });

describe('exportPage', () => {
  it('throws without a viewport or nodes', async () => {
    document.body.innerHTML = '';
    await expect(exportPage('png', [node('a')], opts, '#fff', 't')).rejects.toThrow('Nothing to export');
    viewport();
    await expect(exportPage('png', [], opts, '#fff', 't')).rejects.toThrow('Nothing to export');
  });
  it('exports png, cleans up classes and downloads', async () => {
    const el = viewport();
    await exportPage('png', [node('a'), node('b', true)], opts, '#ffffff', 'My Diagram');
    expect(toPng).toHaveBeenCalledTimes(1);
    expect(el.classList.contains('export-capture')).toBe(false);
    expect(downloadDataUrl).toHaveBeenCalledWith('data:png', expect.stringMatching(/\.png$/));
    expect(el.querySelector('.node-label')!.textContent).toBe('Hello big world');
  });
  it('svg on a dark canvas keeps its colour, inlines google fonts, flow overlay and sketch defs, black export', async () => {
    document.head.innerHTML = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X">';
    const el = viewport(true);
    flowRegistry.paths = [{ id: 'p', edgeIds: ['e'], from: 'a', to: 'b', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: '#f00', look: 'dots', m: { total: 100, cum: [0, 100] } } as never];
    let seen: HTMLElement | null = null;
    toSvg.mockImplementation(async (e: HTMLElement, o: Record<string, unknown>) => {
      seen = e;
      expect(e.classList.contains('export-capture')).toBe(true);
      expect(String(o.fontEmbedCSS)).toContain('sketch');
      expect(o.backgroundColor).toBe('#101010');
      return 'data:svg';
    });
    await exportPage('svg', [node('a')], opts, '#101010', 't');
    expect(seen).toBe(el);
    expect(el.querySelector('.flow-export')).toBeNull();
    toSvg.mockImplementation(async (e: HTMLElement) => { expect(e.classList.contains('export-dark')).toBe(true); return 'data:svg'; });
    await exportPage('svg', [node('a')], { ...opts, background: 'black' }, '#ffffff', 't');
    toSvg.mockImplementation(async (e: HTMLElement, o: Record<string, unknown>) => { expect(e.classList.contains('export-dark')).toBe(false); expect(o.backgroundColor).toBeUndefined(); return 'data:svg'; });
    await exportPage('svg', [node('a')], { ...opts, transparent: true }, '#101010', 't');
  });
  it('cleans up even when the capture fails; font fetch failure is tolerated', async () => {
    document.head.innerHTML = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Y">';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const el = viewport();
    toPng.mockRejectedValue(new Error('boom'));
    await expect(exportPage('png', [node('a')], opts, '#fff', 't')).rejects.toThrow('boom');
    expect(el.classList.contains('export-capture')).toBe(false);
    expect(downloadDataUrl).not.toHaveBeenCalled();
  });
});
