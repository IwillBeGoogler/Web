/** Project styles (colour, text, effect) and theme tokens (pure). A node references a style by id in `data.styles`; editing the style updates every user. */
import type { DiagramNode } from '../../types';
import type { ColorStyle, EffectStyle, LibraryDoc, TextStyle, ThemeToken } from './types';

export type Theme = 'light' | 'dark';
export type StyleSlot = 'fill' | 'stroke' | 'text' | 'effect';
export type StyleKind = 'color' | 'text' | 'effect';

export const addColorStyle = (l: LibraryDoc, s: ColorStyle): LibraryDoc => ({ ...l, styles: { ...l.styles, colors: { ...l.styles.colors, [s.id]: s } } });
export const addTextStyle = (l: LibraryDoc, s: TextStyle): LibraryDoc => ({ ...l, styles: { ...l.styles, texts: { ...l.styles.texts, [s.id]: s } } });
export const addEffectStyle = (l: LibraryDoc, s: EffectStyle): LibraryDoc => ({ ...l, styles: { ...l.styles, effects: { ...l.styles.effects, [s.id]: s } } });
export const addToken = (l: LibraryDoc, t: ThemeToken): LibraryDoc => ({ ...l, tokens: { ...l.tokens, [t.id]: t } });
export function updateColorStyle(l: LibraryDoc, id: string, patch: Partial<Omit<ColorStyle, 'id'>>): LibraryDoc {
  const cur = l.styles.colors[id];
  return cur ? addColorStyle(l, { ...cur, ...patch }) : l;
}
export function removeStyle(l: LibraryDoc, kind: StyleKind, id: string): LibraryDoc {
  const key = kind === 'color' ? 'colors' : kind === 'text' ? 'texts' : 'effects';
  const { [id]: _g, ...rest } = l.styles[key] as Record<string, unknown>;
  void _g;
  return { ...l, styles: { ...l.styles, [key]: rest } };
}

/** the colour of a style in a theme; `token:<id>` goes through the theme token, a missing token stays literal */
export function resolveColor(s: ColorStyle, l: LibraryDoc, theme: Theme): string {
  const raw = theme === 'dark' && s.dark ? s.dark : s.value;
  const m = /^token:(.+)$/.exec(raw);
  if (!m) return raw;
  const t = l.tokens[m[1]];
  return t ? (theme === 'dark' ? t.dark : t.light) : raw;
}

const slotKind = (slot: StyleSlot): StyleKind => (slot === 'text' ? 'text' : slot === 'effect' ? 'effect' : 'color');
const lookup = (l: LibraryDoc, slot: StyleSlot, id: string) => (slot === 'text' ? l.styles.texts[id] : slot === 'effect' ? l.styles.effects[id] : l.styles.colors[id]);

function look(slot: StyleSlot, style: unknown, l: LibraryDoc, theme: Theme): Record<string, unknown> {
  if (slot === 'fill') return { fill: resolveColor(style as ColorStyle, l, theme) };
  if (slot === 'stroke') return { stroke: resolveColor(style as ColorStyle, l, theme) };
  if (slot === 'text') {
    const t = style as TextStyle;
    return { ...(t.fontSize !== undefined ? { fontSize: t.fontSize } : {}), ...(t.bold !== undefined ? { bold: t.bold } : {}), ...(t.align ? { align: t.align } : {}), ...(t.color ? { textColor: t.color } : {}) };
  }
  const e = style as EffectStyle;
  return e.shadow ? { shadow: true, shadowSpec: e.shadow } : { shadow: false, shadowSpec: undefined };
}
const differs = (data: Record<string, unknown>, patch: Record<string, unknown>) => Object.entries(patch).some(([k, v]) => JSON.stringify(data[k]) !== JSON.stringify(v));

export function applyStyle(nodes: DiagramNode[], ids: string[], slot: StyleSlot, styleId: string, l: LibraryDoc, theme: Theme): DiagramNode[] {
  const style = lookup(l, slot, styleId);
  if (!style) return nodes;
  const sel = new Set(ids);
  const patch = look(slot, style, l, theme);
  return nodes.map((n) => (sel.has(n.id) ? { ...n, data: { ...n.data, ...patch, styles: { ...(n.data.styles ?? {}), [slot]: styleId } } } : n));
}

export function detachStyle(nodes: DiagramNode[], ids: string[], slot: StyleSlot): DiagramNode[] {
  const sel = new Set(ids);
  return nodes.map((n) => {
    if (!sel.has(n.id) || !n.data.styles?.[slot]) return n;
    const { [slot]: _s, ...rest } = n.data.styles;
    void _s;
    const { styles: _all, ...data } = n.data;
    void _all;
    return { ...n, data: Object.keys(rest).length ? { ...data, styles: rest } : data };
  });
}

/** re-resolve every styled node (after a style or token edit, a theme switch, or loading a file); same array when nothing changed */
export function propagateStyles(nodes: DiagramNode[], l: LibraryDoc, theme: Theme): DiagramNode[] {
  let changed = false;
  const out = nodes.map((n) => {
    const refs = n.data.styles;
    if (!refs) return n;
    let data = n.data;
    for (const slot of ['fill', 'stroke', 'text', 'effect'] as StyleSlot[]) {
      const id = refs[slot];
      if (!id) continue;
      const style = lookup(l, slot, id);
      if (!style) {
        data = detachStyle([{ ...n, data }], [n.id], slot)[0].data;
        continue;
      }
      const patch = look(slot, style, l, theme);
      if (differs(data, patch)) data = { ...data, ...patch };
    }
    if (data === n.data) return n;
    changed = true;
    return { ...n, data };
  });
  return changed ? out : nodes;
}

/** how many nodes use each style id */
export function stylesInUse(nodes: DiagramNode[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of nodes) for (const id of Object.values(n.data.styles ?? {})) if (id) out[id] = (out[id] ?? 0) + 1;
  return out;
}
export { slotKind };
