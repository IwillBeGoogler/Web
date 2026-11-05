/**
 * How far the reader got through an element (0–1): 0 until its top reaches
 * the viewport top, 1 once its bottom reaches the viewport bottom.
 */
export const scrollProgress = (scrollY: number, top: number, height: number, viewport: number): number => {
  const span = height - viewport;
  if (span <= 0) return scrollY + viewport >= top ? 1 : 0;
  return Math.min(1, Math.max(0, (scrollY - top) / span));
};
