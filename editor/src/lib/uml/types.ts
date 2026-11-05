import type { CommMessage } from '../communication/types';

export type Visibility = '+' | '-' | '#' | '~' | '';
export const VISIBILITIES: Visibility[] = ['+', '-', '#', '~'];
export type ClassKind = 'class' | 'interface' | 'abstract' | 'enum';

export interface ClassParam {
  name: string;
  type?: string;
}
/** An attribute, an enum literal or an operation. `id` is stable (inline editing, reorder, search). */
export interface ClassMember {
  id: string;
  visibility: Visibility;
  name: string;
  /** attribute type, or the return type of an operation */
  type?: string;
  default?: string;
  static?: boolean;
  /** abstract operation (shown in italics) */
  abstract?: boolean;
  /** operations only */
  params?: ClassParam[];
}

/** What a `class` node stores in `node.data` (`label` is the class name, so rename / search keep working). */
export interface ClassNodeData {
  label: string;
  kind: ClassKind;
  /** type parameters without the brackets: `T, K extends Key` */
  generics?: string;
  /** an extra stereotype line («entity», «service» ...) for kind 'class' */
  stereotype?: string;
  attributes: ClassMember[];
  operations: ClassMember[];
  accent: string;
  collapsedAttributes?: boolean;
  collapsedOperations?: boolean;
  /** owning package / namespace (informational; drawn packages are group nodes) */
  package?: string;
  /** shared UML model: every class node of the file with the same `modelId` is a linked copy (name, kind, generics, stereotype and members stay equal; position and style are per copy) */
  modelId?: string;
}

export type UmlRelKind = 'inheritance' | 'realization' | 'composition' | 'aggregation' | 'association' | 'dependency' | 'note' | 'transition' | 'include' | 'extend' | 'generalization' | 'assembly' | 'communication' | 'deploy' | 'manifest' | 'import' | 'access' | 'merge' | 'link';
/** the kinds offered between classes */
export const UML_REL_KINDS: UmlRelKind[] = ['inheritance', 'realization', 'composition', 'aggregation', 'association', 'dependency', 'note'];
/** state machine transitions, use case relations, component connectors (schema v5) deployment paths, package relations (import / access / merge) and object links (additive) */
export const UML_EXTRA_KINDS: UmlRelKind[] = ['transition', 'include', 'extend', 'generalization', 'assembly', 'communication', 'deploy', 'manifest', 'import', 'access', 'merge', 'link'];
export const UML_ALL_KINDS: UmlRelKind[] = [...UML_REL_KINDS, ...UML_EXTRA_KINDS];

/**
 * What a UML relation edge stores in `edge.data.uml`. Direction: the marker sits on the TARGET end for inheritance and
 * realization (source = subclass / implementation, target = the parent / interface), for composition and aggregation
 * (source = part, target = whole), and association with `directed` / dependency (source depends on target).
 */
export interface UmlRelationData {
  kind: UmlRelKind;
  /** association only: draw an open arrowhead at the target (navigable) */
  directed?: boolean;
  /** multiplicity text next to the source / target end ("1", "0..*") */
  sourceMult?: string;
  targetMult?: string;
  /** role names next to the source / target end */
  sourceRole?: string;
  targetRole?: string;
  /** class associations: the attribute (member id) on the source / target class this end belongs to; the line attaches at that row */
  sourceMember?: string;
  targetMember?: string;
  /** component connectors: the port (id in `ComponentData.ports`) on the source / target component this end is attached to */
  sourcePort?: string;
  targetPort?: string;
  /** communication diagram: the numbered messages travelling over an object link (order = the numbering, see lib/communication/messages.ts) */
  messages?: CommMessage[];
}
