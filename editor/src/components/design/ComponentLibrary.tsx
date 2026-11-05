import { Trash2 } from 'lucide-react';
import { useLibraryDoc } from '../../lib/library/store';
import { deleteComponent, libraryHasComponents } from '../../lib/library/components';
import { executeAction } from '../../lib/actions';
import { useConfirm } from '../../hooks/useDialogs';
import type { AccordionSection } from '../Accordion';
import type { ComponentDef } from '../../lib/library/types';
import { t } from '../../i18n';

export const COMPONENT_MIME = 'application/x-sdd-component';

/** a tiny drawing of a component: its nodes as boxes */
function Preview({ def }: { def: ComponentDef }) {
  const w = Math.max(def.width, 1), h = Math.max(def.height, 1);
  const k = Math.min(56 / w, 40 / h);
  return (
    <svg width={56} height={40} viewBox={`0 0 56 40`} aria-hidden className="component-preview">
      <g transform={`translate(${(56 - w * k) / 2} ${(40 - h * k) / 2}) scale(${k})`}>
        <rect width={w} height={h} rx={6} fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={1 / k} />
        {def.nodes.filter((n) => !n.parentKey || true).map((n) => <rect key={n.key} x={n.x} y={n.y} width={n.width ?? 60} height={n.height ?? 40} rx={4} fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeOpacity={0.5} strokeWidth={1 / k} />)}
      </g>
    </svg>
  );
}

/** The "Components" palette section: only exists once the project has at least one component. */
export function useComponentSection(): AccordionSection | null {
  const doc = useLibraryDoc((s) => s.doc);
  const confirm = useConfirm();
  if (!libraryHasComponents(doc)) return null;
  const defs = Object.values(doc.components).sort((a, b) => a.name.localeCompare(b.name));
  return {
    id: 'project-components',
    label: t('Project components'),
    count: defs.length,
    content: (
      <ul className="component-list" aria-label={t('Project components')}>
        {defs.map((d) => (
          <li key={d.id} className="component-item">
            <button type="button" className="component-btn" draggable aria-label={t('Insert {name}', { name: d.name })} title={t('Insert {name} (drag onto the canvas)', { name: d.name })} onClick={() => executeAction(`insert-component:${d.id}`)} onDragStart={(e) => { e.dataTransfer.setData(COMPONENT_MIME, d.id); e.dataTransfer.effectAllowed = 'copy'; }}>
              <Preview def={d} />
              <span>{d.name}</span>
            </button>
            <button type="button" className="component-del" aria-label={t('Delete {name}', { name: d.name })} title={t('Delete component (instances become plain nodes)')} onClick={async () => { if (await confirm({ title: t('Delete “{name}”?', { name: d.name }), message: t('Its instances stay on the canvases as plain nodes.'), confirmLabel: t('Delete'), danger: true })) useLibraryDoc.getState().update((l) => deleteComponent(l, d.id)); }}><Trash2 size={13} aria-hidden /></button>
          </li>
        ))}
      </ul>
    ),
  };
}
