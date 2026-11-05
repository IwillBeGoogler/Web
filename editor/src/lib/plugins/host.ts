/**
 * Host side of the plugin API: one PluginHost per running plugin. `handle` receives whatever came through postMessage (untrusted),
 * validates it with zod, checks the permission, applies document changes through ONE `transform` (= one undo step) and answers.
 */
import { z } from 'zod';
import type { DiagramEdge, DiagramNode } from '../../types';
import type { InstalledPlugin, Permission } from './manifest';

export interface PluginDoc {
  nodes: () => DiagramNode[];
  edges: () => DiagramEdge[];
  transform: (fn: (nodes: DiagramNode[], edges: DiagramEdge[]) => { nodes: DiagramNode[]; edges: DiagramEdge[] } | null) => boolean;
}
export interface HostEnv {
  doc: PluginDoc;
  notify: (message: string, kind: 'info' | 'success' | 'error') => void;
  panel: (o: { title?: string; height?: number }) => void;
  now?: () => number;
  newId?: (prefix: string) => string;
}
export type Reply = { sdd: 1; id: string | number; ok: true; result?: unknown } | { sdd: 1; id: string | number; ok: false; error: { code: string; message: string } };

const COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([0-9., %]{1,40}\)|transparent)$/i;
const color = z.string().max(40).regex(COLOR);
const text = z.string().max(2000);
/** the only node fields a plugin may write */
const NodeData = z.object({ label: text.optional(), subtitle: text.optional(), fill: color.optional(), stroke: color.optional(), textColor: color.optional(), iconId: z.string().max(100).optional(), fontSize: z.number().min(6).max(200).optional(), bold: z.boolean().optional() });
const num = z.number().finite().min(-1e6).max(1e6);
const KINDS = ['icon', 'text', 'shape', 'card', 'sticky'] as const;
const CreateParams = z.object({ nodes: z.array(z.object({ type: z.enum(KINDS), x: num, y: num, width: z.number().min(10).max(5000).optional(), height: z.number().min(10).max(5000).optional(), data: NodeData.optional() })).max(500) });
const UpdateParams = z.object({ updates: z.array(z.object({ id: z.string().min(1).max(100), x: num.optional(), y: num.optional(), data: NodeData.optional() })).max(500) });
const NotifyParams = z.object({ message: z.string().min(1).max(300), kind: z.enum(['info', 'success', 'error']).optional() });
const PanelParams = z.object({ title: z.string().max(80).optional(), height: z.number().min(40).max(600).optional() });
const Envelope = z.object({ sdd: z.literal(1), id: z.union([z.string().max(64), z.number()]), method: z.string().max(40), params: z.unknown().optional() });

const NEEDS: Record<string, Permission> = { getSelection: 'selection:read', getNodes: 'nodes:read', createNodes: 'nodes:write', updateNodes: 'nodes:write', showPanel: 'ui:panel', notify: 'notify' };
const TRANSIENT = new Set(['selected', 'dragging', 'measured', 'resizing']);
const RATE = { limit: 100, windowMs: 1000 };

const view = (n: DiagramNode) => ({
  id: n.id, type: n.type, position: n.position, width: n.width, height: n.height, parentId: n.parentId,
  data: Object.fromEntries(Object.entries(n.data).filter(([k]) => !TRANSIENT.has(k))),
});
const fail = (id: string | number, code: string, message: string): Reply => ({ sdd: 1, id, ok: false, error: { code, message } });

export class PluginHost {
  private stamps: number[] = [];
  constructor(readonly plugin: Pick<InstalledPlugin, 'id' | 'name' | 'permissions'> & Partial<InstalledPlugin>, private env: HostEnv) {}

  /** untrusted message in, reply out (null when the message is not even addressed to us) */
  async handle(raw: unknown): Promise<Reply | null> {
    const env = Envelope.safeParse(raw);
    if (!env.success) {
      const id = typeof raw === 'object' && raw !== null && 'id' in raw && (typeof (raw as { id: unknown }).id === 'string' || typeof (raw as { id: unknown }).id === 'number') ? (raw as { id: string | number }).id : null;
      return id === null ? null : fail(id, 'invalid_request', 'Malformed request');
    }
    const { id, method, params } = env.data;
    const now = (this.env.now ?? Date.now)();
    this.stamps = this.stamps.filter((t) => now - t < RATE.windowMs);
    if (this.stamps.length >= RATE.limit) return fail(id, 'rate_limited', 'Too many calls');
    this.stamps.push(now);
    const need = NEEDS[method];
    if (!need) return fail(id, 'unknown_method', `Unknown method "${method}"`);
    if (!this.plugin.permissions.includes(need)) return fail(id, 'permission_denied', `This plugin lacks the "${need}" permission`);
    try {
      return { sdd: 1, id, ok: true, result: this.run(method, params) };
    } catch (e) {
      if (e instanceof z.ZodError) return fail(id, 'invalid_params', e.issues.map((i) => `${i.path.join('.') || 'params'}: ${i.message}`).slice(0, 3).join('; '));
      return fail(id, 'failed', e instanceof Error ? e.message : 'Failed');
    }
  }

  private run(method: string, params: unknown): unknown {
    const { doc } = this.env;
    switch (method) {
      case 'getSelection': return doc.nodes().filter((n) => n.selected && !n.data.hidden).map(view);
      case 'getNodes': return doc.nodes().filter((n) => !n.data.hidden).map(view);
      case 'createNodes': {
        const p = CreateParams.parse(params ?? {});
        const ids = p.nodes.map(() => (this.env.newId ?? defaultId)('pl'));
        if (p.nodes.length)
          doc.transform((nodes, edges) => ({
            edges,
            nodes: [...nodes, ...p.nodes.map((c, i): DiagramNode => ({ id: ids[i], type: c.type, position: { x: c.x, y: c.y }, ...(c.width ? { width: c.width } : {}), ...(c.height ? { height: c.height } : {}), data: { label: '', ...(c.data ?? {}) } }))],
          }));
        return ids;
      }
      case 'updateNodes': {
        const p = UpdateParams.parse(params ?? {});
        const by = new Map(p.updates.map((u) => [u.id, u]));
        doc.transform((nodes, edges) => {
          if (!nodes.some((n) => by.has(n.id))) return null;
          return { edges, nodes: nodes.map((n) => { const u = by.get(n.id); return u ? { ...n, position: { x: u.x ?? n.position.x, y: u.y ?? n.position.y }, data: { ...n.data, ...(u.data ?? {}) } } : n; }) };
        });
        return null;
      }
      case 'notify': { const p = NotifyParams.parse(params ?? {}); this.env.notify(p.message, p.kind ?? 'info'); return null; }
      case 'showPanel': { const p = PanelParams.parse(params ?? {}); this.env.panel(p); return null; }
    }
    return null;
  }
}

let counter = 0;
const defaultId = (p: string) => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}`;
