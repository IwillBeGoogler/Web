export type UcRelKind = 'association' | 'include' | 'extend' | 'generalization';
export interface UcActor { id: string; name: string }
export interface UcCase {
  id: string;
  name: string;
  /** named points where extending use cases add behaviour */
  extensionPoints?: string[];
  /** id of the system boundary that holds the use case */
  boundary?: string;
}
export interface UcBoundary { id: string; name: string }
/** `from` is the actor / the including / the extending / the specialised element (same direction as the edge in the diagram). */
export interface UcRelation {
  from: string;
  to: string;
  kind: UcRelKind;
  label?: string;
  fromMult?: string;
  toMult?: string;
}
export interface UseCaseModel {
  actors: UcActor[];
  cases: UcCase[];
  boundaries: UcBoundary[];
  relations: UcRelation[];
}
export const emptyUseCaseModel = (): UseCaseModel => ({ actors: [], cases: [], boundaries: [], relations: [] });
