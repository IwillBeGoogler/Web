import type { ReactNode } from 'react';
import type { DiagramEdge, DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { ACCENTS } from '../../lib/er/tableData';
import { classOf, KIND_ACCENT } from '../../lib/uml/geometry';
import { relKindsFor } from '../../lib/menu';
import { formatTransition, parseTransition } from '../../lib/state/label';
import { sequenceOf } from '../../lib/seq/node';
import { setNumbering } from '../../lib/seq/edit';
import { allMessages, type SequenceData } from '../../lib/seq/types';
import { stateOf } from '../../lib/state/convert';
import { STATE_KINDS, stateKindLabel, type StateKind } from '../../lib/state/types';
import { ACTIVITY_KINDS, ACTIVITY_LABEL, isPseudo, type ActivityData, type ActivityKind } from '../../lib/activity/types';
import { formatGuard, parseGuard } from '../../lib/activity/convert';
import { COMPONENT_KINDS, type ComponentData, type ComponentPort, type UseCaseData } from '../../lib/uml2/types';
import { addPort, removePort, updatePort } from '../../lib/component/ports';
import { DEPLOYMENT_KINDS, DEPLOYMENT_LABEL, isDepContainerKind, type DeploymentData, type DeploymentKind } from '../../lib/deployment/types';
import { objectTitle, type ObjectData } from '../../lib/object/types';
import { slotsFromClass } from '../../lib/object/nodes';
import { UML_REL_LABEL, umlOf } from '../../lib/uml/edges';
import { UML_REL_KINDS, type ClassKind, type ClassNodeData, type UmlRelKind } from '../../lib/uml/types';
import { CommunicationMessages } from './CommunicationMessages';
import { timingOf } from '../../lib/timing/node';
import { removeLifeline, renameLifeline, setClockPeriod, setEnd, setLifelineKind, setUnit } from '../../lib/timing/edit';
import { LIFELINE_KINDS, LIFELINE_LABEL, type LifelineKind, type TimingData } from '../../lib/timing/types';
import { BufferedInput } from '../BufferedInput';
import { ColorField } from '../ui/ColorField';
import { Toggle } from '../ui/Toggle';
import { t } from '../../i18n';

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="prop-row">
    <span className="prop-label">{t(label)}</span>
    {children}
  </div>
);

/** Inspector body for one class node: name, kind, generics, stereotype, colour, collapsed compartments. */
export function ClassInspector({ node }: { node: DiagramNode }) {
  const d = classOf(node);
  const update = useDiagramStore((s) => s.updateClass);
  const set = (fn: (x: ClassNodeData) => ClassNodeData) => update(node.id, fn);
  return (
    <>
      <Row label="Name"><BufferedInput value={d.label} aria-label={t('Class name')} onCommit={(label) => label.trim() && set((x) => ({ ...x, label: label.trim() }))} /></Row>
      <Row label="Kind">
        <select aria-label={t('Class kind')} value={d.kind} onChange={(e) => set((x) => ({ ...x, kind: e.target.value as ClassKind, accent: x.accent === KIND_ACCENT[x.kind] ? KIND_ACCENT[e.target.value as ClassKind] : x.accent }))}>
          <option value="class">{t('Class')}</option>
          <option value="interface">{t('Interface')}</option>
          <option value="abstract">{t('Abstract class')}</option>
          <option value="enum">{t('Enum')}</option>
        </select>
      </Row>
      <Row label="Generics"><BufferedInput value={d.generics ?? ''} placeholder="T, K extends Key" aria-label={t('Type parameters')} onCommit={(generics) => set((x) => ({ ...x, generics: generics.trim() || undefined }))} /></Row>
      {d.kind === 'class' && <Row label="Stereotype"><BufferedInput value={d.stereotype ?? ''} placeholder="entity" aria-label={t('Stereotype')} onCommit={(stereotype) => set((x) => ({ ...x, stereotype: stereotype.trim() || undefined }))} /></Row>}
      <Row label="Package"><BufferedInput value={d.package ?? ''} placeholder="com.example" aria-label={t('Package')} onCommit={(p) => set((x) => ({ ...x, package: p.trim() || undefined }))} /></Row>
      <Row label="Header colour"><ColorField label={t('Header colour')} value={d.accent} presets={[...ACCENTS]} onChange={(accent) => set((x) => ({ ...x, accent }))} /></Row>
      <Toggle label={t('Collapse attributes')} checked={!!d.collapsedAttributes} onChange={(collapsedAttributes) => set((x) => ({ ...x, collapsedAttributes }))} />
      {d.kind !== 'enum' && <Toggle label={t('Collapse operations')} checked={!!d.collapsedOperations} onChange={(collapsedOperations) => set((x) => ({ ...x, collapsedOperations }))} />}
      <div className="btn-row"><button type="button" onClick={() => useDiagramStore.getState().instantiateClasses([node.id])}>{t('Create object (instantiate)')}</button></div>
      <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('Double-click a member to edit it:')} <code>- id: number</code>, <code>static + create(): Foo</code>, <code>abstract # run(a: A): R</code>.</p>
    </>
  );
}

const MULT_PRESETS = ['1', '0..1', '*', '1..*'];

/** Inspector rows for a UML relation: kind, navigable, multiplicities and role names at both ends. */
export function UmlRelationInspector({ edge }: { edge: DiagramEdge }) {
  const u = umlOf(edge);
  const patch = useDiagramStore((s) => s.updateUml);
  const reverse = useDiagramStore((s) => s.reverseEdge);
  const nodes = useDiagramStore((s) => s.nodes);
  const updateEdges = useDiagramStore((s) => s.updateEdges);
  if (!u) return null;
  const kinds = relKindsFor(nodes, edge, u.kind);
  const src = nodes.find((n) => n.id === edge.source);
  const classEnds = src?.type === 'class' && nodes.find((n) => n.id === edge.target)?.type === 'class';
  const text = (key: 'sourceMult' | 'targetMult' | 'sourceRole' | 'targetRole', label: string, placeholder: string) => (
    <Row label={label}><BufferedInput value={u[key] ?? ''} placeholder={placeholder} aria-label={t(label)} onCommit={(v) => patch([edge.id], { [key]: v.trim() || undefined })} /></Row>
  );
  /** multiplicity field with one-click presets */
  const mult = (key: 'sourceMult' | 'targetMult', label: string, placeholder: string) => (
    <>
      {text(key, label, placeholder)}
      <div className="btn-row" role="group" aria-label={t('{what} presets', { what: t(label) })}>
        {MULT_PRESETS.map((v) => (
          <button key={v} type="button" className={u[key] === v ? 'active' : ''} aria-pressed={u[key] === v} title={`${t(label)}: ${v}`} onClick={() => patch([edge.id], { [key]: u[key] === v ? undefined : v })}>{v}</button>
        ))}
      </div>
    </>
  );
  return (
    <>
      <Row label="Relationship">
        <select aria-label={t('Relationship')} value={u.kind} onChange={(e) => patch([edge.id], { kind: e.target.value as UmlRelKind })}>
          {(kinds.length ? kinds : [u.kind]).map((k) => <option key={k} value={k}>{t(UML_REL_LABEL[k])}</option>)}
        </select>
      </Row>
      {classEnds && u.kind === 'association' && src && (
        <Row label="Attach at attribute">
          <select aria-label={t('Attach at attribute')} value={u.sourceMember ?? ''} onChange={(e) => patch([edge.id], { sourceMember: e.target.value || undefined })}>
            <option value="">{t('(class edge)')}</option>
            {classOf(src).attributes.map((a) => <option key={a.id} value={a.id}>{a.name}{a.type ? `: ${a.type}` : ''}</option>)}
          </select>
        </Row>
      )}
      {u.kind === 'transition' && nodes.find((n) => n.id === edge.source)?.type === 'activity' && (
        <Row label="Guard"><BufferedInput value={parseGuard(edge.label) ?? ''} placeholder="amount > 0" aria-label={t('Flow guard')} onCommit={(v) => updateEdges([edge.id], { label: formatGuard(v) })} /></Row>
      )}
      {u.kind === 'transition' && nodes.find((n) => n.id === edge.source)?.type !== 'activity' && (() => {
        const tp = parseTransition(typeof edge.label === 'string' ? edge.label : '');
        const part = (key: 'event' | 'guard' | 'action', label: string, placeholder: string) => (
          <Row label={label}><BufferedInput value={tp[key]} placeholder={placeholder} aria-label={t('Transition {key}', { key: t(key) })} onCommit={(v) => updateEdges([edge.id], { label: formatTransition({ ...tp, [key]: v.trim() }) || undefined })} /></Row>
        );
        return <>{part('event', 'Event', 'submit')}{part('guard', 'Guard', 'amount > 0')}{part('action', 'Action', 'save()')}</>;
      })()}
      {u.kind === 'link' && !(u.messages ?? []).length && <Row label="Association name"><BufferedInput value={typeof edge.label === 'string' ? edge.label : ''} placeholder="owns" aria-label={t('Association name')} onCommit={(v) => updateEdges([edge.id], { label: v.trim() || undefined })} /></Row>}
      {u.kind === 'link' && !(u.messages ?? []).length && <>{text('sourceRole', 'Role (source end)', 'owner')}{text('targetRole', 'Role (target end)', 'items')}</>}
      {u.kind === 'link' && <CommunicationMessages edge={edge} />}
      {(u.kind === 'import' || u.kind === 'access' || u.kind === 'merge') && <Row label="Label"><BufferedInput value={typeof edge.label === 'string' ? edge.label : ''} placeholder={`«${u.kind}»`} aria-label={t('Relation label')} onCommit={(v) => updateEdges([edge.id], { label: v.trim() || `«${u.kind}»` })} /></Row>}
      {u.kind === 'communication' && <Row label="Protocol"><BufferedInput value={typeof edge.label === 'string' ? edge.label : ''} placeholder="HTTPS" aria-label={t('Protocol')} onCommit={(v) => updateEdges([edge.id], { label: v.trim() || undefined })} /></Row>}
      {u.kind === 'association' && <Toggle label={t('Navigable (open arrow)')} checked={!!u.directed} onChange={(directed) => patch([edge.id], { directed })} />}
      {u.kind !== 'note' && u.kind !== 'link' && UML_REL_KINDS.includes(u.kind) && (
        <>
          {mult('sourceMult', 'Multiplicity (source end)', '1')}
          {mult('targetMult', 'Multiplicity (target end)', '0..*')}
          {text('sourceRole', 'Role (source end)', 'owner')}
          {text('targetRole', 'Role (target end)', 'items')}
        </>
      )}
      <div className="btn-row"><button type="button" onClick={() => reverse(edge.id)}>{t('Reverse')}</button></div>
    </>
  );
}

/** Inspector body for the sequence / state / use case / component nodes. */
export function DiagramKindInspector({ node }: { node: DiagramNode }) {
  const nodes = useDiagramStore((s) => s.nodes);
  const seq = useDiagramStore((s) => s.updateSequence);
  const tm = useDiagramStore((s) => s.updateTiming);
  const st = useDiagramStore((s) => s.updateState);
  const shape = useDiagramStore((s) => s.updateShape);
  const colour = (value: string, on: (c: string) => void) => <Row label="Colour"><ColorField label={t('Colour')} value={value} presets={[...ACCENTS]} onChange={on} /></Row>;
  if (node.type === 'sequence') {
    const d = sequenceOf(node);
    const set = (fn: (x: SequenceData) => SequenceData) => seq(node.id, fn);
    return (
      <>
        <Row label="Title"><BufferedInput value={d.label} aria-label={t('Diagram title')} onCommit={(label) => label.trim() && set((x) => ({ ...x, label: label.trim() }))} /></Row>
        <Toggle label={t('Number messages')} checked={d.autonumber} onChange={(on) => set((x) => setNumbering(x, on) as SequenceData)} />
        {colour(d.accent, (accent) => set((x) => ({ ...x, accent })))}
        <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('{p} participants, {m} messages.', { p: d.participants.length, m: allMessages(d.items).length })} {t('Use the toolbar above the frame to add participants, messages, notes and fragments; drag a participant sideways or a message up and down to reorder; Tab moves between participant names.')}</p>
      </>
    );
  }
  if (node.type === 'timing') {
    const d = timingOf(node);
    const set = (fn: (x: TimingData) => TimingData) => tm(node.id, fn);
    return (
      <>
        <Row label="Title"><BufferedInput value={d.label} aria-label={t('Diagram title')} onCommit={(label) => label.trim() && set((x) => ({ ...x, label: label.trim() }))} /></Row>
        <Row label="Time unit"><BufferedInput value={d.unit} placeholder="ms" aria-label={t('Time unit')} onCommit={(unit) => set((x) => setUnit(x, unit))} /></Row>
        <Row label="Axis end"><BufferedInput value={String(d.end)} aria-label={t('Axis end')} onCommit={(v) => set((x) => setEnd(x, Number(v)))} /></Row>
        {d.lifelines.map((l) => (
          <div className="prop-row" key={l.id} data-testid={`tm-life-row-${l.id}`}>
            <BufferedInput value={l.name} aria-label={t('Lifeline {id} name', { id: l.id })} onCommit={(name) => name.trim() && set((x) => renameLifeline(x, l.id, name.trim()))} />
            <select aria-label={t('Lifeline {id} kind', { id: l.id })} value={l.kind} onChange={(e) => set((x) => setLifelineKind(x, l.id, e.target.value as LifelineKind))}>
              {LIFELINE_KINDS.map((k) => <option key={k} value={k}>{t(LIFELINE_LABEL[k])}</option>)}
            </select>
            {l.kind === 'clock' && <BufferedInput value={String(l.period ?? '')} placeholder={t('period')} aria-label={t('Clock {id} period', { id: l.id })} onCommit={(v) => set((x) => setClockPeriod(x, l.id, Number(v)))} />}
            <button type="button" aria-label={t('Remove lifeline {name}', { name: l.name })} onClick={() => set((x) => removeLifeline(x, l.id))}>×</button>
          </div>
        ))}
        {colour(d.accent, (accent) => set((x) => ({ ...x, accent })))}
        <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('{l} lifelines, {c} state changes, {m} messages.', { l: d.lifelines.length, c: d.changes.length, m: d.messages.length })} {t('Select the frame, then click a lifeline track to add a state change; drag a change dot sideways to retime it; double-click to rename; Delete removes the selection.')}</p>
      </>
    );
  }
  if (node.type === 'state') {
    const d = stateOf(node);
    const set = (fn: (x: typeof d) => typeof d) => st(node.id, fn);
    const plain = d.stateKind === 'state';
    return (
      <>
        {plain && <Row label="Name"><BufferedInput value={d.label} aria-label={t('State name')} onCommit={(label) => label.trim() && set((x) => ({ ...x, label: label.trim() }))} /></Row>}
        <Row label="Kind">
          <select aria-label={t('State kind')} value={d.stateKind} onChange={(e) => set((x) => ({ ...x, stateKind: e.target.value as StateKind, label: e.target.value === 'state' && !x.label ? 'State' : x.label }))}>
            {STATE_KINDS.map((k) => <option key={k} value={k}>{t(stateKindLabel(k))}</option>)}
          </select>
        </Row>
        {plain && <Row label="Activities"><BufferedInput multiline value={d.activity ?? ''} placeholder={'entry / start\ndo / work\nexit / stop'} aria-label={t('State activities')} onCommit={(activity) => set((x) => ({ ...x, activity: activity.trim() || undefined }))} /></Row>}
        {(d.stateKind === 'fork' || d.stateKind === 'join') && <Toggle label={t('Vertical bar')} checked={!!d.vertical} onChange={(vertical) => set((x) => ({ ...x, vertical }))} />}
        {(d.stateKind === 'entryPoint' || d.stateKind === 'exitPoint') && <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('Sits on the border of its composite state. Transitions that cross the border are drawn through it.')}</p>}
        {plain && colour(d.accent, (accent) => set((x) => ({ ...x, accent })))}
        <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('Draw a transition by dragging from one state to another; edit its label as')} <code>event [guard] / action</code>.</p>
      </>
    );
  }
  if (node.type === 'usecase') {
    const d = node.data as unknown as UseCaseData;
    const set = (patch: Partial<UseCaseData>) => shape(node.id, (x) => ({ ...x, ...patch }));
    return (
      <>
        <Row label="Name"><BufferedInput value={d.label} aria-label={t('Name')} onCommit={(label) => label.trim() && set({ label: label.trim() })} /></Row>
        <Row label="Shape">
          <select aria-label={t('Use case shape')} value={d.ucKind} onChange={(e) => set({ ucKind: e.target.value as UseCaseData['ucKind'] })}>
            <option value="actor">{t('Actor')}</option>
            <option value="usecase">{t('Use case')}</option>
          </select>
        </Row>
        {d.ucKind === 'usecase' && (
          <Row label="Extension points">
            <BufferedInput multiline value={(d.extensionPoints ?? []).join('\n')} placeholder={t('one per line')} aria-label={t('Extension points')} onCommit={(v) => set({ extensionPoints: v.split('\n').map((x) => x.trim()).filter(Boolean) })} />
          </Row>
        )}
        {colour(d.accent, (accent) => set({ accent }))}
      </>
    );
  }
  if (node.type === 'activity') {
    const d = node.data as unknown as ActivityData;
    const set = (patch: Partial<ActivityData>) => shape(node.id, (x) => ({ ...x, ...patch }));
    const k = d.actKind as ActivityKind;
    return (
      <>
        <Row label="Element">
          <select aria-label={t('Activity element')} value={k} onChange={(e) => set({ actKind: e.target.value as ActivityKind, ...(!d.label && !isPseudo(e.target.value as ActivityKind) ? { label: e.target.value === 'note' ? 'Note' : 'Action' } : {}) })}>
            {ACTIVITY_KINDS.map((x) => <option key={x} value={x}>{t(ACTIVITY_LABEL[x])}</option>)}
          </select>
        </Row>
        {k !== 'initial' && k !== 'final' && k !== 'flowFinal' && k !== 'fork' && (
          <Row label={k === 'decision' ? 'Condition' : k === 'note' ? 'Text' : 'Name'}><BufferedInput multiline={k === 'action' || k === 'note'} value={d.label} aria-label={t('Name')} onCommit={(label) => set({ label: k === 'decision' ? label.trim() : label.trim() || d.label })} /></Row>
        )}
        {k === 'object' && <Row label="State"><BufferedInput value={d.objectState ?? ''} placeholder="shipped" aria-label={t('Object state')} onCommit={(v) => set({ objectState: v.trim() || undefined })} /></Row>}
        {k === 'fork' && <Toggle label={t('Vertical bar')} checked={!!d.vertical} onChange={(vertical) => set({ vertical })} />}
        {k !== 'note' && colour(d.accent, (accent) => set({ accent }))}
        <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t("Draw a control flow by dragging from one element to another; the flow's guard is edited in its inspector. Drop elements into a swimlane to make them move with it.")}</p>
      </>
    );
  }
  if (node.type === 'object') {
    const d = node.data as unknown as ObjectData;
    const classNodes = nodes.filter((n) => n.type === 'class');
    const set = (patch: Partial<ObjectData>) => shape(node.id, (x) => ({ ...x, ...patch }));
    const setSlot = (id: string, patch: Partial<ObjectData['slots'][number]>) => set({ slots: d.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
    const cls = classNodes.find((c) => classOf(c).label.trim().toLowerCase() === (d.className ?? '').trim().toLowerCase());
    const missing = cls ? slotsFromClass(cls).filter((s) => !d.slots.some((x) => x.name === s.name)) : [];
    const nextId = () => { let k = d.slots.length; while (d.slots.some((s) => s.id === `s${k}`)) k++; return `s${k}`; };
    return (
      <>
        <Row label="Name"><BufferedInput value={d.label} aria-label={t('Instance name')} onCommit={(label) => label.trim() && set({ label: label.trim() })} /></Row>
        <Row label="Class">
          <BufferedInput value={d.className ?? ''} placeholder="Customer" aria-label={t('Class of the object')} onCommit={(className) => set({ className: className.trim() || undefined })} />
        </Row>
        {classNodes.length > 0 && (
          <Row label="Pick class">
            <select aria-label={t('Pick a class of the page')} value="" onChange={(e) => e.target.value && set({ className: e.target.value })}>
              <option value="">{t('(choose)')}</option>
              {classNodes.map((c) => <option key={c.id} value={classOf(c).label}>{classOf(c).label}</option>)}
            </select>
          </Row>
        )}
        {d.slots.map((s) => (
          <div className="prop-row" key={s.id} data-testid={`slot-row-${s.id}`}>
            <BufferedInput value={s.name} aria-label={t('Slot {id} attribute', { id: s.id })} onCommit={(name) => name.trim() && setSlot(s.id, { name: name.trim() })} />
            <BufferedInput value={s.value} placeholder={t('value')} aria-label={t('Slot {id} value', { id: s.id })} onCommit={(value) => setSlot(s.id, { value: value.trim() })} />
            <button type="button" aria-label={t('Remove slot {name}', { name: s.name })} onClick={() => set({ slots: d.slots.filter((x) => x.id !== s.id) })}>×</button>
          </div>
        ))}
        <div className="btn-row">
          <button type="button" onClick={() => set({ slots: [...d.slots, { id: nextId(), name: 'attribute', value: '' }] })}>{t('Add slot')}</button>
          {missing.length > 0 && <button type="button" onClick={() => { let k = d.slots.length; const used = new Set(d.slots.map((x) => x.id)); const add = missing.map((m) => { while (used.has(`s${k}`)) k++; used.add(`s${k}`); return { ...m, id: `s${k}` }; }); set({ slots: [...d.slots, ...add] }); }}>{t('Add missing attributes of {name}', { name: cls ? classOf(cls).label : '' })}</button>}
        </div>
        {colour(d.accent, (accent) => set({ accent }))}
        <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('Drawn as {title}. Drag from one object to another for a link; name the association and its roles in the link inspector.', { title: objectTitle(d) })}</p>
      </>
    );
  }
  if (node.type === 'deployment') {
    const d = node.data as unknown as DeploymentData;
    const set = (patch: Partial<DeploymentData>) => shape(node.id, (x) => ({ ...x, ...patch }));
    return (
      <>
        <Row label="Name"><BufferedInput value={d.label} aria-label={t('Name')} onCommit={(label) => label.trim() && set({ label: label.trim() })} /></Row>
        <Row label="Kind">
          <select aria-label={t('Deployment kind')} value={d.depKind} onChange={(e) => set({ depKind: e.target.value as DeploymentKind })}>
            {DEPLOYMENT_KINDS.map((k) => <option key={k} value={k}>{t(DEPLOYMENT_LABEL[k])}</option>)}
          </select>
        </Row>
        <Row label="Stereotype"><BufferedInput value={d.stereotype ?? ''} placeholder={d.depKind === 'executionEnvironment' ? 'Tomcat' : 'server'} aria-label={t('Stereotype')} onCommit={(stereotype) => set({ stereotype: stereotype.trim() || undefined })} /></Row>
        <Row label="Icon"><BufferedInput value={d.iconId ?? ''} placeholder={t('postgresql (architecture icon id)')} aria-label={t('Icon id')} onCommit={(iconId) => set({ iconId: iconId.trim() || undefined })} /></Row>
        {colour(d.accent, (accent) => set({ accent }))}
        <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
          {isDepContainerKind(d.depKind) ? t('Drop artifacts, components or other nodes inside to nest them.') + ' ' : ''}{t('Drag from one element to another for a communication path (type the protocol in its inspector), a deployment dependency (artifact to node) or a manifestation (artifact to component).')}
        </p>
      </>
    );
  }
  const d = node.data as unknown as ComponentData;
  const set = (patch: Partial<ComponentData>) => shape(node.id, (x) => ({ ...x, ...patch }));
  const iface = d.compKind === 'provided' || d.compKind === 'required';
  return (
    <>
      <Row label="Name"><BufferedInput value={d.label} aria-label={t('Name')} onCommit={(label) => label.trim() && set({ label: label.trim() })} /></Row>
      <Row label="Kind">
        <select aria-label={t('Component kind')} value={d.compKind} onChange={(e) => set({ compKind: e.target.value as ComponentData['compKind'], ...(e.target.value === 'provided' || e.target.value === 'required' ? { facing: d.facing ?? 'right' } : {}) })}>
          {COMPONENT_KINDS.map((k) => <option key={k} value={k}>{t(k === 'provided' ? 'Provided interface (lollipop)' : k === 'required' ? 'Required interface (socket)' : k[0].toUpperCase() + k.slice(1))}</option>)}
        </select>
      </Row>
      {!iface && <Row label="Stereotype"><BufferedInput value={d.stereotype ?? ''} placeholder="service" aria-label={t('Stereotype')} onCommit={(stereotype) => set({ stereotype: stereotype.trim() || undefined })} /></Row>}
      {iface && (
        <Row label="Facing">
          <select aria-label={t('Interface facing')} value={d.facing ?? 'right'} onChange={(e) => set({ facing: e.target.value as ComponentData['facing'] })}>
            {['right', 'left', 'up', 'down'].map((f) => <option key={f} value={f}>{t(f[0].toUpperCase() + f.slice(1))}</option>)}
          </select>
        </Row>
      )}
      {!iface && (
        <>
          {(d.ports ?? []).map((p) => (
            <div className="prop-row" key={p.id} data-testid={`port-row-${p.id}`}>
              <BufferedInput value={p.name} aria-label={t('Port {id} name', { id: p.id })} onCommit={(name) => name.trim() && shape(node.id, (x) => updatePort(x as unknown as ComponentData, p.id, { name: name.trim() }) as unknown as Record<string, unknown>)} />
              <select aria-label={t('Port {id} kind', { id: p.id })} value={p.kind} onChange={(e) => shape(node.id, (x) => updatePort(x as unknown as ComponentData, p.id, { kind: e.target.value as ComponentPort['kind'] }) as unknown as Record<string, unknown>)}>
                <option value="provided">{t('Provided')}</option>
                <option value="required">{t('Required')}</option>
              </select>
              <select aria-label={t('Port {id} side', { id: p.id })} value={p.side} onChange={(e) => shape(node.id, (x) => updatePort(x as unknown as ComponentData, p.id, { side: e.target.value as ComponentPort['side'] }) as unknown as Record<string, unknown>)}>
                {['left', 'right', 'top', 'bottom'].map((sd) => <option key={sd} value={sd}>{t(sd[0].toUpperCase() + sd.slice(1))}</option>)}
              </select>
              <button type="button" aria-label={t('Remove port {name}', { name: p.name })} onClick={() => shape(node.id, (x) => removePort(x as unknown as ComponentData, p.id) as unknown as Record<string, unknown>)}>×</button>
            </div>
          ))}
          <div className="btn-row">
            <button type="button" onClick={() => shape(node.id, (x) => addPort(x as unknown as ComponentData, 'provided') as unknown as Record<string, unknown>)}>{t('Add provided port')}</button>
            <button type="button" onClick={() => shape(node.id, (x) => addPort(x as unknown as ComponentData, 'required') as unknown as Record<string, unknown>)}>{t('Add required port')}</button>
          </div>
        </>
      )}
      {colour(d.accent, (accent) => set({ accent }))}
    </>
  );
}
