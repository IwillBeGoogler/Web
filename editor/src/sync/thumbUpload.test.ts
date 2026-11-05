import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createThumbUploader, MAX_THUMB_BYTES } from './thumbUpload';

const bytes = (n: number, v = 1) => new Uint8Array(n).fill(v);

describe('thumbnail uploader', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = (render: () => Promise<{ bytes: Uint8Array; type: string } | undefined>) => {
    const upload = vi.fn(async () => undefined);
    const u = createThumbUploader({ render, upload, delayMs: 1000 });
    return { u, upload };
  };

  it('debounces: many changes, one upload after the quiet period', async () => {
    const { u, upload } = make(async () => ({ bytes: bytes(10), type: 'image/png' }));
    u.touch(); u.touch();
    await vi.advanceTimersByTimeAsync(600);
    u.touch();
    await vi.advanceTimersByTimeAsync(999);
    expect(upload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(expect.any(Uint8Array), 'image/png');
  });
  it('skips an identical image and a render that produced nothing', async () => {
    let n = 0;
    const { u, upload } = make(async () => (n++ === 0 ? undefined : { bytes: bytes(10), type: 'image/png' }));
    u.touch(); await vi.advanceTimersByTimeAsync(1100);
    expect(upload).not.toHaveBeenCalled();
    u.touch(); await vi.advanceTimersByTimeAsync(1100);
    u.touch(); await vi.advanceTimersByTimeAsync(1100);
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it('never uploads more than the size cap', async () => {
    const { u, upload } = make(async () => ({ bytes: bytes(MAX_THUMB_BYTES + 1), type: 'image/png' }));
    u.touch(); await vi.advanceTimersByTimeAsync(1100);
    expect(upload).not.toHaveBeenCalled();
  });
  it('a failed upload is swallowed and retried on the next change; stop() cancels a pending one', async () => {
    const upload = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const u = createThumbUploader({ render: async () => ({ bytes: bytes(5), type: 'image/webp' }), upload, delayMs: 100 });
    u.touch(); await vi.advanceTimersByTimeAsync(150);
    u.touch(); await vi.advanceTimersByTimeAsync(150);
    expect(upload).toHaveBeenCalledTimes(2);
    u.touch(); u.stop(); await vi.advanceTimersByTimeAsync(500);
    expect(upload).toHaveBeenCalledTimes(2);
  });
});
