/**
 * Loose structural types of a diagram document. The authoritative validation is the zod schema (src/schema/project.ts on the
 * server, lib/sdd/schema.ts on the client); these are the shapes the pure helpers in `core/` operate on, so the same code runs in
 * the browser and in the server (MCP tools). `core/` must stay dependency-free: no DOM, no node APIs, no AI.
 */
export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface CNode {
  id: string;
  type: string;
  position: Pt;
  data: { label: string; [k: string]: any };
  width?: number;
  height?: number;
  parentId?: string;
  [k: string]: any;
}
export interface CEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  data?: { [k: string]: any };
  [k: string]: any;
}
export interface CPage { id: string; name: string; nodes: CNode[]; edges: CEdge[]; [k: string]: any }
export interface CDoc { version?: number; id?: string; name?: string; activePageId: string; pages: CPage[]; [k: string]: any }

export const DEFAULT_SIZE = { width: 120, height: 96 };
export const nodeSize = (n: Pick<CNode, 'width' | 'height'> & { measured?: { width?: number; height?: number } }): { width: number; height: number } => ({
  width: n.width ?? n.measured?.width ?? DEFAULT_SIZE.width,
  height: n.height ?? n.measured?.height ?? DEFAULT_SIZE.height,
});
