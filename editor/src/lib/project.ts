import type { Diagram, DiagramContent, Page, Project } from '../types';
import { newId } from './graph';
import { cleanDiagram, validateDiagram } from './serialization';
import { validateSettings } from './settings';
import { isViewport } from './viewport';
import { validGuides } from './design/validate';

export const emptyPage = (name = 'Page 1'): Page => ({ id: newId('pg'), name, nodes: [], edges: [] });

export function createProject(name: string, now = Date.now()): Project {
  const page = emptyPage('Page 1');
  return { version: 2, id: newId('prj'), name, createdAt: now, updatedAt: now, activePageId: page.id, pages: [page] };
}

/** v1 single diagram -> v2 one-page project. */
export function migrateV1(d: DiagramContent | Diagram, name = 'Untitled', now = Date.now()): Project {
  const page: Page = { id: newId('pg'), name: 'Page 1', nodes: d.nodes, edges: d.edges };
  return { version: 2, id: newId('prj'), name, createdAt: now, updatedAt: now, activePageId: page.id, pages: [page] };
}

export function duplicatePages(pages: Page[]): Page[] {
  return pages.map((p) => ({ ...structuredClone(p), id: newId('pg') }));
}

export type ProjectResult = { ok: true; project: Project } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function validAssets(raw: Record<string, unknown>): Record<string, { mime: string; data?: string }> {
  const out: Record<string, { mime: string; data?: string }> = {};
  for (const [hash, a] of Object.entries(raw))
    if (/^[0-9a-f]{64}$/.test(hash) && isObj(a) && typeof a.mime === 'string' && (a.data === undefined || typeof a.data === 'string') && /^image\//.test(a.mime))
      out[hash] = typeof a.data === 'string' ? { mime: a.mime, data: a.data } : { mime: a.mime };
  return out;
}

export function validateProject(raw: unknown): ProjectResult {
  if (!isObj(raw)) return { ok: false, error: 'Root must be an object' };
  if (raw.version === 1) {
    const r = validateDiagram(raw);
    return r.ok ? { ok: true, project: migrateV1(r.diagram) } : r;
  }
  if (raw.version !== 2) return { ok: false, error: 'Unsupported or missing version (expected 1 or 2)' };
  if (typeof raw.id !== 'string' || !raw.id) return { ok: false, error: 'Project id must be a non-empty string' };
  if (typeof raw.name !== 'string') return { ok: false, error: 'Project name must be a string' };
  if (!Array.isArray(raw.pages) || raw.pages.length === 0) return { ok: false, error: '"pages" must be a non-empty array' };
  const seen = new Set<string>();
  const pages: Page[] = [];
  for (const [i, p] of raw.pages.entries()) {
    if (!isObj(p)) return { ok: false, error: `pages[${i}] must be an object` };
    if (typeof p.id !== 'string' || !p.id) return { ok: false, error: `pages[${i}].id must be a non-empty string` };
    if (seen.has(p.id)) return { ok: false, error: `Duplicate page id "${p.id}"` };
    seen.add(p.id);
    if (typeof p.name !== 'string') return { ok: false, error: `pages[${i}].name must be a string` };
    const r = validateDiagram({ version: 1, nodes: p.nodes, edges: p.edges });
    if (!r.ok) return { ok: false, error: `Page "${p.name}": ${r.error}` };
    if (p.viewport !== undefined && !isViewport(p.viewport)) return { ok: false, error: `Page "${p.name}": viewport must be {x,y,zoom}` };
    if (p.flow !== undefined && typeof p.flow !== 'boolean') return { ok: false, error: `Page "${p.name}": flow must be boolean` };
    if (p.guides !== undefined && !validGuides(p.guides)) return { ok: false, error: `Page "${p.name}": guides must be an array of {id, axis x|y, pos}` };
    pages.push({ id: p.id, name: p.name, nodes: r.diagram.nodes, edges: r.diagram.edges, ...(p.viewport ? { viewport: p.viewport as Page['viewport'] } : {}), ...(p.flow ? { flow: true } : {}), ...(Array.isArray(p.guides) && p.guides.length ? { guides: p.guides as Page['guides'] } : {}) });
  }
  const active = typeof raw.activePageId === 'string' ? raw.activePageId : pages[0].id;
  if (!seen.has(active)) return { ok: false, error: 'activePageId does not reference a page' };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Date.now());
  return {
    ok: true,
    project: {
      version: 2, id: raw.id, name: raw.name, createdAt: num(raw.createdAt), updatedAt: num(raw.updatedAt), activePageId: active, pages,
      ...(raw.settings !== undefined && Object.keys(validateSettings(raw.settings)).length ? { settings: validateSettings(raw.settings) } : {}),
      ...(isObj(raw.assets) ? { assets: validAssets(raw.assets) } : {}),
    },
  };
}

export function parseProject(text: string): ProjectResult {
  try {
    return validateProject(JSON.parse(text));
  } catch {
    return { ok: false, error: 'Not valid JSON' };
  }
}

export function serializeProject(p: Project): string {
  return JSON.stringify(
    { ...p, pages: p.pages.map((pg) => ({ ...pg, ...pickContent(cleanDiagram({ version: 1, nodes: pg.nodes, edges: pg.edges })) })) },
    null,
    2,
  );
}

const pickContent = (d: Diagram) => ({ nodes: d.nodes, edges: d.edges });
