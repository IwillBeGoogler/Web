import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import pkg from '../../../package.json';
import type { DiagramEdge, DiagramNode, Page, Project, ProjectAsset } from '../../types';
import { cleanDiagram, validateDiagram } from '../serialization';
import { hasIcon } from '../../data/icons';
import { CURRENT_SCHEMA, migratePageFile, migrateProjectFile } from './migrations';
import { ManifestSchema, PageFileSchema, ProjectFileSchema } from './schema';
import { sha256Hex } from './sha256';
import type { PartialSettings } from '../settings';
import { parseDsl } from '@core/dsl/parse';
import { printPage } from '@core/dsl/print';
import type { CPage } from '@core/types';

export const SDD_MIMETYPE = 'application/vnd.sdd+zip';
export const FORMAT_VERSION = 1;
export const APP_VERSION: string = pkg.version;

export type SddErrorCode =
  | 'too-large' | 'corrupt-zip' | 'zip-bomb' | 'too-many-entries' | 'unsafe-path' | 'bad-mimetype'
  | 'missing-entry' | 'bad-json' | 'schema' | 'checksum' | 'asset' | 'unsupported' | 'bad-tree';

export class SddError extends Error {
  constructor(public code: SddErrorCode, message: string, public entry?: string) {
    super(message);
    this.name = 'SddError';
  }
}

export interface SddLimits {
  /** reject files larger than this (default 100 MB) */
  maxFileBytes?: number;
  /** total uncompressed bytes allowed (default 300 MB) - zip bomb guard */
  maxUncompressedBytes?: number;
  maxEntries?: number;
}
export const DEFAULT_LIMITS: Required<SddLimits> = { maxFileBytes: 100 * 1024 * 1024, maxUncompressedBytes: 300 * 1024 * 1024, maxEntries: 2000 };

const MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
const EXT_BY_MIME: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

const b64ToBytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export const json = (v: unknown) => strToU8(JSON.stringify(v, null, 2));
export const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

export interface BuildOptions {
  thumbnails?: Record<string, Uint8Array>;
  appVersion?: string;
}

/** Project -> .sdd bytes (ZIP: mimetype first and stored, manifest, project, pages, assets, thumbnails). */
export function buildSdd(project: Project, opts: BuildOptions = {}): Uint8Array {
  const pageFiles: { page: Page; path: string; bytes: Uint8Array }[] = project.pages.map((p) => {
    const clean = cleanDiagram({ version: 1, nodes: p.nodes, edges: p.edges });
    const file = {
      schemaVersion: CURRENT_SCHEMA,
      id: p.id,
      name: p.name,
      nodes: clean.nodes,
      edges: clean.edges,
      ...(p.viewport ? { viewport: p.viewport } : {}),
      ...(p.settings ? { settings: p.settings } : {}),
      ...(p.flow ? { flow: true } : {}),
      ...(p.guides?.length ? { guides: p.guides } : {}),
    };
    return { page: p, path: `pages/${p.id}.json`, bytes: json(file) };
  });
  const projectBytes = json({
    schemaVersion: CURRENT_SCHEMA,
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    activePageId: project.activePageId,
    pageOrder: project.pages.map((p) => p.id),
    ...(project.settings ? { settings: project.settings } : {}),
  });
  const checksum = sha256Hex(concat([projectBytes, ...pageFiles.map((f) => f.bytes)]));
  const manifest = {
    format: 'sdd',
    formatVersion: FORMAT_VERSION,
    type: 'file' as const,
    appVersion: opts.appVersion ?? APP_VERSION,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    projectId: project.id,
    name: project.name,
    pages: pageFiles.map((f) => ({ id: f.page.id, name: f.page.name, file: f.path })),
    checksum,
  };
  const files: Zippable = {
    mimetype: [strToU8(SDD_MIMETYPE), { level: 0 }], // first entry, stored (no compression) so the type can be sniffed
    'manifest.json': json(manifest),
    'project.json': projectBytes,
  };
  for (const f of pageFiles) files[f.path] = f.bytes;
  files[SOURCE_PATH] = strToU8(sourceText(project)); // greppable rendering of the first page; informational only (the JSON is the truth)
  for (const [hash, asset] of Object.entries(project.assets ?? {})) {
    if (asset.data === undefined) continue; // stored in the host's asset store: the server packs those when it exports
    const ext = EXT_BY_MIME[asset.mime] ?? 'bin';
    files[`assets/${hash}.${ext}`] = [b64ToBytes(asset.data), { level: ext === 'png' || ext === 'jpg' || ext === 'webp' ? 0 : 6 }];
  }
  for (const [pageId, png] of Object.entries(opts.thumbnails ?? {})) files[`thumbnails/${pageId}.png`] = [png, { level: 0 }];
  return zipSync(files);
}

export interface ReadResult {
  project: Project;
  warnings: string[];
  thumbnails: Record<string, Uint8Array>;
  manifest: z_Manifest;
  /** total uncompressed size of the archive (budget across nested archives) */
  uncompressedBytes: number;
}
type z_Manifest = ReturnType<typeof ManifestSchema.parse>;

export const SOURCE_PATH = 'source.sdd';

/** the human-readable `.sdd` text of the first page of a project (what ends up in `source.sdd`) */
export function sourceText(project: Project): string {
  const p = project.pages.find((x) => x.id === project.activePageId) ?? project.pages[0];
  const page: CPage = { id: p.id, name: p.name, nodes: p.nodes as unknown as CPage['nodes'], edges: p.edges as unknown as CPage['edges'] };
  return printPage(page, p.name);
}

const stripLines = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (k, x) => (k === 'line' ? undefined : x)));
/**
 * `source.sdd` is a convenience copy. When its meaning differs from the diagram data the data wins and the reader gets a warning
 * (formatting and comments are ignored: the texts are compared as parsed documents).
 */
export function sourceConflict(source: string, project: Project, label = 'source.sdd'): string | null {
  const parsed = parseDsl(source);
  if (parsed.diagnostics.some((d) => d.severity === 'error')) return `${label} has syntax errors and was ignored (the diagram data is used)`;
  const mine = parseDsl(sourceText(project));
  const a = JSON.stringify(stripLines({ ...parsed.doc, title: undefined }));
  const b = JSON.stringify(stripLines({ ...mine.doc, title: undefined }));
  return a === b ? null : `${label} differs from the diagram data; the data was used and ${label} ignored`;
}

export const SAFE_NAME = /^(?!\/)(?!.*(^|\/)\.\.(\/|$))[^\\\0:]+$/;

export function parseJson(files: Record<string, Uint8Array>, entry: string): unknown {
  const raw = files[entry];
  if (!raw) throw new SddError('missing-entry', `${entry} is missing from the file`, entry);
  try {
    return JSON.parse(strFromU8(raw));
  } catch {
    throw new SddError('bad-json', `${entry} is not valid JSON`, entry);
  }
}
export function zodFail(entry: string, err: { issues: { path: PropertyKey[]; message: string }[] }): never {
  const i = err.issues[0];
  const where = i.path.length ? i.path.join('.') : '(root)';
  throw new SddError('schema', `${entry}: ${where}: ${i.message}`, entry);
}

/** .sdd bytes -> Project, validating everything. Throws SddError with a code and the failing entry. */
export function readSdd(bytes: Uint8Array, limits: SddLimits = {}, opts: { verifyChecksum?: boolean } = {}): ReadResult {
  const lim = { ...DEFAULT_LIMITS, ...limits };
  if (bytes.length > lim.maxFileBytes) throw new SddError('too-large', `File is too large (limit ${Math.round(lim.maxFileBytes / 1024 / 1024)} MB)`);
  if (bytes.length < 22) throw new SddError('corrupt-zip', 'File is not a valid .sdd archive');

  let entries = 0;
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (++entries > lim.maxEntries) throw new SddError('too-many-entries', `Archive has more than ${lim.maxEntries} entries`);
        if (!SAFE_NAME.test(f.name)) throw new SddError('unsafe-path', `Unsafe entry name "${f.name}" (path traversal)`, f.name);
        total += f.originalSize;
        if (total > lim.maxUncompressedBytes) throw new SddError('zip-bomb', 'Archive expands beyond the allowed size');
        return !f.name.endsWith('/');
      },
    });
  } catch (e) {
    if (e instanceof SddError) throw e;
    throw new SddError('corrupt-zip', 'File is not a valid .sdd archive (corrupt or truncated)');
  }

  const names = Object.keys(files);
  if (names[0] !== 'mimetype' || strFromU8(files.mimetype) !== SDD_MIMETYPE) throw new SddError('bad-mimetype', 'Not an .sdd file (missing or wrong mimetype entry)', 'mimetype');

  const rawManifest = parseJson(files, 'manifest.json') as { type?: unknown; format?: unknown } | null;
  if (rawManifest && typeof rawManifest === 'object' && (rawManifest.type === 'project' || rawManifest.format === 'sddproj')) throw new SddError('unsupported', 'This .sdd holds a whole project, not one file: import it as a project', 'manifest.json');
  const mf = ManifestSchema.safeParse(rawManifest);
  if (!mf.success) zodFail('manifest.json', mf.error);
  const manifest = mf.data;
  if (manifest.formatVersion > FORMAT_VERSION) throw new SddError('unsupported', `File format v${manifest.formatVersion} is newer than this app supports`, 'manifest.json');
  if (manifest.type === 'project') throw new SddError('unsupported', 'This .sdd holds a whole project, not one file: import it as a project', 'manifest.json');

  let projRaw: unknown;
  try {
    projRaw = migrateProjectFile(parseJson(files, 'project.json'));
  } catch (e) {
    if (e instanceof SddError) throw e;
    throw new SddError('unsupported', (e as Error).message, 'project.json');
  }
  const pj = ProjectFileSchema.safeParse(projRaw);
  if (!pj.success) zodFail('project.json', pj.error);
  const projectFile = pj.data;

  for (const p of manifest.pages) if (!files[p.file]) throw new SddError('missing-entry', `${p.file} is missing from the file`, p.file);

  if (opts.verifyChecksum !== false) {
    const sum = sha256Hex(concat([files['project.json'], ...manifest.pages.map((p) => files[p.file])]));
    if (sum !== manifest.checksum) throw new SddError('checksum', 'Checksum mismatch: the file was modified or damaged after it was saved');
  }

  const pageMap = new Map<string, Page>();
  for (const p of manifest.pages) {
    let raw: unknown;
    try {
      raw = migratePageFile(parseJson(files, p.file));
    } catch (e) {
      if (e instanceof SddError) throw e;
      throw new SddError('unsupported', (e as Error).message, p.file);
    }
    const pf = PageFileSchema.safeParse(raw);
    if (!pf.success) zodFail(p.file, pf.error);
    const sem = validateDiagram({ version: 1, nodes: pf.data.nodes, edges: pf.data.edges });
    if (!sem.ok) throw new SddError('schema', `${p.file}: ${sem.error}`, p.file);
    pageMap.set(pf.data.id, {
      id: pf.data.id,
      name: pf.data.name,
      nodes: sem.diagram.nodes as DiagramNode[],
      edges: sem.diagram.edges as DiagramEdge[],
      ...(pf.data.viewport ? { viewport: pf.data.viewport } : {}),
      ...(pf.data.settings ? { settings: pf.data.settings as PartialSettings } : {}),
      ...(pf.data.flow ? { flow: true } : {}),
      ...(pf.data.guides?.length ? { guides: pf.data.guides } : {}),
    });
  }
  const pages = projectFile.pageOrder.map((id) => {
    const pg = pageMap.get(id);
    if (!pg) throw new SddError('schema', `project.json: pageOrder references unknown page "${id}"`, 'project.json');
    return pg;
  });
  if (!pages.some((p) => p.id === projectFile.activePageId)) throw new SddError('schema', 'project.json: activePageId does not reference a page', 'project.json');

  const assets: Record<string, ProjectAsset> = {};
  const thumbnails: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(files)) {
    let m = name.match(/^assets\/([0-9a-f]{64})\.(\w+)$/);
    if (m) {
      if (sha256Hex(data) !== m[1]) throw new SddError('asset', `Asset ${name} does not match its content hash`, name);
      assets[m[1]] = { mime: MIME_BY_EXT[m[2].toLowerCase()] ?? 'application/octet-stream', data: bytesToB64(data) };
    }
    m = name.match(/^thumbnails\/([^/]+)\.png$/);
    if (m) thumbnails[m[1]] = data;
  }

  const warnings: string[] = [];
  for (const pg of pages)
    for (const n of pg.nodes) {
      const id = n.data.iconId;
      if (typeof id !== 'string') continue;
      if (id.startsWith('asset:')) {
        if (!assets[id.slice(6)]) warnings.push(`Page “${pg.name}”: custom icon asset for “${n.data.label}” is missing (shown as a generic icon)`);
      } else if (!hasIcon(id)) warnings.push(`Page “${pg.name}”: unknown icon “${id}” on “${n.data.label}” (shown as a generic icon)`);
    }

  const project: Project = {
    version: 2,
    id: projectFile.id,
    name: projectFile.name,
    createdAt: projectFile.createdAt,
    updatedAt: projectFile.updatedAt,
    activePageId: projectFile.activePageId,
    pages,
    ...(projectFile.settings ? { settings: projectFile.settings as PartialSettings } : {}),
    ...(Object.keys(assets).length ? { assets } : {}),
  };
  if (files[SOURCE_PATH]) {
    const c = sourceConflict(strFromU8(files[SOURCE_PATH]), project);
    if (c) warnings.push(c);
  }
  return { project, warnings, thumbnails, manifest, uncompressedBytes: total };
}
