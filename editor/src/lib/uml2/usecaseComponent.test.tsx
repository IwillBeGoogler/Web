import type { ComponentProps } from 'react';
import { act, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { executeAction } from '../actions';
import { componentModelToDiagram } from '../component/convert';
import { UseCaseNode } from '../../components/usecase/UseCaseNode';
import { ComponentNode } from '../../components/component/ComponentNode';
import { computeRoutes, DEFAULT_ROUTING } from '../routing';
import { BUILTIN_SETTINGS } from '../settings';
import { flattenMenu, getMenuItems, type MenuContext } from '../menu';
import { umlEdge, umlOf } from '../uml/edges';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { actorNode, componentNode, useCaseNode } from './nodes';
import { detectDiagramKind, describeImport, importDiagramText, applyDiagramModel } from './importAny';
import { useCaseModelToDiagram } from '../usecase/convert';
import { renderUseCasePlantuml } from '../usecase/plantuml';
import { renderComponentPlantuml } from '../component/plantuml';
import type { ComponentData } from './types';
import { registerUmlSections } from '../../data/uml';
import type { DiagramNode } from '../../types';

registerUmlSections();
const s = () => useDiagramStore.getState();
beforeEach(() => {
  s().reset();
  useUiStore.getState().resetUi();
});
const ctx = (): MenuContext => ({ nodes: s().nodes, edges: s().edges, hasClipboard: false, hasStyleClip: false, pageCount: 1 });
const ids = (target: Parameters<typeof getMenuItems>[0]) => flattenMenu(getMenuItems(target, ctx())).map((i) => i.id);
const opts = { ...DEFAULT_ROUTING, edgeDefaults: BUILTIN_SETTINGS.edge, nodeDefaults: BUILTIN_SETTINGS.node };

describe('use case actions', () => {
  it('Tidy use cases arranges actors left / right and puts use cases inside the boundary', () => {
    const sys = { id: 'sys', type: 'group', position: { x: 0, y: 0 }, width: 100, height: 100, data: { label: 'S', variant: 'boundary' } } as DiagramNode;
    s().loadDiagram({ version: 1, nodes: [sys, { ...useCaseNode('u1', { x: 900, y: 900 }, 'Pay'), parentId: 'sys' }, actorNode('a1', { x: 5, y: 5 }, 'Buyer')], edges: [umlEdge('e', 'a1', 'u1', { kind: 'association', sourceMult: '1', targetMult: '*' })] } as never);
    executeAction('tidy-usecase');
    const n = (id: string) => s().nodes.find((x) => x.id === id)!;
    expect(n('sys').width!).toBeGreaterThan(100);
    expect(n('a1').position.x + n('a1').width!).toBeLessThan(n('sys').position.x);
    expect(n('u1').position.x).toBeLessThan(n('sys').width!);
    s().undo();
    expect(n('u1').position).toEqual({ x: 900, y: 900 });
  });
  it('association multiplicities are editable on an actor to use case edge', () => {
    s().addNode(actorNode('a', { x: 0, y: 0 }));
    s().addNode(useCaseNode('u', { x: 300, y: 0 }));
    const id = s().addUmlEdge('a', 'u', { kind: 'association' })!;
    s().updateUml([id], { sourceMult: '1', targetMult: '0..*' });
    expect(umlOf(s().edges[0])).toMatchObject({ sourceMult: '1', targetMult: '0..*' });
  });
  it('the extension point action appends a numbered point and grows the use case', () => {
    s().addNode({ ...useCaseNode('u', { x: 0, y: 0 }, 'Checkout'), selected: true });
    const h = s().nodes[0].height!;
    executeAction('uc-extension-point');
    expect(s().nodes[0].data.extensionPoints).toEqual(['point 1']);
    expect(s().nodes[0].height!).toBeGreaterThan(h);
  });
  it('menus and commands offer it', () => {
    s().addNode(useCaseNode('u', { x: 0, y: 0 }));
    expect(ids({ type: 'node', id: 'u' })).toEqual(expect.arrayContaining(['tidy-usecase', 'uc-extension-point']));
    expect(ids({ type: 'pane' })).toEqual(expect.arrayContaining(['tidy-usecase', 'tidy-component']));
  });
});

describe('component actions', () => {
  it('add port, nest, unnest, tidy', () => {
    s().addNode({ ...componentNode('c1', { x: 0, y: 0 }, 'component', 'Orders'), selected: true });
    s().addNode(componentNode('c2', { x: 300, y: 40 }, 'component', 'Pay'));
    executeAction('comp-port:required');
    executeAction('comp-port:provided');
    const ports = (s().nodes[0].data as unknown as ComponentData).ports!;
    expect(ports.map((p) => [p.kind, p.side])).toEqual([['required', 'right'], ['provided', 'left']]);
    expect(ids({ type: 'node', id: 'c1' })).toEqual(expect.arrayContaining(['comp-nest', 'tidy-component', 'comp-port:provided']));
    act(() => useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => ({ ...n, selected: true })) })));
    executeAction('comp-nest');
    const box = s().nodes.find((n) => n.data.container)!;
    expect(s().nodes.filter((n) => n.parentId === box.id)).toHaveLength(2);
    executeAction('tidy-component');
    expect(s().nodes.find((n) => n.id === 'c1')!.position.x).toBeLessThanOrEqual(s().nodes.find((n) => n.id === 'c2')!.position.x);
    executeAction('comp-unnest', { nodeId: 'c1' });
    expect(s().nodes.find((n) => n.id === 'c1')!.parentId).toBeUndefined();
  });
  it('dropping a connection on a port keeps the connector attached to it', () => {
    const a = { ...componentNode('a', { x: 0, y: 0 }), data: { ...componentNode('a', { x: 0, y: 0 }).data, ports: [{ id: 'p1', name: 'IA', kind: 'required', side: 'right', offset: 0.5 }] } } as DiagramNode;
    const b = { ...componentNode('b', { x: 400, y: 0 }), data: { ...componentNode('b', { x: 0, y: 0 }).data, ports: [{ id: 'p1', name: 'IA', kind: 'provided', side: 'left', offset: 0.5 }] } } as DiagramNode;
    s().loadDiagram({ version: 1, nodes: [a, b], edges: [] } as never);
    s().connect({ source: 'a', target: 'b', sourceHandle: 'p1', targetHandle: 'p1' });
    expect(umlOf(s().edges[0])).toMatchObject({ kind: 'dependency', sourcePort: 'p1', targetPort: 'p1' });
  });
});

describe('routing to ports', () => {
  it('a connector between two ports starts and ends on the border at the port height', () => {
    const ports = (kind: 'provided' | 'required', side: 'left' | 'right', offset: number) => [{ id: 'p1', name: 'I', kind, side, offset }];
    const a = { ...componentNode('a', { x: 0, y: 0 }), data: { ...componentNode('a', { x: 0, y: 0 }).data, ports: ports('required', 'right', 0.25) } } as DiagramNode;
    const b = { ...componentNode('b', { x: 400, y: 100 }), data: { ...componentNode('b', { x: 0, y: 0 }).data, ports: ports('provided', 'left', 0.75) } } as DiagramNode;
    const e = umlEdge('e', 'a', 'b', { kind: 'assembly', sourcePort: 'p1', targetPort: 'p1' });
    const r = computeRoutes([a, b], [e], opts).get('e')!;
    const first = r.points[0], last = r.points[r.points.length - 1];
    expect(first.x).toBeCloseTo(a.width!, 0);
    expect(first.y).toBeCloseTo(a.height! * 0.25, 0);
    expect(last.x).toBeCloseTo(400, 0);
    expect(last.y).toBeCloseTo(100 + b.height! * 0.75, 0);
  });
});

describe('rendering', () => {
  it('draws extension points in the use case and ports on the component border', () => {
    const uc = { ...useCaseNode('u', { x: 0, y: 0 }, 'Checkout'), data: { ...useCaseNode('u', { x: 0, y: 0 }).data, label: 'Checkout', extensionPoints: ['coupon'] } } as DiagramNode;
    const cp = componentModelToDiagram({ comps: [{ id: 'x', name: 'Svc', kind: 'component', provides: ['IApi'], requires: ['IDb'] }], links: [] }).nodes[0];
    render(
      <ReactFlowProvider>
        <UseCaseNode {...({ ...uc, selected: false } as unknown as ComponentProps<typeof UseCaseNode>)} />
        <ComponentNode {...({ ...cp, selected: false } as unknown as ComponentProps<typeof ComponentNode>)} />
      </ReactFlowProvider>,
    );
    expect(screen.getByTestId('usecase-eps-u')).toHaveTextContent('coupon');
    expect(screen.getByText('extension points')).toBeInTheDocument();
    const ports = screen.getByTestId(`ports-${cp.id}`);
    expect(ports.querySelectorAll('[data-kind="provided"]')).toHaveLength(1);
    expect(ports.querySelectorAll('[data-kind="required"]')).toHaveLength(1);
    expect(screen.getByText('IApi')).toBeInTheDocument();
    expect(screen.getByText('IDb')).toBeInTheDocument();
  });
});

describe('import detection and apply', () => {
  const uc = renderUseCasePlantuml({ actors: [{ id: 'a', name: 'User' }], cases: [{ id: 'u', name: 'Login' }], boundaries: [], relations: [{ from: 'a', to: 'u', kind: 'association' }] });
  const cp = renderComponentPlantuml({ comps: [{ id: 'c', name: 'Web', kind: 'component', provides: ['IWeb'], requires: [] }], links: [] });
  it('tells use case, component, sequence and state apart', () => {
    expect(detectDiagramKind(uc)).toBe('usecase');
    expect(detectDiagramKind(cp)).toBe('component');
    expect(detectDiagramKind('flowchart LR\n  a{{"User"}}:::actor\n  u(["Login"])\n  a --- u')).toBe('usecase');
    expect(detectDiagramKind('@startuml\nactor A\nA -> B : hi\nB --> A : ok\n@enduml')).toBe('sequence');
    expect(detectDiagramKind('@startuml\n[*] --> Idle\nstate Idle\n@enduml')).toBe('state');
    expect(detectDiagramKind('flowchart LR\n  a --> b')).toBeUndefined();
    expect(detectDiagramKind('@startuml\nclass A\ninterface B\nA --> B\n@enduml')).toBeUndefined();
  });
  it('imports into the page', () => {
    const r = importDiagramText(uc)!;
    expect(describeImport(r)).toMatchObject({ title: 'Use case diagram (PlantUML)', size: 2 });
    expect(applyDiagramModel(r, 'page', 'x')).toBe(2);
    expect(s().nodes.map((n) => n.type).sort()).toEqual(['usecase', 'usecase']);
    expect(s().edges).toHaveLength(1);
    const c = importDiagramText(cp)!;
    expect(describeImport(c).counts).toContain('1 interface ports');
    applyDiagramModel(c, 'page', 'y');
    expect(s().nodes.some((n) => n.type === 'component')).toBe(true);
  });
  it('a generated use case diagram keeps its edges after export and import', () => {
    const d = useCaseModelToDiagram({ actors: [{ id: 'a', name: 'A' }], cases: [{ id: 'u', name: 'U' }], boundaries: [], relations: [{ from: 'a', to: 'u', kind: 'association', fromMult: '1' }] });
    expect(umlOf(d.edges[0])!.sourceMult).toBe('1');
  });
});
