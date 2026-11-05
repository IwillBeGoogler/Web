import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canvasInk, contrastRatio, isDarkBackground, mixHex } from '../contrast';
import { ACCENTS } from './tableData';

const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');
const vars = (selector: string): Record<string, string> => {
  const line = css.split('\n').find((l) => l.startsWith(selector + ' {'))!;
  const out: Record<string, string> = {};
  for (const m of line.matchAll(/--(er-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})/g)) out[m[1]] = m[2];
  return out;
};
const light = vars('.er-table');
const dark = { ...light, ...vars('.canvas.canvas-dark .er-table') };

describe('ER table colours follow the canvas', () => {
  for (const [name, v] of [['light', light], ['dark', dark]] as const) {
    describe(name, () => {
      it('title / column / type / footer text reads on the card and on every header tint (>= 4.5:1)', () => {
        for (const accent of [...ACCENTS, '#4b5563']) {
          const head = mixHex(accent, v['er-bg'], 16);
          for (const bg of [v['er-bg'], head]) {
            expect(contrastRatio(v['er-text'], bg), `${name} text on ${bg}`).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(v['er-text-2'], bg), `${name} text-2 on ${bg}`).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(v['er-muted'], bg), `${name} muted on ${bg}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      });
    });
  }
  it('dark and light canvases pick opposite ink', () => {
    expect(isDarkBackground('#0f1218')).toBe(true);
    expect(isDarkBackground('#ffffff')).toBe(false);
    expect(isDarkBackground('#808080')).toBe(false);
  });
  it('free text (diagram titles) is >= 4.5:1 on any canvas colour', () => {
    for (const bg of ['#ffffff', '#fafbfc', '#0f1218', '#1a1f2a', '#000000', '#202020', '#6b7280', '#374151', '#9ca3af', '#7f7f7f', '#2f6fdb'])
      expect(contrastRatio(canvasInk(bg), bg), bg).toBeGreaterThanOrEqual(4.5);
  });
});
