import { AlertTriangle, Boxes, Database, Layers, LayoutGrid, Search, Shapes, Workflow } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { MODE_KEY, PALETTE_MODES, type PaletteMode } from '../data/diagramModes';
import { useLayoutStore } from '../store/layoutStore';
import { useSmart } from '../store/smartStore';
import { useLintProblems } from '../hooks/useLintProblems';
import { t } from '../i18n';

const ICONS: Record<PaletteMode, typeof Boxes> = { all: LayoutGrid, architecture: Boxes, data: Database, uml: Workflow, board: Shapes };

/**
 * The collapsed component palette: a slim rail with a search icon and one icon per category.
 * A click expands the palette (and picks the category); ⌘\ toggles it. The choice is remembered.
 */
export function PaletteRail() {
  const toggle = useLayoutStore((s) => s.toggleSidebar);
  const layers = useUiStore((s) => s.layersOpen);
  const problemsOpen = useSmart((s) => s.problems);
  const setProblems = useSmart((s) => s.setProblems);
  const problems = useLintProblems();
  const setDesign = useUiStore((s) => s.setDesign);
  const open = (mode?: PaletteMode) => {
    if (mode) {
      try {
        localStorage.setItem(MODE_KEY, mode);
      } catch {
        /* ignore */
      }
    }
    toggle();
  };
  return (
    <nav className="palette-rail glass" aria-label={t('Components')} data-testid="palette-rail">
      <button type="button" className="rail-btn" aria-label={t('Search components')} title={`${t('Search components')} (⌘\\)`} onClick={() => open()}>
        <Search size={17} aria-hidden />
      </button>
      <span className="rail-sep" aria-hidden />
      {PALETTE_MODES.map((m) => {
        const Icon = ICONS[m.id];
        return (
          <button key={m.id} type="button" className="rail-btn" aria-label={t('{label} components', { label: t(m.label) })} title={`${t(m.label)}: ${t(m.hint)}`} onClick={() => open(m.id)}>
            <Icon size={17} aria-hidden />
          </button>
        );
      })}
      <span className="rail-sep" aria-hidden />
      <button type="button" className={`rail-btn${layers ? ' on' : ''}`} aria-label={t('Layers')} aria-pressed={layers} title={t('Layers')} onClick={() => setDesign({ layersOpen: !layers })}>
        <Layers size={17} aria-hidden />
      </button>
      {(problems.length > 0 || problemsOpen) && (
        <button type="button" className={`rail-btn rail-problems${problemsOpen ? ' on' : ''}`} aria-label={problems.length ? t('{n} problems', { n: problems.length > 99 ? '99+' : problems.length }) : t('Problems')} aria-pressed={problemsOpen} title={t('Problems')} onClick={() => setProblems(!problemsOpen)}>
          <AlertTriangle size={17} aria-hidden />
          {problems.length > 0 && <span className="rail-badge" data-testid="problems-badge">{problems.length > 99 ? '99+' : problems.length}</span>}
        </button>
      )}
    </nav>
  );
}
