import type { CardTag } from '../types';

export const TAG_COLORS = ['#d9480f', '#1971c2', '#0c8599', '#7c3aed', '#d1344a', '#6b7280'] as const;

/** card text colour: cards are tinted light in both themes, so the ink is a fixed dark colour (never inherited from the theme) */
export const CARD_INK = '#1f2430';
/** % of the accent mixed into white for the card background */
export const CARD_TINT_PCT = 8;

export const addTag = (tags: CardTag[] = [], text = 'tag', color?: string): CardTag[] => [...tags, { text, color: color ?? TAG_COLORS[tags.length % TAG_COLORS.length] }];
export const removeTag = (tags: CardTag[] = [], i: number): CardTag[] => tags.filter((_, k) => k !== i);
export const updateTag = (tags: CardTag[] = [], i: number, patch: Partial<CardTag>): CardTag[] => tags.map((t, k) => (k === i ? { ...t, ...patch } : t));
export const moveTag = (tags: CardTag[] = [], from: number, to: number): CardTag[] => {
  if (from === to || from < 0 || to < 0 || from >= tags.length || to >= tags.length) return tags;
  const out = [...tags];
  const [t] = out.splice(from, 1);
  out.splice(to, 0, t);
  return out;
};

/** Card size from its content so tags never overflow: vertical stacks tags, horizontal puts the icon left. */
export function cardSize(tags: CardTag[] = [], layout: 'vertical' | 'horizontal' = 'vertical'): { width: number; height: number } {
  const rows = Math.max(1, tags.length);
  return layout === 'vertical' ? { width: 200, height: 76 + rows * 22 } : { width: 280, height: Math.max(84, 56 + rows * 22) };
}
