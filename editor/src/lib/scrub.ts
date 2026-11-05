/**
 * Drag-to-scrub maths for number fields (Figma style): horizontal pointer movement changes the value.
 * Shift = x10 coarse, Alt = x0.1 fine. Result is clamped and rounded to the step's precision.
 */
export function scrubValue(start: number, dx: number, opts: { step?: number; min?: number; max?: number; shift?: boolean; alt?: boolean; pxPerStep?: number } = {}): number {
  const step = opts.step ?? 1;
  const mult = opts.shift ? 10 : opts.alt ? 0.1 : 1;
  const raw = start + Math.round(dx / (opts.pxPerStep ?? 4)) * step * mult;
  const decimals = Math.max(0, (String(step).split('.')[1] ?? '').length + (opts.alt ? 1 : 0));
  const rounded = Number(raw.toFixed(decimals));
  return Math.min(opts.max ?? Infinity, Math.max(opts.min ?? -Infinity, rounded));
}
