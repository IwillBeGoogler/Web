export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computeExportView(b: Bounds, padding: number) {
  return {
    width: b.width + padding * 2,
    height: b.height + padding * 2,
    transform: `translate(${padding - b.x}px, ${padding - b.y}px) scale(1)`,
  };
}

export function exportFileName(title: string, ext: 'png' | 'svg' | 'json' | 'sdd'): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug || 'diagram'}.${ext}`;
}

export function downloadDataUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

export function downloadText(text: string, filename: string, mime = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  downloadDataUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ExportSettings {
  transparent: boolean;
  /** Solid export background; unset = white */
  background?: 'white' | 'black';
  scale: 1 | 2 | 3;
  padding: number;
}

/** Options for html-to-image. Transparent => no backgroundColor => no background rect in SVG. */
export function buildExportOptions(opts: ExportSettings, bounds: Bounds, _canvasBackground?: string) {
  const view = computeExportView(bounds, opts.padding);
  const bg = opts.background === 'black' ? '#000000' : '#ffffff'; // white unless black is chosen (never the canvas colour)
  return {
    ...(opts.transparent ? {} : { backgroundColor: bg }),
    width: view.width,
    height: view.height,
    pixelRatio: opts.scale,
    style: { width: `${view.width}px`, height: `${view.height}px`, transform: view.transform },
  } as { backgroundColor?: string; width: number; height: number; pixelRatio: number; style: { width: string; height: string; transform: string } };
}

export function downloadBlob(bytes: Uint8Array, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mime }));
  downloadDataUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
