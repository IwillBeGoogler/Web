import type { DiagramEdge, DiagramNode } from '../../types';
import { classOf } from '../uml/geometry';
import { umlEdge } from '../uml/edges';
import { withObjectSize } from './sizes';
import { OBJECT_ACCENT, type ObjectData, type ObjectSlot } from './types';

export const isObjectNode = (n: DiagramNode | undefined): boolean => n?.type === 'object';

export const objectNode = (id: string, position: { x: number; y: number }, label = 'object', extra: Partial<ObjectData> = {}): DiagramNode =>
  withObjectSize({ id, type: 'object', position, data: { label, slots: [], accent: OBJECT_ACCENT, ...extra } as unknown as DiagramNode['data'] } as DiagramNode);

/** lower camel instance name for a class: `OrderItem` -> `orderItem` */
export const instanceName = (cls: string): string => {
  const w = cls.replace(/<.*$/, '').replace(/[^A-Za-z0-9_]/g, '');
  return (w ? w[0].toLowerCase() + w.slice(1) : 'object');
};

/** One empty slot per attribute of the class node (operations and static-less enum literals are not slots). */
export function slotsFromClass(cls: DiagramNode): ObjectSlot[] {
  const c = classOf(cls);
  if (c.kind === 'enum') return [];
  return c.attributes.filter((a) => a.name.trim()).map((a, i) => ({ id: `s${i}`, name: a.name.trim(), value: '' }));
}

/** An object that instantiates the class: `className` = the class name, an empty slot for every attribute, placed to the right of the class (`at` = the class's canvas position). */
export function instantiateClass(cls: DiagramNode, id: string, taken: Set<string>, at: { x: number; y: number } = cls.position): DiagramNode {
  const c = classOf(cls);
  const base = instanceName(c.label);
  let name = base;
  for (let k = 1; taken.has(name); k++) name = `${base}${k}`;
  return objectNode(id, { x: at.x + (cls.width ?? 180) + 60, y: at.y }, name, { className: c.label, slots: slotsFromClass(cls) });
}

export const linkEdge = (id: string, source: string, target: string, label?: string): DiagramEdge => umlEdge(id, source, target, { kind: 'link' }, label ? { label } : {});
