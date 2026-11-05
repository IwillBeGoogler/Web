/** Phase 6 commands behind ⌘K, menus and shortcuts: `executeSmartAction('toggle-code')`. Returns false for names that are not ours. */
import { useSmart } from '../../store/smartStore';
import { openUmlImport } from '../../components/uml/umlDialogs';
import { runAlignGroups, runLayout, runSeparateLabels } from './layoutBridge';
import type { LayoutAlgo } from '@core/layout';
import { useDiagramStore } from '../../store/diagramStore';
import { toast } from '../../store/toastStore';
import { downloadText, exportFileName } from '../export';
import { sourceText } from '../sdd/sdd';

export function executeSmartAction(action: string): boolean {
  const [name, ...rest] = action.split(':');
  const arg = rest.join(':');
  const smart = useSmart.getState();
  switch (name) {
    case 'toggle-code': smart.toggleCode(); return true;
    case 'problems-toggle': smart.setProblems(!smart.problems); return true;
    case 'capacity-toggle': smart.setCapacity(!smart.capacity); return true;
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
