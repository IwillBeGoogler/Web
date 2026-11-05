import type { CommMessage } from '../communication/types';
/** UML object diagram. `object` nodes are instance specifications (`name : Class`, slots `attribute = value`), joined by `edge.data.uml` of kind `link`. */
export const OBJECT_ACCENT = '#0e7490';

export interface ObjectSlot { id: string; name: string; value: string }
/** What an `object` node stores in `node.data`. `label` is the instance name, `className` the classifier (free text; the lint rule matches it to a class of the page). */
export interface ObjectData {
  label: string;
  className?: string;
  /** shared class model this object is an instance of (`className` follows the class name) */
  modelId?: string;
  slots: ObjectSlot[];
  accent: string;
}

export interface ObjDef { id: string; name: string; className?: string; slots: { name: string; value: string }[] }
/** `label` of a link is the association name; roles name its ends */
export interface ObjLink { from: string; to: string; label?: string; srcRole?: string; dstRole?: string; /** communication diagram: numbered messages on the link (then `label` is not used) */ messages?: CommMessage[] }
export interface ObjectModel { objects: ObjDef[]; links: ObjLink[] }
export const emptyObjectModel = (): ObjectModel => ({ objects: [], links: [] });

/** `name : Class` as drawn in the title compartment */
export const objectTitle = (d: Pick<ObjectData, 'label' | 'className'>): string => `${d.label ?? ''}${d.className ? ` : ${d.className}` : ''}`;
