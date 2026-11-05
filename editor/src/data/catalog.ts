import type { DiagramNodeData, ShapeKind } from '../types';
import { CATALOG_DEFS, CATALOG_SECTIONS } from './catalog.generated';
import { GENERIC_ICONS } from './icons/generic';
import { parseQuery, scoreEntry } from '../lib/search';
import { dedupeSections, disambiguateLabels } from './dedupe';

export interface NodePreset {
  width: number;
  height: number;
  data: Partial<DiagramNodeData>;
}

export interface CatalogItem {
  id: string;
  label: string;
  kind: 'icon' | 'shape' | 'text' | 'sticky' | 'group' | 'cluster' | 'card' | 'junction' | 'table' | 'class' | 'sequence' | 'state' | 'usecase' | 'activity' | 'component' | 'deployment' | 'object' | 'timing' | 'frame' | 'mindmap' | 'stamp' | 'tool' | 'uml-rel';
  /** cluster profile (wizard) for kind 'cluster' */
  profileId?: string;
  iconId?: string;
  shape?: ShapeKind;
  subtitle?: string;
  aliases: string[];
  /** provider / category / trait tags (generated + curated, see scripts/tags.mjs) */
  tags: string[];
  keywords: string[];
  preset?: NodePreset;
  /** icon pack the item's logo lives in (for lazy loading / virtualization hints) */
  pack?: string;
  /** kind 'tool': the canvas tool this item switches to (pen, highlighter, ...) */
  tool?: string;
  /** placeholder for a diagram type that is not built yet (shown disabled in the palette) */
  soon?: string;
}
type RawItem = Omit<CatalogItem, 'tags'> & { tags?: string[] };
/** Hand-written items (shapes, helpers, clusters) get generic tags too, so every catalog item is taggable. */
export const withTags = (items: RawItem[], extra: string[] = []): CatalogItem[] =>
  items.map((i) => ({ ...i, tags: [...new Set([...(i.tags ?? []), 'generic', i.kind, ...extra])] }));

export interface CatalogSub {
  id: string;
  label: string;
  items: CatalogItem[];
}
export interface CatalogSection {
  id: string;
  label: string;
  subs: CatalogSub[];
  count: number;
}

const shape = (id: string, label: string, s: ShapeKind, preset: NodePreset | undefined, kw: string[] = [], aliases: string[] = []): CatalogItem => ({
  id, label, kind: 'shape', shape: s, aliases, tags: ['shape'], keywords: kw, preset,
});

export const SHAPE_ITEMS: CatalogItem[] = withTags([
  shape('rectangle', 'Rectangle', 'rect', { width: 140, height: 90, data: { radius: 0 } }, ['box', 'square'], ['rect']),
  shape('rounded', 'Rounded box', 'rounded', { width: 140, height: 90, data: { radius: 14 } }, ['box']),
  shape('circle', 'Circle', 'ellipse', { width: 100, height: 100, data: {} }, ['ellipse', 'oval']),
  shape('cylinder', 'Cylinder', 'cylinder', { width: 90, height: 110, data: { label: 'Storage', radius: 0 } }, ['database', 'storage', 'disk', 'volume'], ['db shape']),
  shape('ellipsis', 'Ellipsis (…)', 'ellipsis', { width: 48, height: 28, data: {} }, ['repeat', 'dots', 'more'], ['dots', 'etc']),
  shape('diamond', 'Diamond', 'diamond', { width: 130, height: 100, data: {} }, ['decision', 'rhombus'], ['decision']),
  { id: 'text', label: 'Text', kind: 'text', aliases: ['title', 'label'], keywords: ['legend'] },
  { id: 'note', label: 'Note / Sticky', kind: 'sticky', aliases: ['sticky', 'postit'], keywords: ['comment'] },
  { id: 'group', label: 'Group / Boundary', kind: 'group', aliases: ['boundary'], keywords: ['box', 'container'] },
  { id: 'cluster', label: 'Cluster', kind: 'cluster', aliases: ['ha group', 'replica set'], keywords: ['replication', 'nodes', 'ring', 'quorum'], iconId: 'service' },
]);

export const HELPER_ITEMS: CatalogItem[] = withTags([
  { id: 'title', label: 'Diagram title', kind: 'text', aliases: ['heading', 'headline'], keywords: ['title', 'header'], preset: { width: 320, height: 40, data: { label: 'Diagram title', fontSize: 28, bold: true, textColor: '#1f2430' } } },
  {
    id: 'card', label: 'Card', kind: 'card', aliases: ['service card', 'tagged card'], keywords: ['tags', 'labels', 'tinted'],
    preset: { width: 200, height: 120, data: { label: 'Service', iconId: 'service', layout: 'vertical', accent: '#2f6fdb', tags: [{ text: 'tag', color: '#2f6fdb' }, { text: 'tag', color: '#e8710a' }] } },
  },
  {
    id: 'card-horizontal', label: 'Card (horizontal)', kind: 'card', aliases: ['wide card'], keywords: ['tags', 'row'],
    preset: { width: 280, height: 92, data: { label: 'Service', iconId: 'service', layout: 'horizontal', accent: '#0f9d8f', tags: [{ text: 'tag', color: '#0f9d8f' }] } },
  },
  { id: 'junction', label: 'Junction', kind: 'junction', aliases: ['bus', 'merge point', 'join'], keywords: ['fan-in', 'connector'], preset: { width: 10, height: 10, data: {} } },
  {
    id: 'group-dashed', label: 'Group (dashed, titled)', kind: 'group', aliases: ['dashed group'], keywords: ['container', 'caption'],
    preset: { width: 360, height: 240, data: { label: 'Group', variant: 'dashed', caption: 'caption', strokeStyle: 'dashed' } },
  },
  {
    id: 'group-card', label: 'Group (card)', kind: 'group', aliases: ['container card'], keywords: ['tinted', 'solid'],
    preset: { width: 360, height: 240, data: { label: 'Group', subtitle: 'subtitle', variant: 'card', accent: '#2f6fdb', strokeStyle: 'solid' } },
  },
  {
    id: 'boundary', label: 'Boundary', kind: 'group', aliases: ['trust boundary'], keywords: ['zone'],
    preset: { width: 360, height: 240, data: { label: 'Boundary', stroke: '#2d3340', strokeStyle: 'solid' } },
  },
  {
    id: 'zone', label: 'Zone', kind: 'group', aliases: ['network zone', 'dmz'], keywords: ['area'],
    preset: { width: 360, height: 240, data: { label: 'Zone', stroke: '#2f6fdb', strokeStyle: 'dashed', fill: '#2f6fdb', fillOpacity: 6 } },
  },
  shape('legend-box', 'Legend box', 'rect', { width: 220, height: 120, data: { label: 'Legend', radius: 6, strokeStyle: 'solid' } }, ['key'], ['legend']),
  shape('step-badge', 'Numbered step badge', 'ellipse', {
    width: 32, height: 32,
    data: { label: '1', background: 'filled', fill: '#2d3340', stroke: '#2d3340', textColor: '#ffffff', bold: true, fontSize: 13, align: 'center' },
  }, ['number', 'step'], ['step', 'badge']),
  {
    id: 'callout', label: 'Callout', kind: 'sticky', aliases: ['note callout', 'annotation'], keywords: ['comment'],
    preset: { width: 180, height: 90, data: { label: 'Callout', fill: '#dbeafe', stroke: '#2f6fdb', strokeWidth: 1.2, fontSize: 13 } },
  },
]);

const defs = new Map(CATALOG_DEFS.map((d) => [d.id, d]));
const iconItem = (id: string): CatalogItem | undefined => {
  const d = defs.get(id);
  if (!d) return undefined;
  return { id, label: d.label, kind: 'icon', iconId: id, subtitle: d.subtitle, aliases: d.aliases, tags: d.tags ?? [], keywords: [] };
};

const extraSections: CatalogSection[] = [];
/** Packs such as AWS register extra sections (items resolved lazily). */
export function registerSections(s: CatalogSection[]): void {
  // upsert by id (keeps position): safe to call repeatedly (HMR reloads, tests) without duplicating sections
  for (const sec of s) {
    const at = extraSections.findIndex((x) => x.id === sec.id);
    if (at >= 0) extraSections[at] = sec;
    else extraSections.push(sec);
  }
  rebuild();
}

export let SECTIONS: CatalogSection[] = [];
export let ITEMS_BY_ID = new Map<string, CatalogItem>();
export let ALL_ITEMS: CatalogItem[] = [];
/** first "Section › Sub" path per item id (tooltips) */
export let ITEM_PATH = new Map<string, string>();

function rebuild(): void {
  const base: CatalogSection[] = CATALOG_SECTIONS.map((sec) => {
    const subs: CatalogSub[] = sec.subs.map((sub) => ({
      id: sub.id,
      label: sub.label,
      items: [
        ...(sub.shapes ? SHAPE_ITEMS : []),
        ...(sub.helpers ? HELPER_ITEMS : []),
        ...sub.ids.map(iconItem).filter((x): x is CatalogItem => !!x),
      ],
    }));
    return { id: sec.id, label: sec.label, subs, count: new Set(subs.flatMap((s) => s.items.map((i) => i.id))).size };
  });
  SECTIONS = disambiguateLabels(dedupeSections([...base, ...extraSections.filter((x) => !base.some((b) => b.id === x.id))]));
  ITEMS_BY_ID = new Map();
  ITEM_PATH = new Map();
  for (const sec of SECTIONS)
    for (const sub of sec.subs)
      for (const it of sub.items) {
        ITEMS_BY_ID.set(it.id, it);
        ITEM_PATH.set(it.id, sec.subs.length > 1 ? `${sec.label} › ${sub.label}` : sec.label);
      }
  ALL_ITEMS = [...ITEMS_BY_ID.values()];
}
export const registerClusterSection = registerSections;
rebuild();

export const isGenericIcon = (id: string): boolean => id in GENERIC_ICONS;

// ---------------- search ----------------

/** 0 = no match. Higher is better; multi-term AND, `#tag`, tags and aliases (see lib/search). */
export function scoreItem(item: CatalogItem, query: string, context: string[] = [], chips: string[] = []): number {
  const pq = parseQuery(query, chips);
  if (!pq.terms.length && !pq.tags.length) return 1;
  return scoreEntry(item, pq, context);
}

export interface SearchSub extends CatalogSub {
  scores: Map<string, number>;
}
export interface SearchSection extends Omit<CatalogSection, 'subs'> {
  subs: SearchSub[];
  matches: number;
}

/** Sections/subs reduced to matching items (sorted by score). Empty query returns everything. */
export function searchSections(sections: CatalogSection[], query: string, chips: string[] = []): SearchSection[] {
  const out: SearchSection[] = [];
  for (const sec of sections) {
    const subs: SearchSub[] = [];
    let matches = 0;
    for (const sub of sec.subs) {
      const scores = new Map<string, number>();
      const items = sub.items
        .map((it) => ({ it, s: scoreItem(it, query, [sec.label, sub.label], chips) }))
        .filter((x) => x.s > 0);
      items.sort((a, b) => b.s - a.s);
      for (const x of items) scores.set(x.it.id, x.s);
      if (items.length) {
        subs.push({ ...sub, items: items.map((x) => x.it), scores });
        matches += items.length;
      }
    }
    if (subs.length) out.push({ ...sec, subs, matches });
  }
  return out;
}

/** Flat unique search (used by tests and quick-add). */
export function searchItems(query: string, chips: string[] = []): CatalogItem[] {
  const seen = new Map<string, number>();
  for (const sec of SECTIONS) for (const sub of sec.subs) for (const it of sub.items) {
    const s = scoreItem(it, query, [sec.label, sub.label], chips);
    if (s > (seen.get(it.id) ?? 0)) seen.set(it.id, s);
  }
  return [...seen.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([id]) => ITEMS_BY_ID.get(id)!);
}
