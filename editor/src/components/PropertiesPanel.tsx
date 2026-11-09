import { BulkStyle } from './BulkStyle';
import { ScrubInput } from './ui/ScrubInput';
import { addTag, removeTag, TAG_COLORS, updateTag } from '../lib/card';
import { allEdgePresets } from '../lib/edgePresets';
import { useMemo, useState } from 'react';
import { EDGE_COLORS, type DiagramNode, type StrokeStyle, type TextAlign } from '../types';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useResolvedSettings } from '../store/settingsStore';
import { resolveEdgeStyle, resolveNodeStyle } from '../lib/settings';
import { resolveFlowDir, resolveFlowLook } from '../lib/flow/resolve';
import { FILL_PRESETS, STROKE_PRESETS } from '../lib/presets';
import { executeAction } from '../lib/actions';
import { useAccordion } from '../hooks/useAccordion';
import { Accordion } from './Accordion';
import { BufferedInput } from './BufferedInput';
import { ColorField } from './ui/ColorField';
import { Toggle } from './ui/Toggle';
import { Select, type SelectOption } from './ui/Select';
import { ButtonGrid, Chip, Field, InspectorHeader, Seg, Slider, SubHead, ToolButton } from './ui/Inspector';
import { IconGlyph } from './IconGlyph';
import { useIcon } from '../data/icons';
import { Box, Boxes, ChevronRight, Cable, Copy, Frame, Group as GroupIcon, Layers, Lock, LockOpen, Maximize2, MousePointer2, Minimize2, Network, Pencil, Plus, Replace, Settings2, Shapes, Smile, Spline, StickyNote, Table2, Trash2, Type, Workflow, Component as ComponentIcon, ArrowLeftRight, RotateCcw } from 'lucide-react';
import { CrossLinkInspector } from './crosslink/CrossLinks';
import { isArchTarget, isLinkSource } from '../lib/crosslink/links';
import { useEditorSession } from '../sync/status';
import { RelationInspector, TableInspector } from './er/ErInspector';
import { ClassInspector, DiagramKindInspector, UmlRelationInspector } from './uml/UmlInspector';
import { relationOf } from '../lib/er/tableData';
import { ROLES, validateRole } from '../clusters/roles';
import { EDGE_KINDS, REPL_MODES } from '../clusters/edgeKinds';
import { memberCount } from '../clusters/collapse';
import { toast } from '../store/toastStore';
import { STICKY_COLORS } from '../lib/board/sticky';
import { mmSetLabel, revealAll } from '../lib/board/actions';
import { designSections } from './design/DesignSections';
import { DevPanel } from './design/DevPanel';
import { useLibraryDoc } from '../lib/library/store';
import { ArchSection, hasArchSection } from './ArchSection';
import { t } from '../i18n';

const SECTION_IDS = ['general', 'cluster', 'style', 'text', 'arrange', 'instance', 'autolayout', 'constraints', 'link', 'styles', 'crosslinks', 'arch'] as const;
const DEFAULT_OPEN = { open: ['general', 'cluster', 'style', 'flow', 'crosslinks', 'arch'], multi: true };
const MARKERS: [string, string][] = [['none', 'None'], ['arrow', 'Arrow'], ['open', 'Open arrow'], ['triangle', 'Triangle'], ['diamond', 'Diamond'], ['circle', 'Circle'], ['crowfoot', 'Crow’s foot (ER)'], ['one', 'ER: exactly one'], ['zeroOrOne', 'ER: zero or one'], ['many', 'ER: many'], ['oneOrMany', 'ER: one or many'], ['zeroOrMany', 'ER: zero or many']];
const TOPOLOGIES = ['single-primary', 'multi-primary', 'sharded', 'ring', 'quorum'];

const Row = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => <Field label={label} hint={hint}>{children}</Field>;
const opts = <T extends string>(list: readonly T[], label?: (v: T) => string): SelectOption<T>[] => list.map((v) => ({ value: v, label: label ? label(v) : v }));
const ROLE_OPTS: SelectOption[] = [{ value: '', label: 'No role' }, ...opts(ROLES), { value: '__custom', label: 'Custom…' }];
const MARKER_OPTS: SelectOption[] = MARKERS.map(([value, label]) => ({ value, label }));
const TOPOLOGY_OPTS: SelectOption[] = [{ value: '', label: 'Unspecified' }, ...opts(TOPOLOGIES)];
const REPL_OPTS: SelectOption[] = [{ value: '', label: 'Default (async)' }, ...opts(REPL_MODES)];
const KIND_ICON: Record<string, typeof Box> = { icon: Box, group: GroupIcon, cluster: Boxes, text: Type, shape: Shapes, sticky: StickyNote, draw: Pencil, frame: Frame, mindmap: Network, stamp: Smile, card: Layers, junction: Cable, table: Table2, class: Boxes, sequence: Workflow, state: Workflow, usecase: Workflow, activity: Workflow, component: ComponentIcon, deployment: ComponentIcon, object: Boxes };
/** kinds whose label is edited right in the header card */
const TITLE_KINDS = new Set(['icon', 'group', 'cluster', 'shape', 'card', 'frame', 'mindmap']);
const KIND_LABELS: Record<string, string> = { icon: 'Component', group: 'Group', cluster: 'Cluster', text: 'Text', shape: 'Shape', sticky: 'Sticky', draw: 'Drawing', frame: 'Frame', mindmap: 'Mind map', stamp: 'Stamp', card: 'Card', junction: 'Junction', table: 'Table', class: 'Class', sequence: 'Sequence diagram', state: 'State', usecase: 'Use case', activity: 'Activity', component: 'Component', deployment: 'Deployment', object: 'Object' };

/** current technology (icon) of a node as a picker row: logo + name + chevron. Its name is its visible text ("<name> Click to change"): an aria-label that left the hint out failed WCAG 2.5.3, and the row's label (Technology / Logo) names the field. */
function TechRow({ iconId, onOpen }: { iconId?: string; onOpen: () => void }) {
  const icon = useIcon(iconId);
  const name = iconId && icon.kind !== 'pending' && 'title' in icon ? icon.title : iconId ? t('Loading…') : t('None');
  return (
    <button type="button" className="pick-row" aria-haspopup="dialog" onClick={onOpen}>
      <span className="pick-icon">{iconId ? <IconGlyph iconId={iconId} size={22} /> : <Replace size={15} aria-hidden />}</span>
      <span className="pick-text"><span className="pick-title">{name}</span><span className="pick-sub">{t('Click to change')}</span></span>
      <ChevronRight size={15} className="pick-chev" aria-hidden />
    </button>
  );
}
const colorValue = (c: string | undefined, fallback: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback);

const selNodesFirstId = (nodes: DiagramNode[]): string | undefined => nodes.find((n) => n.selected && n.type === 'cluster')?.id;

/** nodes with their own inspector (no generic style / text sections) */
const RICH = new Set(['table', 'class', 'sequence', 'state', 'usecase', 'activity', 'component', 'deployment', 'object', 'timing']);

const ALIGN_LABEL = { left: () => t('Align left'), center: () => t('Align center'), right: () => t('Align right'), top: () => t('Align top'), middle: () => t('Align middle'), bottom: () => t('Align bottom') } as const;

export function PropertiesPanel() {
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const updateNodesData = useDiagramStore((s) => s.updateNodesData);
  const updateSelectionStyle = useDiagramStore((s) => s.updateSelectionStyle);
  const updateEdges = useDiagramStore((s) => s.updateEdges);
  const applyEdgePreset = useDiagramStore((s) => s.applyEdgePreset);
  const settings = useResolvedSettings();
  const editingId = useUiStore((s) => s.editingId);
  const setEditing = useUiStore((s) => s.setEditing);
  const setIconPicker = useUiStore((s) => s.setIconPicker);
  const sessionReadOnly = useEditorSession((s) => s.readOnly);
  const acc = useAccordion('sdd:acc:props', SECTION_IDS, DEFAULT_OPEN);
  const focusRole = useUiStore((s) => s.focusRole);
  const setFocusRole = useUiStore((s) => s.setFocusRole);
  const setWizard = useUiStore((s) => s.setWizard);
  const setRole = useDiagramStore((s) => s.setRole);
  const addReplica = useDiagramStore((s) => s.addReplica);
  const toggleCollapse = useDiagramStore((s) => s.toggleCollapse);
  const memberTotal = useDiagramStore((s) => (selNodesFirstId(s.nodes) ? memberCount(s.nodes, selNodesFirstId(s.nodes)!) : 0));

  const devMode = useUiStore((s) => s.devMode);
  const hasStyles = useLibraryDoc((s) => Object.keys(s.doc.styles.colors).length + Object.keys(s.doc.styles.texts).length + Object.keys(s.doc.styles.effects).length > 0);
  const [multiOpen, setMultiOpen] = useState<string[]>(['bulk', 'arrange']);
  const selNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes]);
  const selEdges = useMemo(() => edges.filter((e) => e.selected), [edges]);
  const ids = selNodes.map((n) => n.id);
  const eids = selEdges.map((e) => e.id);
  const node: DiagramNode | undefined = selNodes[0];
  const edge = selEdges[0];
  const nodeMode = selNodes.length > 0 && selEdges.length === 0;
  const edgeMode = selEdges.length > 0 && selNodes.length === 0;
  const patch = (p: Parameters<typeof updateNodesData>[1]) => updateNodesData(ids, p);
  const run = (a: string) => executeAction(a, { nodeId: node?.id, edgeId: edge?.id });

  let body: React.ReactNode = (
    <div className="ins-empty">
      <span className="ins-tile" aria-hidden><MousePointer2 size={20} strokeWidth={1.6} /></span>
      <strong>{t('Nothing selected')}</strong>
      <p>{t('Pick a component, edge or group on the canvas to edit its properties here.')}</p>
    </div>
  );

  const multi = selNodes.length + selEdges.length > 1;
  if (devMode && (selNodes.length || selEdges.length)) {
    body = <DevPanel />;
  } else if (multi) {
    body = (
      <>
        <InspectorHeader
          kind={t('Selection')}
          tile={<Layers size={20} strokeWidth={1.6} />}
          title={<div className="ins-title-static">{t('{n} items selected', { n: selNodes.length + selEdges.length })}</div>}
          meta={
            <>
              {selNodes.length > 0 && <Chip>{t(selNodes.length === 1 ? '{n} node' : '{n} nodes', { n: selNodes.length })}</Chip>}
              {selEdges.length > 0 && <Chip>{t(selEdges.length === 1 ? '{n} edge' : '{n} edges', { n: selEdges.length })}</Chip>}
            </>
          }
          tools={
            <>
              <span className="spacer" />
              <ToolButton label={t('Duplicate')} onClick={() => run('duplicate')}><Copy size={15} /></ToolButton>
              <ToolButton label={t('Group')} disabled={selNodes.length < 1} onClick={() => run('group')}><GroupIcon size={15} /></ToolButton>
              <ToolButton label={t('Delete')} danger onClick={() => run('delete')}><Trash2 size={15} /></ToolButton>
            </>
          }
        />
        <Accordion
          smooth
          open={multiOpen}
          onToggle={(id) => setMultiOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))}
          sections={[
            { id: 'bulk', label: t('Style (all selected)'), content: <BulkStyle /> },
            {
              id: 'arrange',
              label: t('Arrange'),
              content: (
                <div className="prop-body">
                  <Field label={t('Align')} hint={selNodes.length < 2 ? t('Select two or more nodes to align.') : undefined}>
                    <ButtonGrid label={t('Align')}>
                      {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((m) => (
                        <button key={m} type="button" disabled={selNodes.length < 2} onClick={() => run(`align:${m}`)}>{ALIGN_LABEL[m]()}</button>
                      ))}
                    </ButtonGrid>
                  </Field>
                  <Field label={t('Distribute')} hint={selNodes.length < 3 ? t('Needs three or more nodes.') : undefined}>
                    <ButtonGrid label={t('Distribute')} cols={2}>
                      <button type="button" disabled={selNodes.length < 3} onClick={() => run('distribute:horizontal')}>{t('Horizontally')}</button>
                      <button type="button" disabled={selNodes.length < 3} onClick={() => run('distribute:vertical')}>{t('Vertically')}</button>
                    </ButtonGrid>
                  </Field>
                </div>
              ),
            },
          ]}
        />
      </>
    );
  } else if (nodeMode && node) {
    const v = resolveNodeStyle(node.data, node.type ?? 'icon', settings);
    const single = selNodes.length === 1;
    const kinds = new Set(selNodes.map((n) => n.type));
    const isGroup = kinds.has('group');
    const hasBox = [...kinds].some((k) => k !== 'text' && k !== 'draw');
    const strokeable = [...kinds].some((k) => k === 'shape' || k === 'group' || k === 'sticky' || k === 'draw');
    const textual = [...kinds].some((k) => k !== 'draw');
    const kindLabel = t(KIND_LABELS[node.type ?? 'icon'] ?? 'Item');
    const allLocked = selNodes.every((n) => n.data.locked);
    const titleEditable = TITLE_KINDS.has(node.type ?? 'icon');
    const isCluster = node.type === 'cluster';
    const iconPick = node.type === 'icon' || node.type === 'card';
    const KindIcon = KIND_ICON[node.type ?? 'icon'] ?? Box;
    const editingTitle = editingId === node.id && node.type !== 'sticky' && node.type !== 'mindmap' && node.type !== 'frame';
    const header = (
      <InspectorHeader
        kind={kindLabel}
        tile={node.data.iconId ? <IconGlyph iconId={node.data.iconId} size={28} /> : <KindIcon size={20} strokeWidth={1.6} />}
        title={titleEditable ? (
          <BufferedInput className="ins-title" placeholder={t('Untitled {kind}', { kind: kindLabel.toLowerCase() })} value={node.data.label} onCommit={(label) => (node.type === 'mindmap' ? mmSetLabel(node.id, label) : patch({ label }))} aria-label={t('Label')} autoFocus={editingTitle} onDone={() => editingTitle && setEditing(null)} />
        ) : <div className="ins-title-static" title={node.data.label || kindLabel}>{node.data.label?.trim() ? node.data.label.split('\n')[0] : kindLabel}</div>}
        meta={
          <>
            {isCluster && <Chip>{t(memberTotal === 1 ? '{n} member' : '{n} members', { n: memberTotal })}</Chip>}
            {isCluster && node.data.topology && <Chip>{node.data.topology}</Chip>}
            {isCluster && node.data.collapsed && <Chip tone="warn">{t('Collapsed')}</Chip>}
            {node.type === 'icon' && node.data.role && <Chip>{node.data.role}</Chip>}
            {node.type === 'icon' && node.data.subtitle && <Chip>{node.data.subtitle}</Chip>}
            {node.type === 'group' && node.data.variant && <Chip>{node.data.variant}</Chip>}
            {allLocked && <Chip>{t('Locked')}</Chip>}
          </>
        }
        primary={isCluster ? (
          <button type="button" className="ins-primary" onClick={() => addReplica(node.id)}><Plus size={15} aria-hidden /> {t('Add replica')}</button>
        ) : iconPick ? (
          <button type="button" className="ins-primary" onClick={() => setIconPicker(node.id)}><Replace size={14} aria-hidden /> {t('Change icon')}</button>
        ) : undefined}
        tools={
          <>
            {isCluster && <ToolButton label={t(node.data.collapsed ? 'Expand cluster' : 'Collapse cluster')} onClick={() => toggleCollapse(node.id)}>{node.data.collapsed ? <Maximize2 size={15} /> : <Minimize2 size={15} />}</ToolButton>}
            {isCluster && node.data.profileId && <ToolButton label={t('Edit cluster…')} onClick={() => setWizard({ clusterId: node.id })}><Settings2 size={15} /></ToolButton>}
            <span className="spacer" />
            <ToolButton label={t(allLocked ? 'Unlock' : 'Lock')} pressed={allLocked} onClick={() => executeAction('toggle-lock')}>{allLocked ? <Lock size={15} /> : <LockOpen size={15} />}</ToolButton>
            <ToolButton label={t('Duplicate')} onClick={() => run('duplicate')}><Copy size={15} /></ToolButton>
            <ToolButton label={t('Delete')} danger onClick={() => run('delete')}><Trash2 size={15} /></ToolButton>
          </>
        }
      />
    );
    body = (
      <>
      {header}
      <Accordion
        smooth
        open={acc.state.open}
        onToggle={acc.toggle}
        sections={[
          {
            id: 'general',
            label: t('General'),
            content: single && node.type === 'table' ? (
              <div className="prop-body"><TableInspector node={node} /></div>
            ) : single && node.type === 'class' ? (
              <div className="prop-body"><ClassInspector node={node} /></div>
            ) : single && (node.type === 'sequence' || node.type === 'state' || node.type === 'usecase' || node.type === 'activity' || node.type === 'component' || node.type === 'deployment' || node.type === 'object' || node.type === 'timing') ? (
              <div className="prop-body"><DiagramKindInspector node={node} /></div>
            ) : (
              <div className="prop-body">
                {single && node.type !== 'draw' && !titleEditable && (
                  <Row label={t('Label')}>
                    <BufferedInput multiline={node.type === 'text' || node.type === 'sticky'} value={node.data.label} onCommit={(label) => (node.type === 'mindmap' ? mmSetLabel(node.id, label) : patch({ label }))} aria-label={t('Label')} autoFocus={editingTitle} onDone={() => editingTitle && setEditing(null)} />
                  </Row>
                )}
                {isCluster && (
                  <Row label={t('Subtitle')} hint={t('Shown under the cluster title on the canvas.')}>
                    <BufferedInput value={node.data.subtitle ?? ''} placeholder="Patroni · 3 nodes" aria-label={t('Cluster subtitle')} onCommit={(subtitle) => patch({ subtitle: subtitle || undefined })} />
                  </Row>
                )}
                {single && node.type === 'icon' && (
                  <>
                    <Row label={t('Subtitle')} hint={t('Port or short note under the label, e.g. :9090.')}>
                      <BufferedInput value={node.data.subtitle ?? ''} placeholder=":9090" onCommit={(subtitle) => patch({ subtitle: subtitle || undefined })} aria-label={t('Subtitle')} />
                    </Row>
                    <div className="pair">
                      <Row label={t('Label colour')}><ColorField label={t('Label colour')} value={colorValue(node.data.labelColor, '#2d3340')} presets={TAG_COLORS as unknown as string[]} onChange={(c) => patch({ labelColor: c })} /></Row>
                      <Row label={t('Subtitle colour')}><ColorField label={t('Subtitle colour')} value={colorValue(node.data.subtitleColor, '#6b7280')} presets={TAG_COLORS as unknown as string[]} onChange={(c) => patch({ subtitleColor: c })} /></Row>
                    </div>
                  </>
                )}
                {single && node.type === 'card' && (
                  <>
                    <Row label={t('Subtitle')}><BufferedInput value={node.data.subtitle ?? ''} aria-label={t('Card subtitle')} onCommit={(subtitle) => patch({ subtitle: subtitle || undefined })} /></Row>
                    <Row label={t('Layout')}><Seg label={t('Card layout')} value={node.data.layout ?? 'vertical'} options={[['vertical', t('Vertical')], ['horizontal', t('Horizontal')]]} onChange={(layout) => patch({ layout })} /></Row>
                    <Row label={t('Tint')}><ColorField label={t('Card tint')} value={colorValue(node.data.accent as string | undefined, '#2f6fdb')} presets={TAG_COLORS as unknown as string[]} onChange={(c) => patch({ accent: c })} /></Row>
                    <Row label={t('Tags')}>
                      <div className="tag-editor">
                        {(node.data.tags ?? []).map((tg, i) => (
                          <div key={i} className="tag-row">
                            <BufferedInput value={tg.text} aria-label={t('Tag text {n}', { n: i + 1 })} onCommit={(text) => patch({ tags: updateTag(node.data.tags, i, { text }) })} />
                            <ColorField label={t('Tag colour {n}', { n: i + 1 })} value={tg.color} presets={TAG_COLORS as unknown as string[]} onChange={(color) => patch({ tags: updateTag(node.data.tags, i, { color }) })} />
                            <button type="button" aria-label={t('Remove tag {n}', { n: i + 1 })} onClick={() => patch({ tags: removeTag(node.data.tags, i) })}>×</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => patch({ tags: addTag(node.data.tags) })}>{t('+ Add tag')}</button>
                      </div>
                    </Row>
                  </>
                )}
                {single && node.type === 'group' && (
                  <>
                    <Row label={t('Logo')}><TechRow iconId={node.data.groupIcon} onOpen={() => setIconPicker(node.id)} /></Row>
                    {node.data.variant === 'lane' ? (
                      <Row label={t('Swimlane')}>
                        <Seg label={t('Lane orientation')} value={node.data.laneOrient === 'h' ? 'h' : 'v'} options={[['v', t('Column')], ['h', t('Row')]]} onChange={(laneOrient) => patch({ laneOrient })} />
                      </Row>
                    ) : (
                      <Row label={t('Look')}>
                        <Seg label={t('Group look')} value={node.data.variant ?? 'plain'} options={[['plain', t('Plain')], ['dashed', t('Dashed')], ['card', t('Card')]]} onChange={(variant) => patch({ variant: variant === 'plain' ? undefined : variant })} />
                      </Row>
                    )}
                    {node.data.variant === 'dashed' && <Row label={t('Caption')}><BufferedInput value={node.data.caption ?? ''} aria-label={t('Group caption')} onCommit={(caption) => patch({ caption: caption || undefined })} /></Row>}
                    {node.data.variant === 'card' && (
                      <>
                        <Row label={t('Subtitle')}><BufferedInput value={node.data.subtitle ?? ''} aria-label={t('Group subtitle')} onCommit={(subtitle) => patch({ subtitle: subtitle || undefined })} /></Row>
                        <Row label={t('Tint')}><ColorField label={t('Group tint')} value={colorValue(node.data.accent as string | undefined, '#2f6fdb')} presets={TAG_COLORS as unknown as string[]} onChange={(c) => patch({ accent: c })} /></Row>
                      </>
                    )}
                    <Row label={t('Repeat')}>
                      <div className="btn-row">
                        {[2, 3, 4].map((c) => (<button key={c} type="button" onClick={() => executeAction(`repeat:${c}`, { nodeId: node.id })}>×{c}</button>))}
                      </div>
                    </Row>
                  </>
                )}
                {kinds.has('sticky') && (
                  <>
                    <Row label={t('Colour')}>
                      <div className="sticky-swatches" role="group" aria-label={t('Sticky colour')}>
                        {STICKY_COLORS.map((c) => (
                          <button key={c.id} type="button" className={`sticky-swatch${node.data.fill === c.fill ? ' on' : ''}`} style={{ background: c.fill, borderColor: c.stroke }} aria-label={c.name} aria-pressed={node.data.fill === c.fill} title={c.name} onClick={() => updateSelectionStyle({ fill: c.fill, stroke: c.stroke })} />
                        ))}
                      </div>
                    </Row>
                    <Toggle label={t('Fit text to the sticky')} checked={node.data.autoFont !== false && node.data.autoFont !== undefined} onChange={(autoFont) => patch({ autoFont })} />
                    {selNodes.some((n) => n.data.private) && <button type="button" onClick={() => revealAll()}>{t('Reveal hidden stickies')}</button>}
                  </>
                )}
                {single && node.type === 'stamp' && (
                  <Row label={t('Emoji')}><BufferedInput value={String(node.data.emoji ?? '')} aria-label={t('Stamp emoji')} onCommit={(emoji) => emoji.trim() && patch({ emoji: emoji.trim().slice(0, 8) })} /></Row>
                )}
                {kinds.has('icon') && (
                  <>
                    <Row label={t('Role')}>
                      <Select label={t('Role')} value={ROLES.includes((node.data.role ?? '') as never) ? (node.data.role as string) : node.data.role ? '__custom' : ''} options={ROLE_OPTS.map((o) => ({ ...o, label: t(o.label) }))} onChange={(v) => { if (v === '__custom') setFocusRole(true); else setRole(ids, v || null); }} />
                    </Row>
                    {(focusRole || (node.data.role && !ROLES.includes(node.data.role as never))) && (
                      <Row label={t('Custom role')}>
                        <BufferedInput value={ROLES.includes((node.data.role ?? '') as never) ? '' : node.data.role ?? ''} placeholder={t('e.g. hot-data')} aria-label={t('Custom role')} autoFocus={focusRole} onDone={() => setFocusRole(false)}
                          onCommit={(v) => { if (v && !setRole(ids, v)) toast.error(validateRole(v).ok ? t('Invalid role') : (validateRole(v) as { error: string }).error); }} />
                      </Row>
                    )}
                  </>
                )}
              </div>
            ),
          },
          ...(single && (isLinkSource(node) || isArchTarget(node))
            ? [{ id: 'crosslinks', label: isLinkSource(node) ? t('Architecture link') : t('Linked from'), content: <div className="prop-body"><CrossLinkInspector node={node} readOnly={sessionReadOnly} /></div> }]
            : []),
          ...(single && hasArchSection(node)
            ? [{ id: 'arch', label: t('Architecture'), content: <ArchSection node={node} readOnly={sessionReadOnly} onChange={(arch) => patch({ arch })} /> }]
            : []),
          ...(single && node.type === 'cluster'
            ? [{
                id: 'cluster',
                label: t('Cluster'),
                content: (
                  <div className="prop-body">
                    <Row label={t('Topology')} hint={t('How members coordinate writes.')}><Select label={t('Topology')} value={node.data.topology ?? ''} options={TOPOLOGY_OPTS.map((o) => ({ ...o, label: t(o.label) }))} onChange={(v) => patch({ topology: v || undefined })} /></Row>
                    <Row label={t('Replication mode')}><Select label={t('Replication mode')} value={node.data.replication ?? ''} options={REPL_OPTS.map((o) => ({ ...o, label: t(o.label) }))} onChange={(v) => patch({ replication: v || undefined })} /></Row>
                    <Row label={t('Technology')}><TechRow iconId={node.data.iconId} onOpen={() => setIconPicker(node.id)} /></Row>
                  </div>
                ),
              }]
            : []),
          ...(single && RICH.has(node.type ?? '') ? [] : [{
            id: 'style',
            label: t('Style'),
            content: (
              <div className="prop-body">
                {hasBox && (
                  <>
                    <Row label={t('Background')}>
                      <Seg label={t('Background')} value={isGroup && !kinds.has('icon') ? (v.fillOpacity > 0 ? 'filled' : 'transparent') : v.background} options={[['transparent', t('Transparent')], ['filled', t('Filled')]]}
                        onChange={(b) => patch(isGroup && !kinds.has('icon') ? { fillOpacity: b === 'filled' ? 12 : 0 } : { background: b })} />
                    </Row>
                    {(isGroup ? v.fillOpacity > 0 : v.background === 'filled') && (
                      <>
                        <Row label={t('Fill')}><ColorField quick={5} label={t('Fill')} value={colorValue(v.fill, '#ffffff')} presets={FILL_PRESETS.filter((c) => c !== 'transparent')} onChange={(c) => patch({ fill: c })} /></Row>
                        <Slider label={isGroup ? t('Fill opacity') : t('Opacity')} ariaLabel={t('Opacity')} unit="%" min={0} max={100} value={isGroup ? v.fillOpacity : v.opacity} onChange={(n) => patch(isGroup ? { fillOpacity: n } : { opacity: n })} />
                      </>
                    )}
                    <Toggle label={t('Border')} checked={v.border} onChange={(border) => patch({ border })} />
                    {v.border && (
                      <>
                        <Row label={t('Border colour')}><ColorField quick={5} label={t('Border')} value={colorValue(v.borderColor, '#2d3340')} presets={STROKE_PRESETS} onChange={(c) => patch({ stroke: c })} /></Row>
                        {strokeable && (
                          <>
                            <Slider label={t('Width')} ariaLabel={t('Border width')} unit="px" min={0.5} max={8} step={0.5} value={v.borderWidth} onChange={(strokeWidth) => patch({ strokeWidth })} />
                            <Row label={t('Line')}>
                              <Seg<StrokeStyle> label={t('Line style')} value={v.borderStyle} options={[['solid', t('Solid')], ['dashed', t('Dashed')], ['dotted', t('Dotted')]]} onChange={(strokeStyle) => patch({ strokeStyle })} />
                            </Row>
                          </>
                        )}
                      </>
                    )}
                    <SubHead>{t('Shape')}</SubHead>
                    <Slider label={t('Corner radius')} ariaLabel={t('Corner radius')} unit="px" min={0} max={40} value={v.radius} onChange={(radius) => patch({ radius })} />
                    <Toggle label={t('Shadow')} checked={v.shadow} onChange={(shadow) => patch({ shadow })} />
                  </>
                )}
                {kinds.has('draw') && (
                  <>
                    <Row label={t('Colour')}><ColorField quick={5} label={t('Stroke')} value={colorValue(node.data.stroke, '#2d3340')} presets={STROKE_PRESETS} onChange={(c) => patch({ stroke: c })} /></Row>
                    <Slider label={t('Width')} ariaLabel={t('Stroke width')} unit="px" min={1} max={12} step={0.5} value={node.data.strokeWidth ?? 2.5} onChange={(strokeWidth) => patch({ strokeWidth })} />
                  </>
                )}
              </div>
            ),
          }]),
          ...(textual && !(single && RICH.has(node.type ?? ''))
            ? [{
                id: 'text',
                label: t('Text'),
                content: (
                  <div className="prop-body">
                    <ScrubInput label={t('Font size')} value={node.data.fontSize ?? (node.type === 'text' ? 14 : 12)} min={8} max={72} suffix="px" onChange={(fontSize) => patch({ fontSize })} />
                    <Toggle label={t('Bold')} checked={!!node.data.bold} onChange={(bold) => patch({ bold })} />
                    <Row label={t('Align')}><Seg<TextAlign> label={t('Text align')} value={node.data.align ?? 'center'} options={[['left', t('Left')], ['center', t('Center')], ['right', t('Right')]]} onChange={(align) => patch({ align })} /></Row>
                    <Row label={t('Text colour')}><ColorField quick={5} label={t('Text')} value={colorValue(node.data.textColor, '#2d3340')} presets={STROKE_PRESETS} onChange={(c) => patch({ textColor: c })} /></Row>
                  </div>
                ),
              }]
            : []),
          ...(single && node.type !== 'mindmap' ? designSections(node, nodes, hasStyles) : []),
          {
            id: 'arrange',
            label: t('Arrange'),
            content: (
              <div className="prop-body">
                <Field label={t('Stacking order')}>
                  <ButtonGrid label={t('Order')} cols={2}>
                    <button type="button" onClick={() => run('bring-front')}>{t('To front')}</button>
                    <button type="button" onClick={() => run('send-back')}>{t('To back')}</button>
                    <button type="button" onClick={() => run('bring-forward')}>{t('Forward')}</button>
                    <button type="button" onClick={() => run('send-backward')}>{t('Backward')}</button>
                  </ButtonGrid>
                </Field>
                <p className="prop-hint">{t('Select two or more items to align or distribute them.')}</p>
              </div>
            ),
          },
        ]}
      />
      </>
    );
  }

  if (!multi && edgeMode && edge) {
    const v = resolveEdgeStyle(edge.data ?? {}, settings);
    const patchE = (p: Parameters<typeof updateEdges>[1]) => updateEdges(eids, p);
    const nodeName = (id: string) => { const n = nodes.find((x) => x.id === id); return n?.data.label?.trim() ? n.data.label.split('\n')[0] : id; };
    const edgeLocked = selEdges.every((e) => e.data?.locked);
    const lineLabel = t({ orthogonal: 'Smart', 'step-rounded': 'Rounded', straight: 'Straight', curved: 'Curved' }[v.lineType as string] ?? v.lineType);
    body = (
      <>
      <InspectorHeader
        kind={t('Edge')}
        tile={<Spline size={20} strokeWidth={1.6} />}
        title={<div className="ins-title-static" title={typeof edge.label === 'string' && edge.label ? edge.label : t('Edge')}>{typeof edge.label === 'string' && edge.label ? edge.label : t('Untitled edge')}</div>}
        meta={
          <>
            <Chip title={t('{a} to {b}', { a: nodeName(edge.source), b: nodeName(edge.target) })}>{nodeName(edge.source)} → {nodeName(edge.target)}</Chip>
            <Chip>{lineLabel}</Chip>
            {edgeLocked && <Chip>{t('Locked')}</Chip>}
          </>
        }
        tools={
          <>
            <ToolButton label={t('Reverse direction')} onClick={() => executeAction('reverse-edge', { edgeId: edge.id })}><ArrowLeftRight size={15} /></ToolButton>
            {selEdges.some((x) => x.data?.manual || x.data?.labelT !== undefined) && <ToolButton label={t('Reset route')} onClick={() => selEdges.forEach((x) => executeAction('reset-route', { edgeId: x.id }))}><RotateCcw size={15} /></ToolButton>}
            <span className="spacer" />
            <ToolButton label={t(edgeLocked ? 'Unlock' : 'Lock')} pressed={edgeLocked} onClick={() => executeAction('toggle-lock')}>{edgeLocked ? <Lock size={15} /> : <LockOpen size={15} />}</ToolButton>
            <ToolButton label={t('Delete')} danger onClick={() => run('delete')}><Trash2 size={15} /></ToolButton>
          </>
        }
      />
      <Accordion
        smooth
        open={acc.state.open}
        onToggle={acc.toggle}
        sections={[
          {
            id: 'general',
            label: t('General'),
            content: (
              <div className="prop-body">
                {selEdges.length === 1 && relationOf(edge) && <RelationInspector edge={edge} />}
                {selEdges.length === 1 && edge.data?.uml && <UmlRelationInspector edge={edge} />}
                {selEdges.length === 1 && (
                  <Row label={t('Label')}>
                    <BufferedInput value={typeof edge.label === 'string' ? edge.label : ''} onCommit={(label) => patchE({ label })} aria-label={t('Edge label')} />
                  </Row>
                )}
                <Row label={t('Preset')}>
                  <Select label={t('Edge preset')} value={edge.data?.preset ?? ''} options={[{ value: '', label: t('Custom') }, ...allEdgePresets(settings.edgePresets).map((p) => ({ value: p.id, label: p.name }))]} onChange={(id) => id && selEdges.length && applyEdgePreset(eids, id, settings.edgePresets)} />
                </Row>
                <Row label={t('Line type')}><Seg label={t('Line type')} value={v.lineType} options={[['orthogonal', t('Smart')], ['step-rounded', t('Rounded')], ['straight', t('Straight')], ['curved', t('Curved')]]} onChange={(lineType) => patchE({ lineType })} /></Row>
                <Row label={t('Arrowheads')}><Seg label={t('Arrowheads')} value={v.arrows} options={[['none', t('None')], ['start', t('Start')], ['end', t('End')], ['both', t('Both')]]} onChange={(arrows) => patchE({ arrows })} /></Row>
                <Row label={t('Cluster edge kind')}>
                  <Select label={t('Cluster edge kind')} value={edge.data?.kind ?? ''} options={[{ value: '', label: t('None') }, ...opts(EDGE_KINDS)]} onChange={(k) => k && patchE({ kind: k as never })} />
                </Row>
                {edge.data?.kind === 'replication' && (
                  <Row label={t('Replication mode')}><Seg label={t('Edge replication mode')} value={edge.data?.replMode ?? 'async'} options={REPL_MODES.map((m) => [m, m] as [typeof m, string])} onChange={(replMode) => patchE({ replMode })} /></Row>
                )}
                <div className="pair">
                  <Row label={t('Start arrowhead')}><Select label={t('Start arrowhead')} value={edge.data?.startMarker ?? (v.arrows === 'start' || v.arrows === 'both' ? 'arrow' : 'none')} options={MARKER_OPTS.map((o) => ({ ...o, label: t(o.label) }))} onChange={(m) => patchE({ startMarker: m as never })} /></Row>
                  <Row label={t('End arrowhead')}><Select label={t('End arrowhead')} value={edge.data?.endMarker ?? (v.arrows === 'end' || v.arrows === 'both' ? 'arrow' : 'none')} options={MARKER_OPTS.map((o) => ({ ...o, label: t(o.label) }))} onChange={(m) => patchE({ endMarker: m as never })} /></Row>
                </div>
                {v.lineType === 'step-rounded' && <Slider label={t('Corner radius')} ariaLabel={t('Corner radius')} unit="px" min={0} max={30} value={edge.data?.cornerRadius ?? settings.edge.cornerRadius} onChange={(cornerRadius) => patchE({ cornerRadius })} />}
              </div>
            ),
          },
          {
            id: 'style',
            label: t('Style'),
            content: (
              <div className="prop-body">
                <Row label={t('Line')}><Seg<StrokeStyle> label={t('Line style')} value={v.strokeStyle} options={[['solid', t('Solid')], ['dashed', t('Dashed')], ['dotted', t('Dotted')]]} onChange={(strokeStyle) => patchE({ strokeStyle })} /></Row>
                <Row label={t('Colour')}><ColorField quick={5} label={t('Edge')} value={colorValue(v.color, '#2d3340')} presets={EDGE_COLORS.map((c) => c.value)} onChange={(color) => patchE({ color })} /></Row>
                <Slider label={t('Width')} ariaLabel={t('Stroke width')} unit="px" min={0.5} max={8} step={0.5} value={v.width} onChange={(strokeWidth) => patchE({ strokeWidth })} />
                <Toggle label={t('Animated dashes')} hint={t('Marching-ants motion along the line.')} checked={selEdges.every((e) => e.data?.flow)} onChange={(flow) => patchE({ flow })} />
                <SubHead>{t('Label')}</SubHead>
                <Row label={t('Label colour')}><ColorField quick={5} label={t('Label')} value={colorValue(edge.data?.labelColor, v.color)} presets={EDGE_COLORS.map((c) => c.value)} onChange={(labelColor) => patchE({ labelColor })} /></Row>
                <Toggle label={t('Bold label')} checked={selEdges.every((e) => e.data?.labelBold)} onChange={(labelBold) => patchE({ labelBold })} />
                <Row label={t('Label position')}><Seg label={t('Label position')} value={edge.data?.labelSide ?? 'auto'} options={[['auto', t('Beside')], ['on', t('On line')], ['left', t('Left')], ['right', t('Right')]]} onChange={(labelSide) => patchE({ labelSide })} /></Row>
                <Toggle label={t('Label background')} checked={v.labelBackground} onChange={(labelBg) => patchE({ labelBg })} />
              </div>
            ),
          },
          {
            id: 'flow',
            label: t('Data flow'),
            content: (() => {
              const look = resolveFlowLook(edge.data, settings.edgePresets);
              const dir = resolveFlowDir(edge.data, v.arrows) ?? 'forward';
              const mode = edge.data?.dataFlow === true ? 'on' : edge.data?.dataFlow === false ? 'off' : 'auto';
              return (
                <div className="prop-body" data-testid="flow-controls">
                  <Row label={t('Packets')}><Seg<'auto' | 'on' | 'off'> label={t('Edge packets')} value={mode} options={[['auto', t('Follow page')], ['on', t('On')], ['off', t('Off')]]} onChange={(m) => patchE({ dataFlow: m === 'auto' ? (undefined as never) : m === 'on' })} /></Row>
                  <Row label={t('Speed')}><Seg label={t('Flow speed')} value={look.speed} options={[['slow', t('Slow')], ['normal', t('Normal')], ['fast', t('Fast')]]} onChange={(flowSpeed) => patchE({ flowSpeed })} /></Row>
                  <Slider label={t('Density')} ariaLabel={t('Packet density')} unit="/100px" min={0.4} max={6} step={0.2} value={look.density} onChange={(flowDensity) => patchE({ flowDensity })} />
                  <Row label={t('Packet')}><Seg label={t('Packet style')} value={look.style} options={[['dot', t('Dot')], ['dash', t('Dash')], ['pulse', t('Pulse')]]} onChange={(flowStyle) => patchE({ flowStyle })} /></Row>
                  <Row label={t('Direction')}><Seg label={t('Flow direction')} value={dir} options={[['forward', t('Forward')], ['reverse', t('Backward')], ['both', t('Both ways')]]} onChange={(flowDir) => patchE({ flowDir })} /></Row>
                </div>
              );
            })(),
          },
        ]}
      />
      </>
    );
  }

  return (
    <aside className="props" aria-label={t('Properties')} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <h3 className="panel-title">{t('Inspector')}</h3>
      <div className="props-scroll">{body}</div>
    </aside>
  );
}
