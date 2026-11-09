import { editNewNode } from '../lib/editOnAdd';
import { useClickAdd } from '../hooks/useClickAdd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { ChevronsDownUp, ChevronsUpDown, PanelLeftClose, Search } from 'lucide-react';
import { ITEMS_BY_ID, ITEM_PATH, SECTIONS, searchSections, type CatalogItem, type CatalogSection } from '../data/catalog';
import { createNodesFromPaletteItem } from '../data/palette';
import { executeAction } from '../lib/actions';
import { MODE_KEY, PALETTE_MODES, PLACEHOLDER_SECTIONS, isMode, sectionsForMode, type PaletteMode } from '../data/diagramModes';
import { useUiStore } from '../store/uiStore';
import { useLayoutStore } from '../store/layoutStore';
import { useUsageStore } from '../store/usageStore';
import { newId } from '../lib/graph';
import { chunkRows, computeWindow } from '../lib/windowing';
import { initialAccordion } from '../lib/accordion';
import { useAccordion } from '../hooks/useAccordion';
import { Accordion, type AccordionSection } from './Accordion';
import { Highlight } from './Highlight';
import { useComponentSection } from './design/ComponentLibrary';
import { useTip } from './Tooltip';
import { IconGlyph } from './IconGlyph';

export const DRAG_MIME = 'application/x-sdd-palette';
export const COLS = 3;
export const ROW_H = 68;
export const VIEWPORT_H = 340;
export const VIRTUALIZE_OVER = 45;

/** stacked-cards corner glyph marking a cluster item (vs the single-node item) */
function ClusterBadge() {
  return (
    <svg className="cluster-badge" data-cluster-badge="true" width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x="4" y="1" width="9" height="8" rx="1.5" fill="var(--panel, #fff)" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.5" y="3" width="9" height="8" rx="1.5" fill="var(--panel, #fff)" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1" y="5" width="9" height="8" rx="1.5" fill="var(--panel, #fff)" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function PaletteGlyph({ item }: { item: CatalogItem }) {
  return <ItemGlyph item={item} />;
}

/** small drawings for the UML palette: the classifier boxes and one arrowhead per relation */
function UmlGlyph({ id }: { id: string }) {
  const c = id === 'uml-interface' ? '#0f9d8f' : id === 'uml-abstract' ? '#8e5bd6' : id === 'uml-enum' ? '#e8710a' : '#2f6fdb';
  const line = { stroke: 'currentColor', strokeWidth: 1.4, fill: 'none', strokeLinecap: 'round' as const };
  const bg = 'var(--elevated, #fff)';
  if (id.startsWith('uml-rel-')) {
    const kind = id.slice('uml-rel-'.length);
    const dashed = kind === 'realization' || kind === 'dependency' || kind === 'note';
    return (
      <svg className="palette-uml-glyph" width="32" height="32" viewBox="0 0 32 32" aria-hidden>
        <path d={kind === 'inheritance' || kind === 'realization' ? 'M3 16H19' : kind === 'composition' || kind === 'aggregation' ? 'M3 16H16' : kind === 'dependency' ? 'M3 16H26' : 'M3 16H29'} {...line} strokeDasharray={dashed ? '3 2.5' : undefined} />
        {(kind === 'inheritance' || kind === 'realization') && <path d="M19 10.5 29 16 19 21.5z" fill={bg} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />}
        {kind === 'composition' && <path d="M16 16 22.5 11.5 29 16 22.5 20.5z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />}
        {kind === 'aggregation' && <path d="M16 16 22.5 11.5 29 16 22.5 20.5z" fill={bg} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />}
        {kind === 'dependency' && <path d="M21.5 11 28 16 21.5 21" {...line} />}
      </svg>
    );
  }
  if (id === 'uml-package')
    return (
      <svg className="palette-uml-glyph" width="32" height="32" viewBox="0 0 32 32" aria-hidden>
        <path d="M4.5 9V6.5h10V9h13v17.5h-23z" fill={bg} stroke="#4b5563" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    );
  if (id === 'uml-note')
    return (
      <svg className="palette-uml-glyph" width="32" height="32" viewBox="0 0 32 32" aria-hidden>
        <path d="M5 5.5h16l6 6V26.5H5z M21 5.5v6h6" fill="#fff8c5" stroke="#c9b037" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M9 15h14M9 19h10" stroke="#8a7a22" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg className="palette-uml-glyph" width="32" height="32" viewBox="0 0 32 32" aria-hidden>
      <rect x="4.5" y="4.5" width="23" height="23" rx="2.5" fill={bg} stroke={c} strokeWidth="1.5" strokeDasharray={id === 'uml-interface' ? '3 2' : undefined} />
      <path d="M4.5 12.5h23M4.5 20h23" stroke={c} strokeWidth="1.3" />
      <path d="M10 8.5h12" stroke={id === 'uml-abstract' ? c : 'var(--muted, #6b7385)'} strokeWidth="1.6" strokeLinecap="round" strokeDasharray={id === 'uml-abstract' ? '4 2' : undefined} />
      <path d="M8 16h8M8 24h10" stroke="var(--muted, #6b7385)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

import { Uml2Glyph } from './uml/Uml2Glyph';
import { BoardGlyph } from './board/BoardGlyph';
import { t } from '../i18n';

function ItemGlyph({ item }: { item: CatalogItem }) {
  if (item.kind === 'icon') return <IconGlyph iconId={item.iconId} size={32} />;
  if (item.kind === 'cluster')
    return (
      <span className="palette-cluster-glyph" style={{ position: 'relative', display: 'inline-flex' }}>
        <IconGlyph iconId={item.iconId} size={32} />
        <span style={{ position: 'absolute', right: -6, bottom: -4, display: 'inline-flex', color: 'var(--muted, #667085)' }}><ClusterBadge /></span>
      </span>
    );
  if (item.id.startsWith('uml-')) {
    const g = Uml2Glyph({ id: item.id });
    if (g) return g;
  }
  if (item.kind === 'class' || item.kind === 'uml-rel' || item.id === 'uml-package' || item.id === 'uml-note') return <UmlGlyph id={item.id} />;
  if (item.kind === 'table') {
    const accent = item.id === 'er-junction' ? '#e8710a' : item.id === 'er-view' ? '#0f9d8f' : item.id === 'er-enum' ? '#8e5bd6' : '#2f6fdb';
    return (
      <svg className="palette-er-glyph" width="32" height="32" viewBox="0 0 32 32" aria-hidden>
        <rect x="3.5" y="4.5" width="25" height="23" rx="3.5" fill="var(--elevated, #fff)" stroke={accent} strokeWidth="1.4" strokeDasharray={item.id === 'er-view' ? '3 2' : undefined} />
        <path d="M3.5 8a3.5 3.5 0 0 1 3.5-3.5h18A3.5 3.5 0 0 1 28.5 8v3h-25z" fill={accent} opacity=".85" />
        <path d="M7 15.5h8M7 20h5M7 24h7" stroke="var(--muted, #6b7385)" strokeWidth="1.3" strokeLinecap="round" />
        {item.id === 'er-junction' ? <path d="M19 15.5h6M19 20h6" stroke={accent} strokeWidth="1.6" strokeLinecap="round" /> : <circle cx="23" cy="15.5" r="1.6" fill={accent} />}
      </svg>
    );
  }
  if (item.kind === 'frame' || item.kind === 'mindmap' || item.kind === 'stamp' || item.kind === 'tool' || item.id === 'board-sticky') return <BoardGlyph item={item} />;
  const glyph = item.kind === 'text' ? 'T' : item.kind === 'sticky' ? '▤' : item.kind === 'group' ? '⬚' : item.shape === 'ellipse' ? '◯' : item.shape === 'diamond' ? '◇' : '▢';
  return <span className="palette-glyph">{glyph}</span>;
}

function PaletteCell({ item, query, fav, onToggleFav, onPick }: { item: CatalogItem; query: string; fav: boolean; onToggleFav: (id: string) => void; onPick: (i: CatalogItem) => void }) {
  const tip = useTip({ title: item.label, path: ITEM_PATH.get(item.id), aliases: item.aliases.slice(0, 4), tags: item.tags.slice(0, 8) });
  return (
    <div className="palette-cell">
      <button
        type="button"
        className={`palette-item${item.soon ? ' soon' : ''}`}
        data-testid={`palette-${item.id}`}
        draggable={!item.soon && item.kind !== 'uml-rel' && item.kind !== 'tool'}
        disabled={!!item.soon}
        aria-label={item.soon ? `${t(item.label)} (${t(item.soon)})` : t(item.label)}
        title={item.soon ? t(item.soon) : undefined}
        {...(item.soon ? {} : tip)}
        onDragStart={(e) => {
          tip.onDragStart();
          e.dataTransfer.setData(DRAG_MIME, item.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => !item.soon && onPick(item)}
      >
        <ItemGlyph item={item} />
        <span className="palette-label">
          <Highlight text={t(item.label)} query={query} />
        </span>
      </button>
      {!item.soon && (
      <button
        type="button"
        className={`star${fav ? ' on' : ''}`}
        aria-label={t(fav ? 'Unfavorite {label}' : 'Favorite {label}', { label: t(item.label) })}
        aria-pressed={fav}
        onClick={() => onToggleFav(item.id)}
      >
        {fav ? '★' : '☆'}
      </button>
      )}
    </div>
  );
}

interface GridProps {
  items: CatalogItem[];
  query: string;
  onPick: (item: CatalogItem) => void;
}

/** 3-column grid; windowed when the list is long so 300+ items stay cheap. */
export function ItemGrid({ items, query, onPick }: GridProps) {
  const favorites = useUsageStore((s) => s.favorites);
  const toggleFavorite = useUsageStore((s) => s.toggleFavorite);
  const [scrollTop, setScrollTop] = useState(0);
  const rows = useMemo(() => chunkRows(items, COLS), [items]);
  const virtual = items.length > VIRTUALIZE_OVER;
  const win = virtual ? computeWindow(scrollTop, ROW_H, VIEWPORT_H, rows.length) : { start: 0, end: rows.length, padTop: 0, padBottom: 0 };

  const cell = (item: CatalogItem) => <PaletteCell key={item.id} item={item} query={query} fav={favorites.includes(item.id)} onToggleFav={toggleFavorite} onPick={onPick} />;

  return (
    <div
      className={`palette-grid-wrap${virtual ? ' virtual' : ''}`}
      style={virtual ? { maxHeight: VIEWPORT_H } : undefined}
      onScroll={virtual ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}
      data-testid="palette-scroll"
    >
      <div style={{ paddingTop: win.padTop, paddingBottom: win.padBottom }}>
        {rows.slice(win.start, win.end).map((r, i) => (
          <div className="palette-row" key={win.start + i} style={{ height: ROW_H }}>
            {r.map(cell)}
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionBody({ section, query, onPick, forceOpen }: { section: CatalogSection | ReturnType<typeof searchSections>[number]; query: string; onPick: (i: CatalogItem) => void; forceOpen: boolean }) {
  const ids = useMemo(() => section.subs.map((s) => s.id), [section]);
  const acc = useAccordion(`sdd:acc:sub:${section.id}`, ids);
  if (section.subs.length === 1) return <ItemGrid items={section.subs[0].items} query={query} onPick={onPick} />;
  const open = forceOpen ? ids : acc.state.open;
  return (
    <Accordion
      level={2}
      open={open}
      onToggle={acc.toggle}
      sections={section.subs.map((sub) => ({
        id: sub.id,
        label: <Highlight text={t(sub.label)} query={query} />,
        count: sub.items.length,
        content: <ItemGrid items={sub.items} query={query} onPick={onPick} />,
      }))}
    />
  );
}

export function Sidebar() {
  const collapse = useLayoutStore((s) => s.toggleSidebar);
  const [q, setQ] = useState('');
  const clickAddNodes = useClickAdd();
  const { screenToFlowPosition } = useReactFlow();
  const favorites = useUsageStore((s) => s.favorites);
  const recent = useUsageStore((s) => s.recent);
  const recordUse = useUsageStore((s) => s.recordUse);
  const hydrate = useUsageStore((s) => s.hydrate);
  useEffect(() => hydrate(), [hydrate]);

  const [chips, setChips] = useState<string[]>([]);
  const toggleChip = (t: string) => setChips((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]));
  const searching = q.trim().length > 0 || chips.length > 0;
  const [mode, setModeState] = useState<PaletteMode>(() => {
    try {
      const v = localStorage.getItem(MODE_KEY);
      return isMode(v) ? v : 'all';
    } catch {
      return 'all';
    }
  });
  const setMode = (m: PaletteMode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };
  const modeSections = useMemo(() => sectionsForMode(mode, SECTIONS), [mode]);
  const visible = useMemo(() => searchSections(modeSections, q, chips), [modeSections, q, chips]);
  const favItems = useMemo(() => favorites.map((id) => ITEMS_BY_ID.get(id)).filter((x): x is CatalogItem => !!x), [favorites]);
  const recentItems = useMemo(() => recent.map((id) => ITEMS_BY_ID.get(id)).filter((x): x is CatalogItem => !!x), [recent]);

  const topIds = useMemo(() => ['favorites', 'recent', ...SECTIONS.map((s) => s.id), ...PLACEHOLDER_SECTIONS.map((s) => s.id)], []);
  const firstVisit = useRef(false);
  const acc = useAccordion('sdd:acc:palette', topIds, initialAccordion());
  // several sections may always stay open (the old "Multi" checkbox is gone)
  useEffect(() => { if (!acc.state.multi) acc.setMulti(true); }, [acc]);
  // first visit only: let Favorites / Recently used start open when they have items
  useEffect(() => {
    if (firstVisit.current) return;
    firstVisit.current = true;
    try {
      const had = localStorage.getItem('sdd:acc:palette:seen');
      localStorage.setItem('sdd:acc:palette:seen', '1');
      if (had) return;
    } catch {
      /* ignore */
    }
    const id = useUsageStore.getState().favorites.length ? 'favorites' : useUsageStore.getState().recent.length ? 'recent' : null;
    if (id && acc.state.open.length === 0) acc.toggle(id);
  }, [acc]);

  const pick = (item: CatalogItem) => {
    const el = document.querySelector('.react-flow');
    const r = el?.getBoundingClientRect();
    const p = screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 600) / 2, y: (r?.top ?? 0) + (r?.height ?? 400) / 2 });
    const at = { x: Math.round(p.x / 20) * 20, y: Math.round(p.y / 20) * 20 };
    recordUse(item.id);
    if (item.kind === 'tool') return useUiStore.getState().setTool(item.tool as never);
    if (item.kind === 'uml-rel') return executeAction(`uml-connect:${item.id.slice('uml-rel-'.length)}`); // relations join the selected classes
    if (item.kind === 'cluster' && item.profileId) return useUiStore.getState().setWizard({ profileId: item.profileId, at }); // profile clusters open the wizard
    const made = createNodesFromPaletteItem(item, at, newId);
    clickAddNodes(made); // free spot inside the visible viewport (not the raw centre)
    editNewNode(made);
  };

  const comps = useComponentSection();
  const sections: AccordionSection[] = [];
  if (!searching && comps) sections.push(comps);
  if (!searching && mode === 'all' && favItems.length) sections.push({ id: 'favorites', label: t('★ Favorites'), count: favItems.length, content: <ItemGrid items={favItems} query="" onPick={pick} /> });
  if (!searching && mode === 'all' && recentItems.length) sections.push({ id: 'recent', label: t('Recently used'), count: recentItems.length, content: <ItemGrid items={recentItems} query="" onPick={pick} /> });
  for (const sec of visible) {
    sections.push({
      id: sec.id,
      label: <Highlight text={t(sec.label)} query={q} />,
      count: searching ? sec.matches : sec.count,
      content: <SectionBody section={sec} query={q} onPick={pick} forceOpen={searching} />,
    });
  }
  const open = searching ? visible.map((s) => s.id) : acc.state.open;

  return (
    <aside className="sidebar" aria-label={t('Palette')}>
      <div className="sidebar-head">
        <div className="sidebar-search-row">
          <div className="search-wrap">
            <Search size={14} aria-hidden />
            <input className="search" type="search" placeholder={t('Search components...')} aria-label={t('Search components')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button type="button" className="acc-toggle sidebar-collapse" title={`${t('Collapse sidebar')} (⌘\\)`} aria-label={t('Collapse sidebar')} data-testid="palette-collapse" onClick={collapse}><PanelLeftClose size={14} aria-hidden /></button>
        </div>
        <div className="mode-filter" role="group" aria-label={t('Diagram type')}>
          {PALETTE_MODES.map((m) => (
            <button key={m.id} type="button" className={`mode-chip${mode === m.id ? ' on' : ''}`} aria-pressed={mode === m.id} title={t(m.hint)} data-testid={`mode-${m.id}`} onClick={() => setMode(m.id)}>{t(m.label)}</button>
          ))}
        </div>
        <div className="tag-chips" role="group" aria-label={t('Filter by tag')}>
          {chips.map((tag) => (
            <button key={tag} type="button" className="chip on" aria-pressed="true" aria-label={t('Remove filter {tag}', { tag })} onClick={() => toggleChip(tag)}>#{tag} ×</button>
          ))}
        </div>
        <div className="acc-tools">
          {acc.state.open.length ? (
            <button type="button" className="acc-toggle" title={t('Collapse all')} aria-label={t('Collapse all')} onClick={acc.collapseAll}><ChevronsDownUp size={14} aria-hidden /></button>
          ) : (
            <button type="button" className="acc-toggle" title={t('Expand all')} aria-label={t('Expand all')} onClick={acc.expandAll}><ChevronsUpDown size={14} aria-hidden /></button>
          )}
        </div>
      </div>
      <div className="palette-scroll">
        <Accordion sections={sections} open={open} onToggle={acc.toggle} />
        {searching && !visible.length && <p className="muted pad">{t('No matches')}</p>}
      </div>
    </aside>
  );
}
