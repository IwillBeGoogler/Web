export type CompKind = 'component' | 'node' | 'artifact';
/** A component, deployment node or artifact; interfaces are listed by name (they become ports on its border). */
export interface CompDef {
  id: string;
  name: string;
  kind: CompKind;
  stereotype?: string;
  /** id of the enclosing node / component */
  parent?: string;
  /** names of the interfaces this component provides (lollipop) / requires (socket) */
  provides: string[];
  requires: string[];
}
export interface CompLink {
  from: string;
  to: string;
  kind: 'dependency' | 'assembly';
  label?: string;
}
export interface ComponentModel { comps: CompDef[]; links: CompLink[] }
export const emptyComponentModel = (): ComponentModel => ({ comps: [], links: [] });
