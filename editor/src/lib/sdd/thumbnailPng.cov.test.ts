import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderThumbnailPng, renderThumbnailImage } from './thumbnailPng';
import type { Project } from '../../types';

const proj = { pages: [{ id: 'p', nodes: [], edges: [] }], activePageId: 'p', settings: {} } as unknown as Project;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('thumbnailPng', () => {
  it('returns undefined when no 2d context (jsdom)', async () => {
    expect(await renderThumbnailPng(proj)).toBeUndefined();
  });
  it('returns undefined when Image missing', async () => {
    vi.stubGlobal('Image', undefined);
    expect(await renderThumbnailImage(proj)).toBeUndefined();
  });
  function setup(blob: Blob | null) {
    const ctx = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb) { cb(blob); } as never);
    class Img { onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_v: string) { setTimeout(() => this.onload?.(), 0); } }
    vi.stubGlobal('Image', Img);
    return ctx;
  }
  it('renders bytes with webp type', async () => {
    const ctx = setup(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }));
    if (!Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = function () { return Promise.resolve(new Uint8Array([1, 2, 3]).buffer); };
    const r = await renderThumbnailImage(proj);
    expect(r?.type).toBe('image/webp');
    expect(r?.bytes.length).toBe(3);
    expect(ctx.drawImage).toHaveBeenCalled();
  });
  it('png type for other blobs, png helper returns bytes', async () => {
    setup(new Blob([new Uint8Array([9])], { type: 'image/png' }));
    if (!Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = function () { return Promise.resolve(new Uint8Array([9]).buffer); };
    expect((await renderThumbnailImage(proj, 'image/png'))?.type).toBe('image/png');
    expect((await renderThumbnailPng(proj))?.length).toBe(1);
  });
  it('undefined when blob null', async () => {
    setup(null);
    expect(await renderThumbnailImage(proj)).toBeUndefined();
  });
  it('undefined when image errors', async () => {
    setup(null);
    class Bad { onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_v: string) { setTimeout(() => this.onerror?.(), 0); } }
    vi.stubGlobal('Image', Bad);
    expect(await renderThumbnailImage(proj)).toBeUndefined();
  });
});
