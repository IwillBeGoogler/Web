import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const created = vi.hoisted(() => ({ renderers: 0, renders: 0, disposed: 0, lost: 0 }));
vi.mock('three', async (orig) => {
  const actual = await orig<typeof import('three')>();
  class FakeRenderer {
    constructor() { created.renderers++; }
    setPixelRatio() {}
    setSize() {}
    setClearColor() {}
    render() { created.renders++; }
    dispose() { created.disposed++; }
    forceContextLoss() { created.lost++; }
  }
  return { ...actual, WebGLRenderer: FakeRenderer };
});

import { createLandingScene } from './threeScene';

const opts = (over: Partial<Parameters<typeof createLandingScene>[0]> = {}) => ({
  canvas: document.createElement('canvas'), width: 1440, height: 900, mobile: false, dark: true, accent: '#5b5bf7', logos: false,
  ...over,
});

describe('one WebGL context for background + hero', () => {
  it('createLandingScene builds a single renderer for the hero; dispose releases it', async () => {
    created.renderers = 0; created.renders = 0; created.disposed = 0; created.lost = 0;
    const s = await createLandingScene(opts());
    expect(created.renderers).toBe(1);
    expect(s.stats.renderers).toBe(1);
    expect(s.stats.nodes).toBe(10); // the tiered architecture
    expect(s.stats.edges).toBe(9); // real flows only
    expect(s.stats.packets).toBeLessThanOrEqual(60);
    s.render(0);
    s.render(1.5);
    expect(created.renders).toBe(2);
    s.dispose();
    expect(created.disposed).toBe(1);
    expect(created.lost).toBe(1);
  });
  it('phones get the simplified 3-tier stack (7 nodes) and fewer packets', async () => {
    const d = await createLandingScene(opts());
    const m = await createLandingScene(opts({ mobile: true, width: 390, height: 420 }));
    expect(m.stats.nodes).toBe(7);
    expect(m.stats.nodes).toBeLessThan(d.stats.nodes);
    expect(m.stats.packets).toBeLessThan(d.stats.packets);
    m.resize(360, 400);
    m.render(0.5);
    d.dispose(); m.dispose();
  });
  it('there is no background scene any more: no points / constellation in the stats or the source', () => {
    const src = readFileSync(join(process.cwd(), 'src/landing/threeScene.ts'), 'utf8');
    expect(src).not.toMatch(/PointsMaterial|nebula|constellation/i);
  });
  it('source has exactly one `new WebGLRenderer(`', () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const hits = walk(join(process.cwd(), 'src')).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && /new WebGLRenderer\(/.test(readFileSync(f, 'utf8')));
    expect(hits.map((f) => f.split('/').pop())).toEqual(['threeScene.ts']);
  });
});
