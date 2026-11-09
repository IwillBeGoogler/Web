/** Quick fixes of lint problems (kept apart from the linter so the editor can apply them without loading the icon catalog). */
import type { CPage } from './types';
import { archOf, archScale, hasArch } from './arch';
import { roleOf } from './lint';

export interface Fix {
  kind: 'add-index' | 'add-pk' | 'sync-type' | 'set-not-null' | 'remove-node' | 'remove-edge' | 'add-operation' | 'add-impl' | 'set-arch' | 'add-replica';
  label: string;
  nodeId: string;
  column?: string;
  /** sync-type: the type to copy */
  type?: string;
  /** remove-edge: the edge to delete */
  edgeId?: string;
  /** add-operation: the operation name */
  name?: string;
  /** set-arch: fields merged into node.data.arch */
  arch?: Record<string, string | number | boolean>;
}

/** the page with a quick fix applied (the input is not modified) */
export function applyFix(page: CPage, fix: Fix): CPage {
  const next = structuredClone(page);
  if (fix.kind === 'remove-edge') {
    next.edges = next.edges.filter((e) => e.id !== fix.edgeId);
    return next;
  }
  const t = next.nodes.find((n) => n.id === fix.nodeId);
  if (!t) return next;
  if (fix.kind === 'remove-node') {
    next.nodes = next.nodes.filter((n) => n.id !== t.id);
    next.edges = next.edges.filter((e) => e.source !== t.id && e.target !== t.id);
    return next;
  }
  if (fix.kind === 'set-arch') {
    t.data.arch = { ...(hasArch(t) ? (t.data.arch as object) : {}), ...(fix.arch ?? {}) };
    return next;
  }
  if (fix.kind === 'add-replica') {
    const cap = (t.data.capacity && typeof t.data.capacity === 'object' ? t.data.capacity : {}) as Record<string, unknown>;
    const role = roleOf(t);
    const count = typeof cap.replicas === 'number' ? cap.replicas : (archScale(t, role)?.count ?? 1);
    if (hasArch(t) && role === 'service') t.data.arch = { ...(t.data.arch as object), instances: Number(archOf(t, role).instances) + 1 };
    else t.data.capacity = { ...cap, replicas: Math.max(1, count) + 1 };
    return next;
  }
  if (fix.kind === 'add-operation') {
    if (!fix.name) return next;
    const ops: any[] = (t.data.operations ??= []);
    if (ops.some((o) => o.name === fix.name)) return next;
    const used = new Set([...(t.data.attributes ?? []), ...ops].map((m: any) => m.id));
    let k = ops.length;
    while (used.has(`o${k}`)) k++;
    ops.push({ id: `o${k}`, visibility: '+', name: fix.name, params: [], type: 'void' });
    return next;
  }
  if (fix.kind === 'add-impl') {
    const ids = new Set(next.nodes.map((n) => n.id));
    let id = `${t.id}_impl`;
    for (let k = 2; ids.has(id); k++) id = `${t.id}_impl${k}`;
    const label = String(t.data.label);
    const name = /^I[A-Z]/.test(label) ? label.slice(1) : `${label}Impl`;
    const ops = ((t.data.operations ?? []) as any[]).map((o, i) => {
      const { abstract: _a, ...rest } = o;
      void _a;
      return { ...rest, id: `o${i}` };
    });
    next.nodes.push({ id, type: 'class', position: { x: t.position.x, y: t.position.y + (t.height ?? 140) + 80 }, data: { label: name, kind: 'class', accent: '#2f6fdb', attributes: [], operations: ops } });
    next.edges.push({ id: `${id}_real`, source: id, target: t.id, data: { uml: { kind: 'realization' } } });
    return next;
  }
  const cols: any[] = t.data.columns ?? [];
  if (fix.kind === 'add-index' && fix.column) {
    const idx: any[] = (t.data.indexes ??= []);
    if (!idx.some((i) => i.columns[0] === fix.column)) idx.push({ name: `idx_${String(t.data.label)}_${fix.column}`, columns: [fix.column], unique: false });
  } else if (fix.kind === 'add-pk') {
    let m = -1;
    for (const c of cols) { const r = /^c(\d+)$/.exec(c.id); if (r) m = Math.max(m, Number(r[1])); }
    const name = cols.some((c) => c.name === 'id') ? 'id_pk' : 'id';
    cols.unshift({ id: `c${m + 1}`, name, type: 'bigint', pk: true, unique: false, nullable: false, generated: 'identity' });
    t.data.columns = cols;
  } else if (fix.kind === 'sync-type') {
    const c = cols.find((x) => x.name === fix.column);
    if (c && fix.type) c.type = fix.type;
  } else if (fix.kind === 'set-not-null') {
    const c = cols.find((x) => x.name === fix.column);
    if (c) c.nullable = false;
    for (const e of next.edges) if (e.target === t.id && e.data?.relation?.toCol === c?.id) e.data!.relation.optional = false;
  }
  return next;
}
