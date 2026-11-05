import { describe, expect, it } from 'vitest';
import { CAM_Z, FOV_DESKTOP, FOV_MOBILE, fitTiltedBox, sceneBox } from './cameraMap';


describe('fitTiltedBox', () => {
  it('stays inside the box with its margin for any aspect, tilt and size; scales with the box', () => {
    for (const [vw, vh] of [[360, 780], [1440, 900], [2560, 1300]] as const) {
      const box = { left: 0, top: 0, width: vw, height: vh * 0.7 };
      const f = fitTiltedBox(box, vw, vh, FOV_DESKTOP, CAM_Z, 11, 6, -0.21, -0.26);
      expect(f.widthPx).toBeLessThanOrEqual(box.width * 0.92 + 0.5);
      expect(f.heightPx).toBeLessThanOrEqual(box.height * 0.92 + 0.5);
      expect((f.bounds.left + f.bounds.right) / 2).toBeCloseTo(box.left + box.width / 2, 0);
    }
    const small = fitTiltedBox({ left: 0, top: 0, width: 400, height: 300 }, 1000, 800, FOV_MOBILE, CAM_Z, 8, 5, -0.2, -0.25);
    const big = fitTiltedBox({ left: 0, top: 0, width: 800, height: 600 }, 1000, 800, FOV_MOBILE, CAM_Z, 8, 5, -0.2, -0.25);
    expect(big.scale).toBeGreaterThan(small.scale);
  });
});

describe('sceneBox (free area beside the headline)', () => {
  const hero = (vw: number, vh = 900) => ({ left: 0, top: 0, width: vw, height: vh });
  /** mirrors the landing CSS: >= 1000px two columns (copy left, scene right), below that copy on top and the scene below */
  const rects = (vw: number) => {
    const copyW = Math.min(560, Math.max(380, vw * 0.42));
    const padX = vw >= 1000 ? 48 : 24;
    const left = Math.max(padX, (vw - 1240) / 2 + padX);
    if (vw >= 1000) return { visual: hero(vw), copy: { left, top: 250, width: copyW, height: 400 } };
    return { visual: { left: 0, top: 520, width: vw, height: 460 }, copy: { left: padX, top: 100, width: vw - padX * 2, height: 400 } };
  };
  it('projected scene bounds stay >= 48px away from the headline rect for widths 768..2560', () => {
    for (const vw of [768, 820, 900, 999, 1000, 1024, 1280, 1440, 1600, 1920, 2560]) {
      const { visual, copy } = rects(vw);
      const box = sceneBox(visual, copy, { gap: 48, pad: 24 });
      expect(box.width, `${vw}`).toBeGreaterThan(250);
      expect(box.height, `${vw}`).toBeGreaterThan(200);
      const vh = 900;
      const fit = fitTiltedBox(box, vw, vh, FOV_DESKTOP, CAM_Z, 11, 9.6, -0.21, -0.26);
      const left = fit.bounds.left, right = fit.bounds.right, top = fit.bounds.top, bottom = fit.bounds.bottom;
      const horizSep = left - (copy.left + copy.width);
      const vertSep = top - (copy.top + copy.height);
      expect(Math.max(horizSep, vertSep), `${vw}: bounds ${left}-${right} x ${top}-${bottom} vs copy`).toBeGreaterThanOrEqual(48);
      expect(right).toBeLessThanOrEqual(visual.left + visual.width);
      expect(bottom).toBeLessThanOrEqual(visual.top + visual.height);
    }
  });
  it('is vertically centred on the headline block in two-column mode', () => {
    const { visual, copy } = rects(1440);
    const box = sceneBox(visual, copy, { gap: 48, pad: 24 });
    expect(box.top + box.height / 2).toBeCloseTo(copy.top + copy.height / 2, 3);
  });
});

describe('fitTiltedBox centring', () => {
  it('the projected bounds are centred in the box (perspective offset compensated)', () => {
    const box = { left: 700, top: 100, width: 640, height: 640 };
    const f = fitTiltedBox(box, 1440, 900, FOV_DESKTOP, CAM_Z, 11, 9.6, -0.21, -0.26);
    expect((f.bounds.left + f.bounds.right) / 2).toBeCloseTo(box.left + box.width / 2, 0);
    expect((f.bounds.top + f.bounds.bottom) / 2).toBeCloseTo(box.top + box.height / 2, 0);
  });
});
