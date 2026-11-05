import type { Project } from '../../types';
import { buildThumbnail } from '../thumbnail';

/** Best-effort PNG preview of the active page (browser only; returns undefined where canvas is unavailable). */
export async function renderThumbnailPng(project: Project): Promise<Uint8Array | undefined> {
  return (await renderThumbnailImage(project, 'image/png'))?.bytes;
}

/** Same preview, as WebP when the browser can encode it (smaller) and PNG otherwise. */
export async function renderThumbnailImage(project: Project, prefer: 'image/webp' | 'image/png' = 'image/webp'): Promise<{ bytes: Uint8Array; type: string } | undefined> {
  try {
    if (typeof document === 'undefined' || typeof Image === 'undefined') return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 300;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return undefined; // no canvas support (e.g. jsdom): skip the optional preview
    const page = project.pages.find((p) => p.id === project.activePageId) ?? project.pages[0];
    const svg = buildThumbnail(page.nodes, page.edges, { width: 480, height: 300 }, 10, project.settings?.canvas?.background);
    const img = new Image();
    const loaded = new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('thumbnail'));
    });
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await Promise.race([loaded, new Promise<void>((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500))]);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 480, 300);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, prefer, 0.8));
    return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type === 'image/webp' ? 'image/webp' : 'image/png' } : undefined;
  } catch {
    return undefined;
  }
}
