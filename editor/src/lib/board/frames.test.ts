import { describe, expect, it } from 'vitest';
import { contentInFrame, createFrame, frameLink, nextFrameName, orderedFrames, parseFrameHash, reorderFrames } from './frames';
import { presentationKey, presentationRect, presentationSteps, stepPresentation } from './presentation';
import type { DiagramNode } from '../../types';

const fr = (id: string, x: number, y: number, order?: number): DiagramNode => ({ ...createFrame(id, { x, y, width: 400, height: 300 }, id), ...(order !== undefined ? { data: { label: id, order } } : {}) });
const pt = (id: string, x: number, y: number): DiagramNode => ({ id, type: 'sticky', position: { x, y }, width: 100, height: 100, data: { label: id } });

describe('createFrame / names', () => {
  it('creates a named frame with its rect', () => {
    const f = createFrame('f1', { x: 10, y: 20, width: 500, height: 400 }, 'Intro');
    expect(f.type).toBe('frame');
    expect(f.position).toEqual({ x: 10, y: 20 });
    expect([f.width, f.height]).toEqual([500, 400]);
    expect(f.data.label).toBe('Intro');
  });
  it('names the next frame Frame N', () => {
    expect(nextFrameName([])).toBe('Frame 1');
    expect(nextFrameName([fr('a', 0, 0), fr('b', 0, 0)])).toBe('Frame 3');
  });
});

describe('orderedFrames', () => {
  it('uses the explicit order first, then reading order', () => {
    const nodes = [fr('c', 900, 0), fr('a', 0, 0, 2), fr('b', 450, 0, 1), fr('d', 0, 500), pt('s', 0, 0)];
    expect(orderedFrames(nodes).map((f) => f.id)).toEqual(['b', 'a', 'c', 'd']);
  });
  it('reading order is top to bottom, then left to right', () => {
    const nodes = [fr('low', 0, 800), fr('right', 600, 0), fr('left', 0, 0)];
    expect(orderedFrames(nodes).map((f) => f.id)).toEqual(['left', 'right', 'low']);
  });
});

describe('reorderFrames', () => {
  it('moves a frame and renumbers all of them', () => {
    const nodes = [fr('a', 0, 0), fr('b', 500, 0), fr('c', 1000, 0)];
    const m = reorderFrames(nodes, 'c', 0);
    expect(m.get('c')).toBe(0);
    expect(m.get('a')).toBe(1);
    expect(m.get('b')).toBe(2);
  });
  it('clamps the target index', () => {
    const nodes = [fr('a', 0, 0), fr('b', 500, 0)];
    const m = reorderFrames(nodes, 'a', 99);
    expect(m.get('b')).toBe(0);
    expect(m.get('a')).toBe(1);
  });
  it('ignores unknown ids', () => {
    expect(reorderFrames([fr('a', 0, 0)], 'zzz', 0).size).toBe(0);
  });
});

describe('deep link', () => {
  it('round-trips an id through the hash', () => {
    const link = frameLink('https://x.test/p/1/f/2', 'n_ab c');
    expect(link.startsWith('https://x.test/p/1/f/2#frame=')).toBe(true);
    expect(parseFrameHash(link.slice(link.indexOf('#')))).toBe('n_ab c');
  });
  it('replaces an existing hash', () => {
    expect(frameLink('https://x.test/a#frame=old', 'new')).toBe('https://x.test/a#frame=new');
  });
  it('parses with or without #, rejects other hashes', () => {
    expect(parseFrameHash('#frame=abc')).toBe('abc');
    expect(parseFrameHash('frame=abc')).toBe('abc');
    expect(parseFrameHash('#other=1')).toBeNull();
    expect(parseFrameHash('')).toBeNull();
    expect(parseFrameHash('#frame=')).toBeNull();
  });
});

describe('contentInFrame', () => {
  it('lists nodes whose centre is inside the frame, not the frame itself', () => {
    const f = fr('f', 0, 0);
    const nodes = [f, pt('in', 100, 100), pt('edge', 340, 100), pt('out', 600, 600)];
    expect(contentInFrame(nodes, f).map((n) => n.id).sort()).toEqual(['edge', 'in']);
  });
});

describe('presentation', () => {
  const nodes = [fr('a', 0, 0), fr('b', 500, 0), fr('c', 1000, 0), pt('s', 0, 0)];
  it('steps are the ordered frame ids', () => {
    expect(presentationSteps(nodes)).toEqual(['a', 'b', 'c']);
    expect(presentationSteps([pt('s', 0, 0)])).toEqual([]);
  });
  it('steps forward and back and clamps at both ends', () => {
    expect(stepPresentation({ index: 0, count: 3 }, 'next').index).toBe(1);
    expect(stepPresentation({ index: 2, count: 3 }, 'next').index).toBe(2);
    expect(stepPresentation({ index: 0, count: 3 }, 'prev').index).toBe(0);
    expect(stepPresentation({ index: 1, count: 3 }, 'last').index).toBe(2);
    expect(stepPresentation({ index: 2, count: 3 }, 'first').index).toBe(0);
    expect(stepPresentation({ index: 0, count: 0 }, 'next').index).toBe(0);
  });
  it('maps keys to actions', () => {
    expect(presentationKey('ArrowRight')).toEqual({ type: 'step', dir: 'next' });
    expect(presentationKey(' ')).toEqual({ type: 'step', dir: 'next' });
    expect(presentationKey('ArrowLeft')).toEqual({ type: 'step', dir: 'prev' });
    expect(presentationKey('Home')).toEqual({ type: 'step', dir: 'first' });
    expect(presentationKey('End')).toEqual({ type: 'step', dir: 'last' });
    expect(presentationKey('p')).toEqual({ type: 'laser' });
    expect(presentationKey('P')).toEqual({ type: 'laser' });
    expect(presentationKey('s')).toEqual({ type: 'spotlight' });
    expect(presentationKey('Escape')).toEqual({ type: 'exit' });
    expect(presentationKey('x')).toBeNull();
  });
  it('the view rect pads the frame', () => {
    const r = presentationRect(fr('a', 100, 100), 40);
    expect(r).toEqual({ x: 60, y: 60, width: 480, height: 380 });
  });
});
