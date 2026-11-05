import { nextMemberId } from './geometry';
import { parseMember } from './member';
import type { ClassMember, ClassNodeData } from './types';
import { reorderRows } from '../rows/engine';

export type Compartment = 'attributes' | 'operations';

export function addMember(d: ClassNodeData, kind: 'attribute' | 'operation'): ClassNodeData {
  if (kind === 'attribute') {
    const enumLit = d.kind === 'enum';
    return { ...d, collapsedAttributes: false, attributes: [...d.attributes, { id: nextMemberId(d, 'a'), visibility: enumLit ? '' : '-', name: enumLit ? 'VALUE' : 'attribute', ...(enumLit ? {} : { type: 'string' }) }] };
  }
  return { ...d, collapsedOperations: false, operations: [...d.operations, { id: nextMemberId(d, 'o'), visibility: '+', name: 'operation', params: [], type: 'void' }] };
}

const both = (d: ClassNodeData, fn: (list: ClassMember[]) => ClassMember[]): ClassNodeData => ({ ...d, attributes: fn(d.attributes), operations: fn(d.operations) });
export const removeMember = (d: ClassNodeData, id: string): ClassNodeData => both(d, (l) => l.filter((m) => m.id !== id));
export const patchMember = (d: ClassNodeData, id: string, patch: Partial<ClassMember>): ClassNodeData => both(d, (l) => l.map((m) => (m.id === id ? { ...m, ...patch } : m)));

export function moveMember(d: ClassNodeData, comp: Compartment, id: string, to: number): ClassNodeData {
  const list = d[comp];
  if (!list.some((m) => m.id === id)) return d;
  const order = reorderRows(list.map((m) => m.id), id, to);
  return { ...d, [comp]: order.map((i) => list.find((m) => m.id === i)!) };
}

/** Replace a member by what its row text says (enum literals have no visibility). */
export function setMemberText(d: ClassNodeData, comp: Compartment, id: string, text: string): ClassNodeData {
  const kind = comp === 'attributes' ? 'attribute' : 'operation';
  const parsed = parseMember(text, kind);
  const lit = d.kind === 'enum' && comp === 'attributes';
  return { ...d, [comp]: d[comp].map((m) => (m.id === id ? ({ id, ...parsed, visibility: lit && !/^\s*[+\-#~]/.test(text) ? '' : parsed.visibility } as ClassMember) : m)) };
}

export const toggleCompartment = (d: ClassNodeData, comp: Compartment): ClassNodeData =>
  comp === 'attributes' ? { ...d, collapsedAttributes: !d.collapsedAttributes } : { ...d, collapsedOperations: !d.collapsedOperations };

/** "Repository<T>" typed into the name field -> class name + generics */
export function parseName(text: string): { label: string; generics: string | undefined } {
  const m = /^\s*([^<\s]+)\s*<(.*)>\s*$/.exec(text);
  return m ? { label: m[1], generics: m[2].trim() || undefined } : { label: text.trim(), generics: undefined };
}
