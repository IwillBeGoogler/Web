import type { DiagramEdge, MarkerKind } from '../../types';
import { styleEdge } from '../graph';
import { UML_REL_KINDS, type UmlRelKind, type UmlRelationData } from './types';

/** default edge text for the use case relations */
export const STEREO_LABEL: Partial<Record<UmlRelKind, string>> = { include: '«include»', extend: '«extend»', deploy: '«deploy»', manifest: '«manifest»', import: '«import»', access: '«access»', merge: '«merge»' };

/** mid-gray, readable on white and on dark canvases (same as ER relations) */
export const UML_COLOR = '#7b8499';

export const UML_REL_LABEL: Record<UmlRelKind, string> = {
  inheritance: 'Inheritance (extends)',
  realization: 'Realization (implements)',
  composition: 'Composition',
  aggregation: 'Aggregation',
  association: 'Association',
  dependency: 'Dependency',
  note: 'Note link',
  transition: 'Transition',
  include: 'Include (<<include>>)',
  extend: 'Extend (<<extend>>)',
  generalization: 'Generalization',
  assembly: 'Assembly connector',
  communication: 'Communication path',
  deploy: 'Deployment dependency (<<deploy>>)',
  manifest: 'Manifestation (<<manifest>>)',
  import: 'Package import (<<import>>)',
  access: 'Package access (<<access>>)',
  merge: 'Package merge (<<merge>>)',
  link: 'Object link',
};

/** Markers and dash for a relation. The marker always sits on the target end (see UmlRelationData). */
export function umlEnds(u: Pick<UmlRelationData, 'kind' | 'directed'>): { start: MarkerKind; end: MarkerKind; dashed: boolean } {
  switch (u.kind) {
    case 'inheritance': return { start: 'none', end: 'hollowTriangle', dashed: false };
    case 'realization': return { start: 'none', end: 'hollowTriangle', dashed: true };
    case 'composition': return { start: 'none', end: 'filledDiamond', dashed: false };
    case 'aggregation': return { start: 'none', end: 'hollowDiamond', dashed: false };
    case 'dependency': return { start: 'none', end: 'open', dashed: true };
    case 'note': return { start: 'none', end: 'none', dashed: true };
    case 'transition': return { start: 'none', end: 'arrow', dashed: false };
    case 'include': case 'extend': return { start: 'none', end: 'open', dashed: true };
    case 'generalization': return { start: 'none', end: 'hollowTriangle', dashed: false };
    case 'assembly': return { start: 'none', end: 'none', dashed: false };
    case 'communication': case 'link': return { start: 'none', end: 'none', dashed: false };
    case 'deploy': case 'manifest': case 'import': case 'access': case 'merge': return { start: 'none', end: 'open', dashed: true };
    default: return { start: 'none', end: u.directed ? 'open' : 'none', dashed: false };
  }
}

const apply = (data: NonNullable<DiagramEdge['data']>, uml: UmlRelationData): NonNullable<DiagramEdge['data']> => {
  const ends = umlEnds(uml);
  return { ...data, uml, color: UML_COLOR, arrows: 'none', startMarker: ends.start, endMarker: ends.end, strokeStyle: ends.dashed ? 'dashed' : 'solid', dashed: ends.dashed };
};

/** Build a UML relation edge: source is the subclass / part / dependent, target the parent / whole / dependency. */
export function umlEdge(id: string, source: string, target: string, uml: UmlRelationData, extra: Partial<DiagramEdge> = {}): DiagramEdge {
  const label = extra.label ?? STEREO_LABEL[uml.kind];
  return styleEdge({ id, source, target, ...extra, ...(label ? { label } : {}), data: apply(extra.data ?? {}, uml) } as DiagramEdge);
}

/** Change the relation data of an edge (kind, multiplicities, roles); markers and dash follow the kind. */
export function withUml(e: DiagramEdge, patch: Partial<UmlRelationData>): DiagramEdge {
  const cur = (e.data?.uml as UmlRelationData | undefined) ?? { kind: 'association' };
  const next = { ...cur, ...patch };
  // «include» / «extend» labels follow the kind unless the user wrote their own text
  const stereo = Object.values(STEREO_LABEL);
  const label = patch.kind && patch.kind !== cur.kind && (!e.label || stereo.includes(String(e.label))) ? STEREO_LABEL[next.kind] : e.label;
  const { label: _old, ...rest } = e;
  return styleEdge({ ...rest, ...(label ? { label } : {}), data: apply(e.data ?? {}, next) } as DiagramEdge);
}

export const umlOf = (e: DiagramEdge): UmlRelationData | undefined => e.data?.uml as UmlRelationData | undefined;
export const isUmlEdge = (e: DiagramEdge): boolean => !!e.data?.uml;

/** Palette presets for "UML relations" */
export const UML_PRESETS: { id: string; kind: UmlRelKind; label: string; directed?: boolean }[] = UML_REL_KINDS.map((kind) => ({ id: `uml-rel-${kind}`, kind, label: UML_REL_LABEL[kind] }));
