import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio, mixHex } from './contrast';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
const uml = read('src/styles/uml2.css');
const theme = read('src/embed/theme.css');

/** --uml-<scheme>-<name> values: the embed's (Web palette) and the standalone fallbacks written in uml2.css */
const embed = (scheme: string, name: string) => theme.match(new RegExp(`--uml-${scheme}-${name}:\\s*(#[0-9a-fA-F]{6})`))![1];
const fallback = (scheme: string, name: string) => uml.match(new RegExp(`var\\(--uml-${scheme}-${name},\\s*(#[0-9a-fA-F]{6})\\)`))![1];

describe('UML node text reads in both palettes (>= 4.5:1), embedded and standalone', () => {
  for (const [label, get] of [['embed', embed], ['standalone', fallback]] as const) {
    for (const scheme of ['light', 'dark']) {
      it(`${label} ${scheme}`, () => {
        const bg = get(scheme, 'bg');
        const accentTints = ['#2f6fdb', '#d9822b', '#3f8f6b', '#0e7490', '#8e5bd6', '#e8710a'].map((a) => mixHex(a, bg, 10));
        for (const surface of [bg, get(scheme, 'tab'), ...accentTints]) {
          expect(contrastRatio(get(scheme, 'text'), surface), `text on ${surface}`).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(get(scheme, 'muted'), surface), `muted on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrastRatio(get(scheme, 'line'), bg), 'line').toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(get(scheme, 'frag'), get(scheme, 'tab')), 'frag on tab').toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(get(scheme, 'soft'), bg), 'soft lines').toBeGreaterThanOrEqual(3);
      });
    }
  }
});
