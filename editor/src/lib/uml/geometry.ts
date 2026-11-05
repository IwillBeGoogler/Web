import type { DiagramNode } from '../../types';
import { layoutRows, rowAnchorY, type CompartmentSpec, type RowLayout } from '../rows/engine';
import { displayName, memberText } from './member';
import type { ClassKind, ClassNodeData } from './types';

/** Fixed metrics, like ER's: every row is addressable without touching the DOM. */
export const CLS = {
  headerH: 36,
  stereoH: 16,
  rowH: 22,
  pad: 4,
  summaryH: 20,
  bottomPad: 2,
  minW: 160,
  maxW: 420,
  charW: 6.9,
  sidePad: 28,
} as const;

export const classOf = (n: DiagramNode): ClassNodeData => n.data as unknown as ClassNodeData;
export const isClassNode = (n: DiagramNode | undefined): n is DiagramNode & { data: ClassNodeData } => n?.type === 'class';

const STEREO: Partial<Record<ClassKind, string>> = { interface: 'interface', abstract: 'abstract', enum: 'enum' };
/** stereotype lines above the name (`«interface»`) */
export function headerLines(d: ClassNodeData): string[] {
  const s = STEREO[d.kind] ?? (d.stereotype?.trim() || undefined);
  return s ? [`«${s}»`] : [];
}

/** Which compartments are drawn. UML shows both for a class even when empty; an interface hides an empty attribute list; an enum has literals only. */
export function shownCompartments(d: ClassNodeData): ('attributes' | 'operations')[] {
  if (d.kind === 'enum') return ['attributes'];
  if (d.kind === 'interface' && d.attributes.length === 0) return ['operations'];
  return ['attributes', 'operations'];
}

export function classLayout(d: ClassNodeData): RowLayout {
  const headerH = CLS.headerH + headerLines(d).length * CLS.stereoH;
  const comps: CompartmentSpec[] = shownCompartments(d).map((id) => {
    const members = id === 'attributes' ? d.attributes : d.operations;
    const collapsed = id === 'attributes' ? !!d.collapsedAttributes : !!d.collapsedOperations;
    return { id, rows: members.map((m) => m.id), padTop: CLS.pad, padBottom: CLS.pad, collapsed: collapsed && members.length > 0, summaryH: CLS.summaryH };
  });
  return layoutRows({ headerH, rowH: CLS.rowH, bottomPad: CLS.bottomPad, compartments: comps });
}

export function classWidth(d: ClassNodeData): number {
  let w = displayName(d).length * (CLS.charW + 1.2) + 40;
  for (const m of d.attributes) w = Math.max(w, memberText(m, 'attribute').length * CLS.charW + CLS.sidePad);
  for (const m of d.operations) w = Math.max(w, memberText(m, 'operation').length * CLS.charW + CLS.sidePad);
  return Math.round(Math.min(CLS.maxW, Math.max(CLS.minW, w)) / 10) * 10;
}
export const classSize = (d: ClassNodeData): { width: number; height: number } => ({ width: classWidth(d), height: classLayout(d).height });

/** Local y of a member row's centre (the header centre when hidden by a collapse). */
export const memberCenterY = (d: ClassNodeData, memberId: string | undefined): number => rowAnchorY(classLayout(d), memberId);

export function withClassSize(n: DiagramNode): DiagramNode {
  const { width, height } = classSize(classOf(n));
  return { ...n, width, height, style: { ...(n.style ?? {}), width, height } };
}

export function nextMemberId(d: Pick<ClassNodeData, 'attributes' | 'operations'>, prefix: 'a' | 'o'): string {
  let max = -1;
  for (const m of prefix === 'a' ? d.attributes : d.operations) {
    const x = /^[ao](\d+)$/.exec(m.id);
    if (x) max = Math.max(max, Number(x[1]));
  }
  return `${prefix}${max + 1}`;
}

export const UML_ACCENT = '#2f6fdb';
export const KIND_ACCENT: Record<ClassKind, string> = { class: '#2f6fdb', interface: '#0f9d8f', abstract: '#8e5bd6', enum: '#e8710a' };

/** A new class / interface / abstract class / enum node with starter members. */
export function blankClass(id: string, position: { x: number; y: number }, kind: ClassKind = 'class', label?: string): DiagramNode {
  const names: Record<ClassKind, string> = { class: 'ClassName', interface: 'InterfaceName', abstract: 'AbstractClass', enum: 'EnumName' };
  const data: ClassNodeData = {
    label: label ?? names[kind],
    kind,
    accent: KIND_ACCENT[kind],
    attributes:
      kind === 'enum'
        ? [{ id: 'a0', visibility: '', name: 'VALUE_ONE' }, { id: 'a1', visibility: '', name: 'VALUE_TWO' }]
        : kind === 'interface'
          ? []
          : [{ id: 'a0', visibility: '-', name: 'attribute', type: 'string' }],
    operations:
      kind === 'enum'
        ? []
        : [{ id: 'o0', visibility: '+', name: 'operation', params: [], type: 'void', ...(kind === 'abstract' ? { abstract: true } : {}) }],
  };
  return withClassSize({ id, type: 'class', position, data: data as unknown as DiagramNode['data'] } as DiagramNode);
}
