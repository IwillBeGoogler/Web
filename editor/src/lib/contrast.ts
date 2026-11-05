// WCAG contrast helpers (pure).
const hex = (c: string): [number, number, number] => {
  const m = c.trim().replace('#', '');
  const f = m.length === 3 ? m.split('').map((x) => x + x).join('') : m;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
};
const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export const luminance = (c: string): number => {
  const [r, g, b] = hex(c);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** `pct`% of `fg` mixed into `bg` (like CSS color-mix in srgb), as #rrggbb */
export function mixHex(fg: string, bg: string, pct: number): string {
  const a = hex(fg);
  const b = hex(bg);
  const m = a.map((v, i) => Math.round((v * pct) / 100 + b[i] * (1 - pct / 100)));
  return `#${m.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** dark / light ink used on a canvas: whichever reads better on the background */
export const INK_DARK = '#1f2430';
export const INK_LIGHT = '#eceff5';
/** a canvas colour that wants light ink (light ink contrasts more than dark ink) */
export function isDarkBackground(bg: string): boolean {
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(bg.trim())) return false;
  return contrastRatio(INK_LIGHT, bg) > contrastRatio(INK_DARK, bg);
}
/** text colour for free text placed straight on a canvas of this colour */
export function canvasInk(bg: string): string {
  const order = isDarkBackground(bg) ? [INK_LIGHT, '#ffffff', '#000000'] : [INK_DARK, '#000000', '#ffffff'];
  return order.find((c) => contrastRatio(c, bg) >= 4.5) ?? order.reduce((a, b) => (contrastRatio(b, bg) > contrastRatio(a, bg) ? b : a));
}
