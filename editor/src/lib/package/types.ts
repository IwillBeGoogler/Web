/**
 * UML package diagram, a view over the class packages: a package is a `group` node (variant `package`, the tab folder) that holds
 * packages and `class` nodes by `parentId`. The package relations are `edge.data.uml` of kind import / access / merge or dependency.
 */
export const PACKAGE_LINK_KINDS = ['import', 'access', 'merge', 'dependency'] as const;
export type PackageLinkKind = (typeof PACKAGE_LINK_KINDS)[number];
export const PACKAGE_STYLE = { stroke: '#4b5563', accent: '#4b5563', fillOpacity: 0, border: true, strokeWidth: 1.5, strokeStyle: 'solid' } as const;

export interface PkgDef { id: string; name: string; parent?: string }
export type PkgClassKind = 'class' | 'interface' | 'abstract' | 'enum';
/** `attributes` / `operations`: member text like "- id: number" / "+ place(): void"; left out, the class gets the placeholder members of a new class */
export interface PkgClassDef { id: string; name: string; kind: PkgClassKind; parent?: string; attributes?: string[]; operations?: string[] }
/** `label` is the text of the arrow; import / access / merge carry «import» etc. by default */
export interface PkgLink { from: string; to: string; kind: PackageLinkKind; label?: string }
export interface PackageModel { packages: PkgDef[]; classes: PkgClassDef[]; links: PkgLink[] }
export const emptyPackageModel = (): PackageModel => ({ packages: [], classes: [], links: [] });
