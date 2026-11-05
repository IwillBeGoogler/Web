/** Server thumbnails are small previews: the server refuses anything bigger than this. */
export const MAX_THUMB_BYTES = 200 * 1024;

export interface ThumbImage { bytes: Uint8Array; type: string }
export interface ThumbUploaderDeps {
  render: () => Promise<ThumbImage | undefined>;
  upload: (bytes: Uint8Array, type: string) => Promise<unknown>;
  /** quiet period after the last change */
  delayMs?: number;
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Debounced "render the preview and upload it": call `touch()` on every saved change. Best effort, never throws. */
export function createThumbUploader(d: ThumbUploaderDeps): { touch(): void; stop(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last: Uint8Array | null = null;
  let stopped = false;
  const run = async () => {
    timer = null;
    try {
      const img = await d.render();
      if (stopped || !img || img.bytes.length === 0 || img.bytes.length > MAX_THUMB_BYTES) return;
      if (last && same(last, img.bytes)) return;
      await d.upload(img.bytes, img.type);
      last = img.bytes;
    } catch {
      /* offline or refused: the next change tries again */
    }
  };
  return {
    touch() {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(), d.delayMs ?? 20_000);
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
