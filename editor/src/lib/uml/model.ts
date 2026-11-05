import type { ClassKind, ClassMember, UmlRelKind } from './types';

export type MemberDef = Omit<ClassMember, 'id'>;
export interface UmlClassDef {
  name: string;
  kind: ClassKind;
  generics?: string;
  stereotype?: string;
  attributes: MemberDef[];
  operations: MemberDef[];
  /** owning package / namespace */
  package?: string;
  /** referenced by a hierarchy edge but not declared in the source */
  external?: boolean;
}
/** direction as drawn: `from` = subclass / implementation / part / dependent, `to` = parent / interface / whole / dependency */
export interface UmlRelDef {
  from: string;
  to: string;
  kind: UmlRelKind;
  directed?: boolean;
  /** multiplicity / role at the `from` and the `to` end */
  fromMult?: string;
  toMult?: string;
  fromRole?: string;
  toRole?: string;
  label?: string;
}
export interface UmlModel {
  classes: UmlClassDef[];
  relations: UmlRelDef[];
}
export interface UmlParseResult {
  model: UmlModel;
  warnings: string[];
}
export const emptyModel = (): UmlModel => ({ classes: [], relations: [] });
export const newClassDef = (name: string, extra: Partial<UmlClassDef> = {}): UmlClassDef => ({ name, kind: 'class', attributes: [], operations: [], ...extra });

/** class name without generic arguments or qualifiers: `Base<T>` -> `Base`, `a.b.Base` -> `Base` */
export const baseName = (s: string): string => s.replace(/<.*$/s, '').replace(/~.*$/s, '').trim().replace(/^.*\./, '');

export function modelCounts(m: UmlModel): { classes: number; interfaces: number; enums: number; members: number; relations: number } {
  const declared = m.classes.filter((c) => !c.external);
  return {
    classes: declared.filter((c) => c.kind === 'class' || c.kind === 'abstract').length,
    interfaces: declared.filter((c) => c.kind === 'interface').length,
    enums: declared.filter((c) => c.kind === 'enum').length,
    members: declared.reduce((a, c) => a + c.attributes.length + c.operations.length, 0),
    relations: m.relations.length,
  };
}

export function ensureClass(m: UmlModel, name: string, extra: Partial<UmlClassDef> = {}): UmlClassDef {
  let c = m.classes.find((x) => x.name === name);
  if (!c) { c = newClassDef(name, extra); m.classes.push(c); }
  return c;
}

/** add a relation unless an identical one (same ends and kind) exists */
export function addRelation(m: UmlModel, r: UmlRelDef): void {
  if (m.relations.some((x) => x.from === r.from && x.to === r.to && x.kind === r.kind && (x.label ?? '') === (r.label ?? ''))) return;
  m.relations.push(r);
}
