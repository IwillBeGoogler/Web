import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PALETTES, paletteVars } from "./reading";

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as RGB;
const split = (s: string) => {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") d++;
    else if (s[i] === ")") d--;
    else if (s[i] === "," && d === 0) return [s.slice(0, i).trim(), s.slice(i + 1).trim()] as const;
  }
  throw new Error(s);
};
/** Resolves #hex and (nested) `color-mix(in srgb, A p%, B)` to RGB. */
const color = (v: string): RGB => {
  if (v.startsWith("#")) return hex(v);
  const [, rest] = split(v.slice(v.indexOf("(") + 1, -1));
  const [a, b] = split(rest);
  const m = /^(.*)\s(\d+(?:\.\d+)?)%$/.exec(a);
  if (!m) throw new Error(a);
  const p = Number(m[2]) / 100;
  const x = color(m[1] as string);
  const y = color(b);
  return x.map((c, i) => c * p + (y[i] as number) * (1 - p)) as RGB;
};
const lum = ([r, g, b]: RGB) => {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
/** The popover is painted at 97% over whatever is behind; test the worst backdrops. */
const over = (fg: RGB, bg: RGB): RGB => fg.map((c, i) => c * 0.97 + (bg[i] as number) * 0.03) as RGB;

describe("floating surfaces stay readable over any backdrop", () => {
  for (const pal of PALETTES) {
    it(`${pal.id}: menu text >= 4.5:1, icons >= 3:1, highlighted item >= 4.5:1`, () => {
      const v = paletteVars(pal);
      const fg = color(v["--fg"] as string);
      const muted = color(v["--muted"] as string);
      const pop = color(v["--popover"] as string);
      for (const backdrop of [
        [0, 0, 0],
        [255, 255, 255],
      ] as RGB[]) {
        const bg = over(pop, backdrop);
        expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(muted, bg)).toBeGreaterThanOrEqual(4.5);
      }
      expect(ratio(color(v["--on-inverse"] as string), color(v["--inverse"] as string))).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("css gives menus, popovers and dialogs the popover surface", () => {
    const css = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    expect(css).toMatch(
      /:is\(\.menu-pop, \.dialog-pop, \.float-surface, \[role="menu"\], \[role="listbox"\], \[role="dialog"\]\)\s*\{[^}]*var\(--glass-fill-float\)/,
    );
    // the floating glass fill is the palette's popover colour, kept dense enough to read over any backdrop
    expect(css).toMatch(/--glass-fill-float: color-mix\(in srgb, var\(--popover\) \d+%, transparent\)/);
    expect(css).toMatch(/--color-popover: var\(--popover\)/);
  });
});
