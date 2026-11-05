import { describe, expect, it } from 'vitest';
import { contrastRatio, mixHex } from './contrast';
import { CARD_INK, CARD_TINT_PCT, TAG_COLORS } from './card';
import { monitoringMedium } from '../templates/monitoringMedium';

describe('card title contrast', () => {
  it('contrastRatio basics', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
  it('CARD_INK on every card tint (preset tag colours and template accents) is >= 4.5:1, in light AND dark theme', () => {
    const accents = new Set<string>([...TAG_COLORS, '#2f6fdb']);
    for (const n of monitoringMedium().nodes) if (n.type === 'card') accents.add(String(n.data.accent));
    expect(accents.size).toBeGreaterThan(5);
    for (const a of accents) expect(contrastRatio(CARD_INK, mixHex(a, '#ffffff', CARD_TINT_PCT)), a).toBeGreaterThanOrEqual(4.5);
  });
});
