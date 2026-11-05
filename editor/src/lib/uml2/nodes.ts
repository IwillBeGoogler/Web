import type { DiagramNode } from '../../types';
import { isCompositeNode } from '../state/convert';
import type { UmlRelKind } from '../uml/types';
import { isPackageNode } from '../package/nodes';
import { withShapeSize } from './sizes';
import { COMP_ACCENT, UC_ACCENT, type ComponentData, type ComponentKind, type UseCaseData } from './types';

export { shapeSize, withShapeSize } from './sizes';

const mk = (id: string, type: 'usecase' | 'component', position: { x: number; y: number }, data: object): DiagramNode =>
  withShapeSize({ id, type, position, data: data as DiagramNode['data'] } as DiagramNode);

export const actorNode = (id: string, position: { x: number; y: number }, label = 'Actor'): DiagramNode =>
  mk(id, 'usecase', position, { label, ucKind: 'actor', accent: UC_ACCENT } satisfies UseCaseData);
export const useCaseNode = (id: string, position: { x: number; y: number }, label = 'Use case'): DiagramNode =>
  mk(id, 'usecase', position, { label, ucKind: 'usecase', accent: UC_ACCENT } satisfies UseCaseData);
export const componentNode = (id: string, position: { x: number; y: number }, compKind: ComponentKind = 'component', label?: string): DiagramNode => {
  const names: Record<ComponentKind, string> = { component: 'Component', node: 'Node', artifact: 'artifact.jar', provided: 'IProvided', required: 'IRequired' };
  const data: ComponentData = { label: label ?? names[compKind], compKind, accent: COMP_ACCENT, ...(compKind === 'provided' || compKind === 'required' ? { facing: 'right' as const } : {}) };
  return mk(id, 'component', position, data);
};
/** the system boundary: a titled container drawn around the use cases */
export const boundaryNode = (id: string, position: { x: number; y: number }, label = 'System', w = 420, h = 320): DiagramNode => ({
  id, type: 'group', position, width: w, height: h, style: { width: w, height: h },
  data: { label, variant: 'boundary', accent: UC_ACCENT, stroke: UC_ACCENT, fillOpacity: 3, border: true },
} as DiagramNode);

/** What a drag from `a` to `b` should draw; undefined when the pair has no UML meaning here. */
export function defaultRelation(a: DiagramNode, b: DiagramNode): UmlRelKind | undefined {
  const stateLike = (n: DiagramNode) => n.type === 'state' || isCompositeNode(n);
  if (stateLike(a) && stateLike(b)) return 'transition';
  if (a.type === 'activity' && b.type === 'activity') return a.data.actKind === 'note' || b.data.actKind === 'note' ? 'note' : 'transition';
  if (a.type === 'usecase' && b.type === 'usecase') {
    const ka = a.data.ucKind, kb = b.data.ucKind;
    if (ka === 'actor' && kb === 'actor') return 'generalization';
    if (ka === 'usecase' && kb === 'usecase') return 'include';
    return 'association';
  }
  if (a.type === 'object' && b.type === 'object') return 'link';
  if (isPackageNode(a) && isPackageNode(b)) return 'dependency';
  if (a.type === 'deployment' && b.type === 'deployment') {
    const ka = a.data.depKind, kb = b.data.depKind;
    if (ka === 'artifact' && kb === 'component') return 'manifest';
    if (ka === 'artifact' && kb !== 'artifact') return 'deploy';
    return 'communication';
  }
  if (a.type === 'component' && b.type === 'component') {
    const iface = (n: DiagramNode) => n.data.compKind === 'provided' || n.data.compKind === 'required';
    return iface(a) || iface(b) ? 'assembly' : 'dependency';
  }
  return undefined;
}
