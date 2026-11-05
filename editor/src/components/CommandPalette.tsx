import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { AnimatePresence, motion } from 'motion/react';
import { Search } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { useDiagramStore } from '../store/diagramStore';
import { useSettingsStore } from '../store/settingsStore';
import { useLayoutStore } from '../store/layoutStore';
import { useBoardStore } from '../store/boardStore';
import { mmPromote } from '../lib/board/actions';
import { rankCommands, type Command } from '../lib/commands';
import { searchTables } from '../lib/er/search';
import { searchClasses } from '../lib/uml/search';
import { listModels } from '../lib/uml/shared';
import { fuzzyScore } from '../lib/commands';
import { searchItems } from '../data/catalog';
import { createNodesFromPaletteItem } from '../data/palette';
import { newId } from '../lib/graph';
import { editNewNode } from '../lib/editOnAdd';
import { useClickAdd } from '../hooks/useClickAdd';
import { ALL_TEMPLATES } from '../templates';
import { executeAction } from '../lib/actions';
import { useExport } from '../hooks/useExport';
import { useFit } from '../hooks/useFit';
import { toast } from '../store/toastStore';
import { IconGlyph } from './IconGlyph';
import { createFileIn, newFileDialog } from '../workspace/actions';
import { useWorkspace } from '../workspace/store';
import { useEditorSession } from '../sync/status';
import { usePreviewing } from '../versions/timelineStore';
import { t, useLang } from '../i18n';

/** ⌘K: run any action, add a component, switch pages or insert a template, all from the keyboard. */
export function CommandPalette() {
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { zoomTo } = useReactFlow();
  const sessionReadOnly = useEditorSession((st) => st.readOnly); // view-only roles (viewer share link, viewer member) must not add components
  const previewing = usePreviewing(); // a past version is on the canvas: an added node would land in the hidden live document
  const readOnly = sessionReadOnly || previewing;
  const clickAddNodes = useClickAdd();
  const fit = useFit();
  const doExport = useExport();
  const lang = useLang();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUiStore.getState().setCommandOpen(!useUiStore.getState().commandOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    // clear on close as well as on open: the next open then renders empty at once, so fast typing (or a test driver) never lands in the old text
    setQuery('');
    setActive(0);
    if (open) queueMicrotask(() => inputRef.current?.focus());
  }, [open]);

  const base = useMemo<Command[]>(() => {
    const st = () => useDiagramStore.getState();
    const ui = () => useUiStore.getState();
    const cmd = (id: string, title: string, section: string, run: () => void, shortcut?: string, keywords?: string[]): Command => ({ id, title: t(title), section: t(section), run, shortcut, keywords });
    return [
      cmd('undo', 'Undo', 'Edit', () => st().undo(), '⌘Z'),
      cmd('redo', 'Redo', 'Edit', () => st().redo(), '⇧⌘Z'),
      cmd('select-all', 'Select all', 'Edit', () => st().selectAll(), '⌘A'),
      cmd('auto-arrange', 'Auto layout (arrange the page, or the selection)', 'Layout', () => executeAction('auto-arrange', { fitView: () => fit(300) }), '⇧L', ['auto arrange', 'tidy', 'organise', 'organize', 'layout', 'auto-layout', 'hierarchy', 'erd', 'uml']),
      cmd('auto-arrange-page', 'Auto layout: whole page', 'Layout', () => executeAction('auto-arrange:page', { fitView: () => fit(300) }), undefined, ['auto arrange', 'tidy', 'layout']),
      cmd('tidy', 'Re-route all edges', 'Edit', () => st().tidyEdges(), undefined, ['tidy', 'auto route']),
      cmd('fit', 'Zoom to fit', 'View', () => fit(200), '⇧1'),
      cmd('zoom100', 'Reset zoom to 100%', 'View', () => void zoomTo(1, { duration: 150 }), '⌘0'),
      cmd('grid', 'Toggle grid', 'View', () => ui().toggleGrid()),
      cmd('snap', 'Toggle snap to grid', 'View', () => ui().toggleSnap()),
      cmd('flow', 'Toggle data flow (animate packets on every edge)', 'View', () => executeAction('toggle-flow'), '⇧F', ['animate', 'packets', 'traffic', 'show data flow']),
      cmd('minimap', 'Toggle minimap', 'View', () => ui().toggleMinimap(), undefined, ['map', 'overview']),
      cmd('sidebar', 'Toggle components panel', 'View', () => useLayoutStore.getState().toggleSidebar(), '⌘\\'),
      cmd('inspector', 'Toggle inspector', 'View', () => useLayoutStore.getState().toggleInspector()),
      ...([['straight', 'Straight'], ['orthogonal', 'Orthogonal'], ['curved', 'Curved'], ['step-rounded', 'Rounded orthogonal']] as const).map(([k, label]) =>
        cmd(`line-${k}`, t('Line style: {x}', { x: t(label) }), 'View', () => useSettingsStore.getState().setLineStyle(k), undefined, ['edges', 'connector', 'bezier', 'smoothstep']),
      ),
      cmd('er-import', 'Import database schema (SQL, Mermaid, DBML, Seedora)…', 'Database', () => executeAction('er-import'), undefined, ['er', 'erd', 'ddl', 'sql', 'schema', 'import']),
      cmd('er-export', 'Export database schema (SQL, Mermaid, DBML, Seedora)…', 'Database', () => executeAction('er-export'), undefined, ['er', 'erd', 'ddl', 'sql', 'schema', 'export', 'mermaid', 'dbml']),
      cmd('er-tidy', 'Tidy ER (auto-layout tables)', 'Database', () => executeAction('tidy-er'), undefined, ['er', 'erd', 'layout', 'arrange', 'tables']),
      cmd('er-table', 'Add table', 'Database', () => executeAction('er-add-table'), undefined, ['er', 'erd', 'entity']),
      cmd('er-collapse-all', 'Collapse all tables', 'Database', () => executeAction('er-collapse-all'), undefined, ['er', 'keys', 'fold']),
      cmd('er-sql-panel', 'Toggle live SQL preview', 'Database', () => executeAction('er-sql-panel'), undefined, ['er', 'sql', 'ddl', 'code']),
      cmd('er-expand-all', 'Expand all tables', 'Database', () => executeAction('er-expand-all'), undefined, ['er', 'unfold']),
      cmd('uml-import', 'Import code or diagram text… (TypeScript, Java, Python, Go, C#, Mermaid, PlantUML)', 'UML', () => executeAction('uml-import'), undefined, ['uml', 'class', 'sequence', 'state', 'activity', 'import', 'typescript', 'java', 'python', 'go', 'golang', 'csharp', 'c#', 'mermaid', 'plantuml', 'code']),
      cmd('uml-sync', 'Update this class diagram from code (re-import, keep positions, review drift)…', 'UML', () => executeAction('uml-sync'), undefined, ['uml', 'class', 'sync', 'drift', 'reimport', 'code', 'update', 'typescript', 'java']),
      cmd('uml-export', 'Export UML… (class, sequence, state: Mermaid, PlantUML, TypeScript, Java)', 'UML', () => executeAction('uml-export'), undefined, ['uml', 'class', 'sequence', 'state', 'activity', 'export', 'mermaid', 'plantuml', 'typescript', 'java', 'skeleton']),
      cmd('uml-existing', 'Add existing class (shared model): type "existing" and a class name', 'UML', () => undefined, undefined, ['uml', 'class', 'existing', 'shared', 'linked', 'model', 'reuse', 'copy']),
      cmd('uml-unlink', 'Unlink the selected class from its shared model', 'UML', () => { const n = st().nodes.find((x) => x.selected && x.type === 'class'); if (n) executeAction('class-unlink', { nodeId: n.id }); }, undefined, ['uml', 'class', 'shared', 'linked', 'detach', 'independent']),
      cmd('uml-link-refs', 'Link lifelines and objects that have the selected class name to it', 'UML', () => { const n = st().nodes.find((x) => x.selected && x.type === 'class'); if (n) executeAction('class-link-refs', { nodeId: n.id }); }, undefined, ['uml', 'sequence', 'object', 'shared', 'rename', 'follow']),
      cmd('uml-tidy', 'Tidy UML (auto-layout classes)', 'UML', () => executeAction('tidy-uml'), undefined, ['uml', 'class', 'layout', 'arrange', 'hierarchy']),
      ...([
        ['uml-sequence', 'Add sequence diagram (participants, lifelines, messages)', ['sequence', 'lifeline', 'message', 'interaction']],
        ['uml-lifeline', 'Add lifeline', ['sequence', 'participant']],
        ['uml-state', 'Add state', ['state', 'statechart', 'fsm']],
        ['uml-state-composite', 'Add composite state', ['state', 'nested', 'substate']],
        ['uml-initial', 'Add initial state', ['state', 'start']],
        ['uml-final', 'Add final state', ['state', 'end']],
        ['uml-choice', 'Add choice (decision)', ['state', 'branch']],
        ['uml-fork', 'Add fork bar', ['state', 'parallel']],
        ['uml-join', 'Add join bar', ['state', 'parallel']],
        ['uml-history', 'Add history state (H)', ['state', 'resume']],
        ['uml-entry-point', 'Add entry point', ['state', 'port', 'border']],
        ['uml-exit-point', 'Add exit point', ['state', 'port', 'border']],
        ['uml-actor', 'Add actor', ['usecase', 'user', 'stick figure']],
        ['uml-usecase', 'Add use case', ['usecase', 'ellipse']],
        ['uml-system', 'Add system boundary', ['usecase', 'scope']],
        ['uml-act-initial', 'Add activity initial node', ['activity', 'start']],
        ['uml-act-final', 'Add activity final node', ['activity', 'end', 'stop']],
        ['uml-act-flow-final', 'Add flow final node', ['activity', 'end']],
        ['uml-act-action', 'Add activity action', ['activity', 'step', 'task']],
        ['uml-act-decision', 'Add activity decision / merge', ['activity', 'branch', 'guard']],
        ['uml-act-fork', 'Add activity fork / join bar', ['activity', 'parallel']],
        ['uml-act-object', 'Add activity object node', ['activity', 'object']],
        ['uml-act-send', 'Add send signal', ['activity', 'signal', 'event']],
        ['uml-act-accept', 'Add accept event', ['activity', 'signal', 'event']],
        ['uml-act-note', 'Add activity note', ['activity', 'comment']],
        ['uml-act-lane-v', 'Add swimlane (column)', ['activity', 'partition', 'lane']],
        ['uml-act-lane-h', 'Add swimlane (row)', ['activity', 'partition', 'lane']],
        ['uml-component', 'Add component', ['component', 'module']],
        ['uml-provided', 'Add provided interface (lollipop)', ['component', 'interface', 'lollipop']],
        ['uml-required', 'Add required interface (socket)', ['component', 'interface', 'socket']],
        ['uml-node', 'Add deployment node', ['component', 'deployment', 'server']],
        ['uml-artifact', 'Add artifact', ['component', 'deployment', 'file']],
        ['uml-dep-node', 'Add deployment node (3D box)', ['deployment', 'server', 'infrastructure']],
        ['uml-dep-device', 'Add deployment device', ['deployment', 'hardware', 'phone']],
        ['uml-dep-env', 'Add execution environment', ['deployment', 'runtime', 'jvm', 'docker']],
        ['uml-dep-artifact', 'Add deployment artifact', ['deployment', 'jar', 'war', 'file']],
        ['uml-dep-component', 'Add deployed component', ['deployment', 'component', 'manifest']],
        ['uml-pkg-package', 'Add package (package diagram)', ['package', 'namespace', 'module', 'folder']],
        ['uml-obj', 'Add object (instance specification)', ['object', 'instance', 'slots']],
        ['uml-comm-object', 'Add communication object (numbered messages on links)', ['communication', 'collaboration', 'object', 'message']],
        ['uml-timing', 'Add timing diagram (lifelines, state changes, time axis)', ['timing', 'waveform', 'signal', 'robust', 'concise']],
        ['uml-timing-lifeline', 'Add timing lifeline (empty frame)', ['timing', 'lifeline', 'signal']],
      ] as const).map(([item, title, kw]) => cmd(`uml-add-${item}`, title, 'UML', () => executeAction(`uml-add:${item}`), undefined, ['uml', ...kw])),
      cmd('uml-state-tidy', 'Tidy states (auto-layout state machine)', 'UML', () => executeAction('tidy-state'), undefined, ['uml', 'state', 'layout', 'arrange']),
      cmd('uml-usecase-tidy', 'Tidy use cases (actors left / right, use cases in the system)', 'UML', () => executeAction('tidy-usecase'), undefined, ['uml', 'use case', 'actor', 'layout', 'arrange']),
      cmd('uml-activity-tidy', 'Tidy activity (layered auto-layout, swimlanes respected)', 'UML', () => executeAction('tidy-activity'), undefined, ['uml', 'activity', 'swimlane', 'layout', 'arrange', 'flow']),
      cmd('uml-deployment-tidy', 'Tidy deployment (auto-layout deployment diagram)', 'UML', () => executeAction('tidy-deployment'), undefined, ['uml', 'deployment', 'node', 'artifact', 'layout', 'arrange']),
      cmd('uml-deployment-nest', 'Deployment: put selected elements into a new node', 'UML', () => executeAction('dep-nest'), undefined, ['uml', 'deployment', 'nest', 'container', 'node']),
      cmd('uml-package-tidy', 'Tidy packages (layered by dependency)', 'UML', () => executeAction('tidy-packages'), undefined, ['uml', 'package', 'layout', 'arrange', 'dependency']),
      cmd('uml-package-nest', 'Package: put selected packages / classes into a new package', 'UML', () => executeAction('pkg-nest'), undefined, ['uml', 'package', 'nest', 'container', 'namespace']),
      cmd('uml-object-tidy', 'Tidy objects (auto-layout object diagram)', 'UML', () => executeAction('tidy-objects'), undefined, ['uml', 'object', 'instance', 'layout', 'arrange']),
      cmd('uml-object-instantiate', 'Create object from selected class (slots from its attributes)', 'UML', () => executeAction('instantiate-class'), undefined, ['uml', 'object', 'instance', 'instantiate', 'class', 'slots']),
      cmd('uml-object-slot', 'Object: add slot', 'UML', () => executeAction('obj-add-slot'), undefined, ['uml', 'object', 'slot', 'attribute']),
      cmd('uml-comm-message', 'Communication: add numbered message to the selected link (or two selected objects)', 'UML', () => executeAction('comm-add-message'), undefined, ['uml', 'communication', 'collaboration', 'message', 'numbered', 'link', '1.1']),
      cmd('uml-comm-renumber', 'Communication: renumber messages (1, 1.1, 2)', 'UML', () => executeAction('comm-renumber'), undefined, ['uml', 'communication', 'message', 'renumber', 'order']),
      cmd('uml-comm-tidy', 'Tidy communication diagram (auto-layout objects)', 'UML', () => executeAction('tidy-objects'), undefined, ['uml', 'communication', 'object', 'layout', 'arrange']),
      cmd('uml-seq-to-comm', 'Convert selected sequence frame to a communication diagram (reports what is lost)', 'UML', () => executeAction('seq-to-comm'), undefined, ['uml', 'sequence', 'communication', 'convert', 'collaboration', 'fragment']),
      cmd('uml-comm-to-seq', 'Convert communication diagram to a sequence diagram (reports what is lost)', 'UML', () => executeAction('comm-to-seq'), undefined, ['uml', 'sequence', 'communication', 'convert', 'collaboration']),
      cmd('uml-timing-lifeline-add', 'Timing: add lifeline (robust)', 'UML', () => executeAction('timing-add-lifeline:robust'), undefined, ['uml', 'timing', 'lifeline', 'robust', 'state rows']),
      cmd('uml-timing-concise-add', 'Timing: add concise lifeline', 'UML', () => executeAction('timing-add-lifeline:concise'), undefined, ['uml', 'timing', 'lifeline', 'concise', 'bands']),
      cmd('uml-timing-binary-add', 'Timing: add binary lifeline (high / low)', 'UML', () => executeAction('timing-add-lifeline:binary'), undefined, ['uml', 'timing', 'lifeline', 'binary', 'digital']),
      cmd('uml-timing-clock-add', 'Timing: add clock', 'UML', () => executeAction('timing-add-lifeline:clock'), undefined, ['uml', 'timing', 'clock', 'period']),
      cmd('uml-timing-change', 'Timing: add state change', 'UML', () => executeAction('timing-add-change'), undefined, ['uml', 'timing', 'state', 'change', 'time']),
      cmd('uml-timing-message', 'Timing: add message between lifelines', 'UML', () => executeAction('timing-add-message'), undefined, ['uml', 'timing', 'message', 'arrow']),
      cmd('uml-timing-constraint', 'Timing: add duration constraint', 'UML', () => executeAction('timing-add-constraint'), undefined, ['uml', 'timing', 'duration', 'constraint']),
      cmd('uml-timing-tidy', 'Tidy timing diagram (sort, snap, fit the axis)', 'UML', () => executeAction('tidy-timing'), undefined, ['uml', 'timing', 'layout', 'arrange', 'snap']),
      cmd('uml-component-tidy', 'Tidy components (auto-layout component diagram)', 'UML', () => executeAction('tidy-component'), undefined, ['uml', 'component', 'layout', 'arrange', 'deployment']),
      cmd('uml-component-port-provided', 'Component: add provided interface port', 'UML', () => executeAction('comp-port:provided'), undefined, ['uml', 'component', 'port', 'interface', 'lollipop']),
      cmd('uml-component-port-required', 'Component: add required interface port', 'UML', () => executeAction('comp-port:required'), undefined, ['uml', 'component', 'port', 'interface', 'socket']),
      cmd('uml-component-nest', 'Component: put selected components into a new node', 'UML', () => executeAction('comp-nest'), undefined, ['uml', 'component', 'nest', 'deployment', 'container']),
      cmd('uml-usecase-ext', 'Use case: add extension point', 'UML', () => executeAction('uc-extension-point'), undefined, ['uml', 'use case', 'extend']),
      cmd('uml-seq-numbering', 'Sequence diagram: toggle message numbering', 'UML', () => executeAction('seq-numbering'), undefined, ['uml', 'sequence', 'autonumber']),
      cmd('uml-seq-participant', 'Sequence diagram: add participant', 'UML', () => executeAction('seq-add-participant'), undefined, ['uml', 'sequence', 'lifeline']),
      cmd('uml-seq-message', 'Sequence diagram: add message', 'UML', () => executeAction('seq-add-message'), undefined, ['uml', 'sequence', 'arrow']),
      cmd('uml-anchor', 'Toggle: attach UML associations at attribute rows', 'UML', () => executeAction('uml-anchor-toggle'), undefined, ['uml', 'class', 'association', 'anchor', 'attribute', 'row']),
      cmd('uml-class', 'Add class', 'UML', () => executeAction('uml-add-class'), undefined, ['uml', 'class', 'oop']),
      ...([
        ['board-tool:sticky', 'Sticky note (click to place, Tab for the next one)', 'S', ['sticky', 'post-it', 'note', 'idea']],
        ['board-tool:frame', 'Frame (drag to draw a named area)', 'F', ['section', 'slide', 'area']],
        ['board-tool:mindmap', 'Mind map (click to start one)', 'W', ['tree', 'branch', 'outline']],
        ['board-tool:pen', 'Pen (freehand)', 'P', ['draw', 'sketch', 'ink']],
        ['board-tool:highlighter', 'Highlighter', 'L', ['marker', 'draw']],
        ['board-tool:eraser', 'Eraser (removes strokes)', 'E', ['rubber', 'draw', 'delete']],
        ['board-tool:stamp', 'Stamp (place an emoji)', undefined, ['emoji', 'sticker', 'reaction']],
        ['board-tool:text', 'Text box', 'T', ['label', 'title']],
      ] as const).map(([a, title, key, kw]) => cmd(`b-${a}`, title, 'Board', () => executeAction(a), key, ['board', 'whiteboard', ...kw])),
      cmd('code-toggle', 'Diagram as code: text view next to the canvas (.sdd)', 'Smart', () => executeAction('toggle-code'), '⇧⌘E', ['dsl', 'text', 'split', 'code', 'sdd', 'diagrams as code', 'editor']),
      ...([
        ['layered:LR', 'Layered, left to right', ['flow', 'sugiyama', 'hierarchy', 'arrange']],
        ['layered:TB', 'Layered, top to bottom', ['flow', 'sugiyama', 'hierarchy', 'arrange']],
        ['orthogonal', 'Orthogonal (grid-snapped, right-angle edges)', ['manhattan', 'snap', 'arrange']],
        ['tree:TB', 'Tree, top to bottom', ['hierarchy', 'org chart', 'arrange']],
        ['tree:LR', 'Tree, left to right', ['hierarchy', 'arrange']],
        ['radial', 'Radial (rings around a root)', ['circle', 'rings', 'arrange']],
        ['force', 'Force-directed (deterministic)', ['spring', 'organic', 'network', 'arrange']],
        ['grid', 'Compact grid', ['tidy', 'rows', 'arrange']],
      ] as const).map(([a, title, kw]) => cmd(`layout-${a}`, t('Layout: {x}', { x: t(title) }), 'Layout', () => executeAction(`layout:${a}`), undefined, ['auto layout', 'tidy', ...kw])),
      cmd('layout-tidy-sel', 'Tidy selection (lay out only the selected components)', 'Layout', () => executeAction('layout-sel:layered'), undefined, ['arrange', 'selection', 'tidy up']),
      cmd('layout-labels', 'Remove edge label overlaps', 'Layout', () => executeAction('separate-labels'), undefined, ['labels', 'overlap', 'text', 'tidy']),
      cmd('layout-groups-row', 'Align groups in a row', 'Layout', () => executeAction('align-groups:row'), undefined, ['boundary', 'container', 'vpc', 'align']),
      cmd('layout-groups-col', 'Align groups in a column', 'Layout', () => executeAction('align-groups:column'), undefined, ['boundary', 'container', 'vpc', 'align']),
      cmd('capacity', 'Capacity & latency: bottlenecks, worst-case path, storage growth, rough cost', 'Smart', () => executeAction('capacity-toggle'), undefined, ['rps', 'load', 'throughput', 'latency', 'p99', 'cost', 'price', 'estimate', 'bottleneck', 'capacity planning']),
      cmd('compare', 'Compare with another file or version… (diff and review)', 'Smart', () => executeAction('diff-open'), undefined, ['diff', 'review', 'changes', 'compare', 'version', 'report', 'pull request']),
      cmd('version-timeline', 'Version timeline: scrub, play and restore earlier versions', 'Smart', () => executeAction('timeline-open'), undefined, ['history', 'versions', 'timeline', 'restore', 'previous', 'play', 'replay', 'snapshot']),
      cmd('problems', 'Problems: lint this diagram (single points of failure, missing keys, cycles...)', 'Smart', () => executeAction('problems-toggle'), undefined, ['lint', 'check', 'validate', 'warnings', 'errors', 'rules']),
      cmd('import-infra', 'Import infrastructure: Terraform, Kubernetes, docker-compose, CloudFormation…', 'Smart', () => executeAction('import-infra'), undefined, ['terraform', 'tf', 'hcl', 'k8s', 'kubernetes', 'helm', 'compose', 'docker', 'cloudformation', 'cfn', 'aws', 'iac', 'infra', 'import']),
      cmd('import-db', 'Import schema from a live database: PostgreSQL, MySQL, SQLite (read-only)…', 'Database', () => executeAction('import-db'), undefined, ['er', 'erd', 'introspect', 'reverse engineer', 'postgres', 'mysql', 'sqlite', 'connect', 'schema']),
      cmd('migration-sql', 'Migration SQL from changes between two versions of the ERD…', 'Database', () => executeAction('migration-sql'), undefined, ['er', 'erd', 'alter', 'migrate', 'diff', 'ddl', 'schema', 'down']),
      cmd('export-text', 'Export as text (.sdd, diagrams as code)', 'Smart', () => executeAction('export-text'), undefined, ['dsl', 'text', 'sdd', 'export', 'code', 'source']),
      cmd('a-outline', 'Outline (screen-reader tree)', 'View', () => executeAction('outline-toggle'), 'Shift+O', ['accessibility', 'a11y', 'screen reader', 'tree', 'pages', 'connections']),
      cmd('a-connect', 'Connect selected node to another (keyboard)', 'Edit', () => executeAction('connect-start'), 'Shift+C', ['accessibility', 'link', 'edge', 'arrow']),
      cmd('d-layers', 'Layers panel (toggle)', 'Design', () => executeAction('layers-toggle'), undefined, ['tree', 'z-order', 'hide', 'lock', 'rename']),
      cmd('d-component', 'Create component from selection', 'Design', () => executeAction('create-component'), undefined, ['main', 'master', 'reusable', 'symbol']),
      cmd('d-detach', 'Detach instance', 'Design', () => executeAction('detach-instance'), undefined, ['component', 'instance']),
      cmd('d-main', 'Go to main component', 'Design', () => executeAction('go-to-main'), undefined, ['component', 'instance']),
      cmd('d-reset', 'Reset instance overrides', 'Design', () => executeAction('reset-overrides'), undefined, ['component', 'instance']),
      cmd('d-al-row', 'Auto layout: row (wrap selection)', 'Design', () => executeAction('auto-layout:row'), undefined, ['stack', 'flex', 'horizontal']),
      cmd('d-al-col', 'Auto layout: column (wrap selection)', 'Design', () => executeAction('auto-layout:column'), undefined, ['stack', 'flex', 'vertical']),
      cmd('d-al-grid', 'Auto layout: grid (wrap selection)', 'Design', () => executeAction('auto-layout:grid'), undefined, ['stack', 'cards']),
      cmd('d-al-off', 'Remove auto layout', 'Design', () => executeAction('auto-layout:off'), undefined, ['stack']),
      cmd('d-hide', 'Hide / show selection', 'Design', () => executeAction('toggle-hidden'), undefined, ['layers', 'visibility']),
      cmd('d-rulers', 'Rulers and guides (toggle)', 'Design', () => executeAction('rulers-toggle'), '⇧R', ['guides', 'measure', 'precision']),
      cmd('d-dev', 'Dev mode (toggle)', 'Design', () => executeAction('dev-toggle'), '⇧D', ['inspect', 'handoff', 'code', 'snippets']),
      cmd('d-link', 'Follow link of the selected node', 'Design', () => executeAction('link-follow'), '⌘ click', ['prototype', 'drill down']),
      cmd('d-back', 'Back to where the link started', 'Design', () => executeAction('link-back'), undefined, ['breadcrumb', 'prototype']),
      cmd('d-plugins', 'Plugins…', 'Design', () => executeAction('plugins-open'), undefined, ['extension', 'automation', 'script']),
      cmd('b-new-mm', 'New mind map (central topic, ready to type)', 'Board', () => executeAction('board-mindmap'), 'W', ['board', 'mind map', 'brainstorm', 'start']),
      cmd('b-mm-promote', 'Mind map: promote the selected topic (Shift+Tab)', 'Board', () => { const n = st().nodes.find((x) => x.selected && x.type === 'mindmap'); if (n) mmPromote(n.id); }, undefined, ['board', 'mind map', 'outdent']),
      cmd('b-frame-sel', 'Frame the selection', 'Board', () => executeAction('board-frame'), undefined, ['board', 'wrap', 'section']),
      cmd('b-arr-grid', 'Arrange selected stickies as a grid', 'Board', () => executeAction('board-arrange:grid'), undefined, ['board', 'cluster', 'tidy', 'sticky']),
      cmd('b-arr-color', 'Group selected stickies by colour', 'Board', () => executeAction('board-arrange:color'), undefined, ['board', 'cluster', 'sort', 'sticky']),
      cmd('b-private', 'Private stickies: hide new stickies from others until revealed (toggle)', 'Board', () => executeAction('board-private'), undefined, ['board', 'hidden', 'secret', 'facilitator', 'anonymous']),
      cmd('b-reveal', 'Reveal all hidden stickies', 'Board', () => executeAction('board-reveal'), undefined, ['board', 'private', 'facilitator', 'show']),
      cmd('b-author', 'Tag new stickies with my name (toggle)', 'Board', () => executeAction('board-author'), undefined, ['board', 'author', 'who']),
      cmd('b-recognize', 'Pen: recognise shapes (toggle)', 'Board', () => executeAction('board-recognize'), undefined, ['board', 'draw', 'circle', 'rectangle', 'arrow', 'clean']),
      cmd('b-frames', 'Frames…', 'Board', () => executeAction('board-frames'), undefined, ['board', 'list', 'order', 'sections']),
      cmd('b-present', 'Present frames (fullscreen)', 'Board', () => executeAction('board-present'), undefined, ['board', 'slideshow', 'presentation', 'laser', 'spotlight']),
      cmd('b-frame-link', 'Copy link to the selected frame', 'Board', () => executeAction('board-frame-link'), undefined, ['board', 'share', 'deep link']),
      cmd('b-summon', 'Bring everyone to me', 'Board', () => executeAction('board-summon'), undefined, ['board', 'follow', 'facilitate', 'gather']),
      cmd('b-react', 'Send a reaction or place a stamp…', 'Board', () => useBoardStore.getState().set({ popover: 'emoji' }), undefined, ['board', 'emoji', 'react', 'thumbs']),
      cmd('b-mm-child', 'Mind map: add child', 'Board', () => executeAction('board-mm-child'), 'Tab', ['board', 'mind map', 'branch']),
      cmd('b-mm-sibling', 'Mind map: add sibling', 'Board', () => executeAction('board-mm-sibling'), 'Enter', ['board', 'mind map', 'branch']),
      cmd('b-mm-collapse', 'Mind map: collapse or expand branch', 'Board', () => executeAction('board-mm-collapse'), undefined, ['board', 'mind map', 'fold']),
      cmd('b-mm-layout', 'Mind map: auto-layout (balanced left and right)', 'Board', () => executeAction('board-mm-layout'), undefined, ['board', 'mind map', 'tidy', 'arrange']),
      cmd('b-mm-export', 'Mind map: copy outline as Markdown', 'Board', () => executeAction('board-mm-export'), undefined, ['board', 'mind map', 'export', 'outline']),
      cmd('b-mm-import', 'Mind map: create from the outline on the clipboard', 'Board', () => executeAction('board-mm-import'), undefined, ['board', 'mind map', 'import', 'outline', 'markdown']),
      cmd('b-help', 'Keyboard shortcuts', 'Help', () => executeAction('show-help'), '?', ['cheatsheet', 'keys', 'help', 'shortcuts']),
      cmd('file-new', 'New file', 'Files', () => void newFileDialog(null), undefined, ['create', 'canvas']),
      cmd('file-goto', 'Go to file…', 'Files', () => useWorkspace.getState().setQuickOpen(true), '⌘P', ['open', 'switch']),
      cmd('settings', 'Open settings', 'App', () => ui().setSettingsOpen(true), undefined, ['preferences', 'defaults']),
      cmd('png', 'Export page as PNG', 'Export', () => void doExport('png'), undefined, ['image', 'picture']),
      cmd('svg', 'Export page as SVG', 'Export', () => void doExport('svg'), undefined, ['vector']),
      cmd('group', 'Group selection', 'Arrange', () => executeAction('group'), '⌘G'),
      cmd('lock', 'Lock / unlock selection', 'Arrange', () => executeAction('toggle-lock'), '⇧⌘L'),
      cmd('delete', 'Delete selection', 'Edit', () => executeAction('delete'), '⌫'),
      ...ALL_TEMPLATES.flatMap((tpl) => [
        cmd(`tpl-page-${tpl.id}`, t('New file from template: {name}', { name: t(tpl.name) }), 'Templates', () => void createFileIn(null, tpl.name, { content: tpl.build() }), undefined, ['template', ...(tpl.tags ?? [])]),
        cmd(`tpl-ins-${tpl.id}`, t('Insert template here: {name}', { name: t(tpl.name) }), 'Templates', () => { st().insertContent(tpl.build(), { select: false }); toast.success(t('Inserted “{name}”', { name: t(tpl.name) })); }, undefined, ['template', ...(tpl.tags ?? [])]),
      ]),
    ];
  }, [fit, zoomTo, doExport, lang]);

  const results = useMemo(() => {
    // "Add existing class" only makes sense with a second page (the product has no page UI yet, so a single-page file never offers it)
    const multiPage = useDiagramStore.getState().pages.length > 1;
    const cmds = rankCommands(multiPage ? base : base.filter((c) => c.id !== 'uml-existing'), query, 40);
    const items: Command[] =
      query.trim().length >= 2 && !readOnly
        ? searchItems(query)
            .filter((i) => i.kind !== 'cluster' && i.kind !== 'uml-rel')
            .slice(0, 8)
            .map((item) => ({
              id: `add-${item.id}`,
              title: t('Add {name}', { name: item.label }),
              section: t('Add component'),
              run: () => {
                if (item.kind === 'tool') return useUiStore.getState().setTool(item.tool as never);
                const made = createNodesFromPaletteItem(item, { x: 0, y: 0 }, newId);
                clickAddNodes(made);
                editNewNode(made);
              },
              keywords: [item.id],
            }))
        : [];
    const tables: Command[] = searchTables(useDiagramStore.getState().nodes, query, 8).map((h) => ({
      id: `er-${h.kind}-${h.nodeId}-${h.title}`,
      title: `${h.kind === 'table' ? t('Go to table') : t('Go to column')}: ${h.title}`,
      section: t('Database'),
      keywords: [h.detail],
      run: () => {
        useDiagramStore.getState().selectOnly('node', h.nodeId);
        fit(200, [h.nodeId]);
      },
    }));
    const classes: Command[] = searchClasses(useDiagramStore.getState().nodes, query, 8).map((h) => ({
      id: `uml-${h.kind}-${h.nodeId}-${h.title}`,
      title: `${h.kind === 'class' ? t('Go to class') : t('Go to member')}: ${h.title}`,
      section: t('UML'),
      keywords: [h.detail],
      run: () => {
        useDiagramStore.getState().selectOnly('node', h.nodeId);
        fit(200, [h.nodeId]);
      },
    }));
    // "Add existing class": classes of this file (other pages) placed here as a linked copy
    const q = query.trim().toLowerCase();
    const asks = /^(add )?(existing|shared|linked)/.test(q);
    const needle = q.replace(/^(add )?(existing|shared|linked)( class)?:?\s*/, '');
    const existing: Command[] = readOnly || (!asks && q.length < 2) ? [] : listModels(useDiagramStore.getState())
      .filter((m) => !m.onThisPage && (asks ? !needle || fuzzyScore(needle, m.label) >= 0 : fuzzyScore(q, m.label) >= 0))
      .slice(0, 8)
      .map((m) => ({
        id: `uml-existing-${m.pageId}-${m.nodeId}`,
        title: t('Add existing class: {name} ({page})', { name: m.label, page: m.pageName }),
        section: t('UML'),
        keywords: ['existing', 'shared', 'linked'],
        run: () => {
          const id = useDiagramStore.getState().addLinkedClass({ pageId: m.pageId, nodeId: m.nodeId });
          if (id) { useDiagramStore.getState().selectOnly('node', id); toast.success(t('Added a linked copy of {name}', { name: m.label })); }
        },
      }));
    return [...cmds, ...existing, ...tables, ...classes, ...items];
  }, [base, query, clickAddNodes, fit, readOnly, lang]);

  useEffect(() => setActive(0), [query]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    queueMicrotask(c.run);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="cmdk-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <motion.div className="cmdk" role="dialog" aria-label={t('Command palette')} initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ type: 'spring', stiffness: 520, damping: 38 }}>
            <div className="cmdk-input">
              <Search size={16} aria-hidden />
              <input
                ref={inputRef}
                value={query}
                placeholder={t('Type a command or search components…')}
                aria-label={t('Command')}
                role="combobox"
                aria-expanded="true"
                aria-controls="cmdk-list"
                aria-activedescendant={results[active] ? `cmdk-${results[active].id}` : undefined}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                  else if (e.key === 'Enter') { e.preventDefault(); run(results[active]); }
                  else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
                }}
              />
              <kbd>esc</kbd>
            </div>
            <ul id="cmdk-list" className="cmdk-list" role="listbox" aria-label={t('Commands')}>
              {results.length === 0 && <li className="cmdk-empty">{t('No matching commands')}</li>}
              {results.map((c, i) => (
                <motion.li
                  key={c.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, delay: Math.min(i, 8) * 0.018 }}
                  id={`cmdk-${c.id}`}
                  role="option"
                  aria-selected={i === active}
                  className={`cmdk-item${i === active ? ' active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); run(c); }}
                >
                  {i === active && <motion.span layoutId="cmdk-pill" className="cmdk-pill" transition={{ type: 'spring', stiffness: 600, damping: 42 }} />}
                  {c.id.startsWith('add-') ? <IconGlyph iconId={c.id.slice(4)} size={18} /> : <span className="cmdk-dot" aria-hidden />}
                  <span className="cmdk-title">{c.title}</span>
                  <span className="cmdk-section">{c.section}</span>
                  {c.shortcut ? <kbd>{c.shortcut}</kbd> : null}
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
