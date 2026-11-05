/** The project library: components, styles and theme tokens shared by every file of a project. MIRRORS server/src/schema/library.ts. */
export interface ComponentNodeDef {
  key: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  parentKey?: string;
  data: Record<string, unknown>;
}
export interface ComponentEdgeDef { key: string; source: string; target: string; data?: Record<string, unknown>; label?: string }
export interface ComponentDef {
  id: string;
  name: string;
  rev: number;
  width: number;
  height: number;
  mainFileId?: string;
  mainNodeId?: string;
  nodes: ComponentNodeDef[];
  edges?: ComponentEdgeDef[];
}
export interface ColorStyle { id: string; name: string; value: string; dark?: string }
export interface TextStyle { id: string; name: string; fontSize?: number; bold?: boolean; align?: string; color?: string }
export interface EffectStyle { id: string; name: string; shadow: { x: number; y: number; blur: number; color: string } | null }
export interface ThemeToken { id: string; name: string; light: string; dark: string }
export interface LibraryDoc {
  components: Record<string, ComponentDef>;
  styles: { colors: Record<string, ColorStyle>; texts: Record<string, TextStyle>; effects: Record<string, EffectStyle> };
  tokens: Record<string, ThemeToken>;
}
export const emptyLibraryDoc = (): LibraryDoc => ({ components: {}, styles: { colors: {}, texts: {}, effects: {} }, tokens: {} });
