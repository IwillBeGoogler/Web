import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMBED_IMAGE_TYPES } from '../../embed';
import { assetFromBytes, setAllowedIconMimes, setAssetUploader, storeImage } from './assets';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe('icon image types', () => {
  afterEach(() => setAllowedIconMimes(null));
  it('standalone: SVG and GIF are fine', () => {
    expect(() => assetFromBytes(png, 'image/svg+xml')).not.toThrow();
    expect(() => assetFromBytes(png, 'image/gif')).not.toThrow();
  });
  it('a host without SVG: SVG is refused with a clear message, PNG/JPEG/WebP pass', () => {
    setAllowedIconMimes(['image/png', 'image/jpeg', 'image/webp']);
    expect(() => assetFromBytes(png, 'image/svg+xml')).toThrow(/SVG images are not supported here.*PNG, JPEG or WebP/);
    expect(() => assetFromBytes(png, 'image/gif')).toThrow(/Unsupported image type/);
    for (const m of ['image/png', 'image/jpeg', 'image/webp']) expect(() => assetFromBytes(png, m)).not.toThrow();
  });
  it('embedded policy takes SVG too', () => {
    setAllowedIconMimes(EMBED_IMAGE_TYPES);
    expect(() => assetFromBytes(png, 'image/svg+xml')).not.toThrow();
    expect(() => assetFromBytes(png, 'image/gif')).toThrow(/Unsupported image type/);
  });
  it('storeImage: inline without an uploader, a data-less reference to the stored hash with one', async () => {
    const inline = await storeImage(png, 'image/png');
    expect(inline.asset.data).toBeTruthy();
    const up = vi.fn(async () => ({ hash: 'f'.repeat(64), mime: 'image/png' }));
    setAssetUploader(up);
    try {
      const r = await storeImage(png, 'image/png');
      expect(up).toHaveBeenCalledOnce();
      expect(r).toEqual({ hash: 'f'.repeat(64), asset: { mime: 'image/png' } });
    } finally {
      setAssetUploader(null);
    }
  });
});
