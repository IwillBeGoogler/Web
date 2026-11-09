/** Phase 6 commands behind ⌘K, menus and shortcuts: `executeSmartAction('toggle-code')`. Returns false for names that are not ours. */
import { useSmart } from '../../store/smartStore';
import { openUmlImport } from '../../components/uml/umlDialogs';
import { runAlignGroups, runLayout, runSeparateLabels } from './layoutBridge';
import type { LayoutAlgo } from '@core/layout';
import { useDiagramStore } from '../../store/diagramStore';
import { toast } from '../../store/toastStore';
import { downloadText, exportFileName } from '../export';
import { setNodeCapacity } from './capacityBridge';
import { activePage } from '../dsl/bridge';
import { useEditorSession } from '../../sync/status';
import { SIM_ENTRY_RPS } from '../../hooks/useCapacity';
import { roleOf } from '@core/lint';
import { sourceText } from '../sdd/sdd';

export function executeSmartAction(action: string): boolean {
  const [name, ...rest] = action.split(':');
  const arg = rest.join(':');
  const smart = useSmart.getState();
  switch (name) {
    case 'toggle-code': smart.toggleCode(); return true;
    case 'problems-toggle': smart.setProblems(!smart.problems); return true;
    case 'capacity-toggle': smart.setCapacity(!smart.capacity); return true;
    case 'metrics-toggle': smart.setMetrics(!smart.metrics); return true;
    case 'simulate-toggle': toggleSimulation(); return true;
    case 'chaos-down': case 'chaos-slow': {
      const id = arg;
      const want = name === 'chaos-down' ? 'down' : 'slow';
      smart.setChaosNode(id, smart.chaosNodes[id] === want ? null : want);
      smart.setMetrics(true);
      return true;
    }
    case 'chaos-reset': smart.resetChaos(); return true;
    case 'diff-open': void import('../../components/smart/ReviewCompare').then((m) => m.openCompare()); return true;
    case 'timeline-open': void import('../../versions/timelineActions').then((m) => m.openTimelineForCurrent()); return true;
    case 'import-infra': void import('../../components/smart/InfraImport').then((m) => m.openInfraImport()); return true;
    case 'import-db': void import('../../components/smart/SchemaTools').then((m) => m.openLiveDbImport()); return true;
    case 'migration-sql': void import('../../components/smart/SchemaTools').then((m) => m.openMigration()); return true;
    case 'uml-sync': void openUmlImport({ sync: true }); return true;
    case 'layout': { // layout:<algo>[:LR|TB]
      const [algo, dir] = arg.split(':');
      runLayout(algo as LayoutAlgo, { direction: dir === 'TB' ? 'TB' : 'LR' });
      return true;
    }
    case 'layout-sel': runLayout(arg as LayoutAlgo, { selection: true }); return true;
    case 'separate-labels': runSeparateLabels(); return true;
    case 'align-groups': runAlignGroups(arg === 'column' ? 'column' : 'row'); return true;
    case 'export-text': {
      const project = useDiagramStore.getState().toProject();
      downloadText(sourceText(project), exportFileName(project.name, 'sdd'), 'text/vnd.sdd');
      toast.success('Exported as text .sdd');
      return true;
    }
    default: return false;
  }
}

/** one-click simulation: seed entry traffic when the page has none (a doc edit, one undo step; not for read-only), then show metrics + overlay + flow */
export function toggleSimulation(): void {
  const smart = useSmart.getState();
  if (smart.simulating) {
    smart.setSimulating(false);
    smart.setMetrics(false);
    smart.resetChaos();
    return;
  }
  const page = activePage();
  const ids = new Set(page.nodes.map((n) => n.id));
  const edges = page.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
  if (!edges.length) { toast.info('Add components and connect them to simulate'); return; }
  const hasRps = page.nodes.some((n) => Number((n.data.capacity as { rps?: number } | undefined)?.rps) > 0);
  if (!hasRps && !useEditorSession.getState().readOnly) {
    const entry = pickEntryNode(page);
    if (entry) {
      setNodeCapacity(entry.id, { rps: SIM_ENTRY_RPS });
      toast.info(`Entry traffic set to ${SIM_ENTRY_RPS} rps on ${String(entry.data.label ?? entry.id)} — change it in Capacity`);
    }
  }
  smart.setSimulating(true);
  smart.setMetrics(true);
}

/** entry = node with outgoing edges and no incoming ones; a client wins, else the first in input order */
function pickEntryNode(page: ReturnType<typeof activePage>) {
  const entries = page.nodes.filter((n) => page.edges.some((e) => e.source === n.id && e.target !== n.id) && !page.edges.some((e) => e.target === n.id && e.source !== n.id));
  const pool = entries.length ? entries : page.nodes.filter((n) => page.edges.some((e) => e.source === n.id));
  return pool.find((n) => roleOf(n) === 'client') ?? pool[0];
}
