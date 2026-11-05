/**
 * `.sdd` of type "project": a whole project (folders + files) as one ZIP. Same container rules and safety limits as a file (docs/sdd-format.md):
 *   mimetype (first, STORED) / manifest.json (type "project": tree + checksum) / files/<fileId>.sdd (a type "file" container each)
 *   / files/<fileId>/source.sdd (the text rendering of that file; informational, the JSON wins)
 * Names are data only (never used as paths); every nested archive is validated by readSdd within one shared size budget.
 * Legacy `.sddproj` archives (format "sddproj", their own mimetype) are still READ; they are never written.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { z } from 'zod';
import type { Project } from '../../types';
import type { FileKind } from '../../workspace/types';
import { APP_VERSION, DEFAULT_LIMITS, SAFE_NAME, SDD_MIMETYPE, SddError, buildSdd, concat, json, parseJson, readSdd, sourceConflict, sourceText, zodFail, type SddLimits } from './sdd';
import { sha256Hex } from './sha256';

/** the mimetype of the LEGACY .sddproj container (read only) */
export const SDDPROJ_MIMETYPE = 'application/vnd.sddproj+zip';
export const SDDPROJ_FORMAT_VERSION = 1;
export const MAX_PROJ_FILES = 500;
export const MAX_PROJ_FOLDERS = 1000;
export const MAX_FOLDER_DEPTH = 64;

const Id = z.string().min(1).max(64);
const ManifestSchema = z.object({
  format: z.enum(['sdd', 'sddproj']),
  formatVersion: z.number().int().min(1),
  type: z.literal('project').optional(),
  appVersion: z.string(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  name: z.string().max(200),
  folders: z.array(z.object({ id: Id, parentId: Id.nullable(), name: z.string().max(200), position: z.number().finite() })).max(MAX_PROJ_FOLDERS),
  files: z.array(z.object({ id: Id, folderId: Id.nullable(), name: z.string().max(200), kind: z.enum(['sdd', 'erd', 'uml', 'board']), position: z.number().finite(), path: z.string().min(1), source: z.string().min(1).optional() })).max(MAX_PROJ_FILES),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
});

export interface ProjFolder { id: string; parentId: string | null; name: string; position: number }
export interface ProjFile { id: string; folderId: string | null; name: string; kind: FileKind; position: number; doc: Project; thumbnail?: Uint8Array }
export interface SddProj { name: string; createdAt: number; updatedAt: number; folders: ProjFolder[]; files: ProjFile[] }

export function buildSddProj(p: SddProj): Uint8Array {
  const entries = p.files.map((f) => {
    const doc = { ...f.doc, id: f.id, name: f.name };
    return { f, doc, path: `files/${f.id}.sdd`, source: `files/${f.id}/source.sdd`, bytes: buildSdd(doc, f.thumbnail ? { thumbnails: { [f.doc.activePageId]: f.thumbnail } } : {}) };
  });
  const manifest = {
    format: 'sdd' as const,
    formatVersion: SDDPROJ_FORMAT_VERSION,
    type: 'project' as const,
    appVersion: APP_VERSION,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    name: p.name,
    folders: p.folders,
    files: entries.map((e) => ({ id: e.f.id, folderId: e.f.folderId, name: e.f.name, kind: e.f.kind, position: e.f.position, path: e.path, source: e.source })),
    checksum: sha256Hex(concat(entries.map((e) => e.bytes))),
  };
  const files: Zippable = { mimetype: [strToU8(SDD_MIMETYPE), { level: 0 }], 'manifest.json': json(manifest) };
  for (const e of entries) {
    files[e.path] = [e.bytes, { level: 0 }];
    files[e.source] = strToU8(sourceText(e.doc));
  }
  return zipSync(files);
}

/** folders must have known parents, no cycles and bounded depth; ids unique; files point at existing folders */
export function validateTree(folders: ProjFolder[], files: { id: string; folderId: string | null }[]): void {
  const byId = new Map<string, ProjFolder>();
  for (const f of folders) {
    if (byId.has(f.id)) throw new SddError('bad-tree', `Duplicate folder id "${f.id}"`, 'manifest.json');
    byId.set(f.id, f);
  }
  for (const f of folders) {
    let depth = 0;
    for (let cur: ProjFolder | undefined = f; cur; cur = cur.parentId === null ? undefined : byId.get(cur.parentId)) {
      if (cur.parentId !== null && !byId.has(cur.parentId)) throw new SddError('bad-tree', `Folder "${cur.name}" references an unknown parent`, 'manifest.json');
      if (++depth > MAX_FOLDER_DEPTH) throw new SddError('bad-tree', 'Folders are nested too deeply or form a cycle', 'manifest.json');
    }
  }
  const ids = new Set<string>();
  for (const f of files) {
    if (ids.has(f.id)) throw new SddError('bad-tree', `Duplicate file id "${f.id}"`, 'manifest.json');
    ids.add(f.id);
    if (f.folderId !== null && !byId.has(f.folderId)) throw new SddError('bad-tree', `File "${f.id}" references an unknown folder`, 'manifest.json');
  }
}

export interface ReadProjResult {
  name: string;
  createdAt: number;
  updatedAt: number;
  folders: ProjFolder[];
  files: (ProjFile & { warnings: string[] })[];
  warnings: string[];
}

export function readSddProj(bytes: Uint8Array, limits: SddLimits = {}): ReadProjResult {
  const lim = { ...DEFAULT_LIMITS, ...limits };
  if (bytes.length > lim.maxFileBytes) throw new SddError('too-large', `File is too large (limit ${Math.round(lim.maxFileBytes / 1024 / 1024)} MB)`);
  if (bytes.length < 22) throw new SddError('corrupt-zip', 'File is not a valid .sdd archive');
  let entries = 0;
  let total = 0;
  const claimed = new Map<string, number>();
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (++entries > lim.maxEntries) throw new SddError('too-many-entries', `Archive has more than ${lim.maxEntries} entries`);
        if (!SAFE_NAME.test(f.name)) throw new SddError('unsafe-path', `Unsafe entry name "${f.name}" (path traversal)`, f.name);
        total += f.originalSize;
        if (total > lim.maxUncompressedBytes) throw new SddError('zip-bomb', 'Archive expands beyond the allowed size');
        if (f.name === 'mimetype' && f.compression !== 0) throw new SddError('bad-mimetype', 'mimetype entry must be stored uncompressed', 'mimetype');
        claimed.set(f.name, f.originalSize);
        return !f.name.endsWith('/');
      },
    });
  } catch (e) {
    if (e instanceof SddError) throw e;
    throw new SddError('corrupt-zip', 'File is not a valid .sdd archive (corrupt or truncated)');
  }
  for (const [name, data] of Object.entries(files)) if (claimed.get(name) !== data.length) throw new SddError('zip-bomb', `Entry ${name} does not match its declared size`, name);
  if (Object.keys(files)[0] !== 'mimetype') throw new SddError('bad-mimetype', 'Not an .sdd file (missing or wrong mimetype entry)', 'mimetype');

  const rawManifest = parseJson(files, 'manifest.json') as { type?: unknown; format?: unknown; pages?: unknown } | null;
  if (rawManifest && typeof rawManifest === 'object' && rawManifest.format === 'sdd' && rawManifest.type !== 'project' && Array.isArray(rawManifest.pages)) throw new SddError('unsupported', 'This .sdd holds a single file, not a project: open it as a file', 'manifest.json');
  const mf = ManifestSchema.safeParse(rawManifest);
  if (!mf.success) zodFail('manifest.json', mf.error);
  const manifest = mf.data;
  const legacy = manifest.format === 'sddproj';
  if (strFromU8(files.mimetype) !== (legacy ? SDDPROJ_MIMETYPE : SDD_MIMETYPE)) throw new SddError('bad-mimetype', 'Not an .sdd file (missing or wrong mimetype entry)', 'mimetype');
  if (!legacy && manifest.type !== 'project') throw new SddError('schema', 'manifest.json: type: expected "project"', 'manifest.json');
  if (manifest.formatVersion > SDDPROJ_FORMAT_VERSION) throw new SddError('unsupported', `File format v${manifest.formatVersion} is newer than this app supports`, 'manifest.json');
  validateTree(manifest.folders, manifest.files);
  for (const f of manifest.files) {
    if (!SAFE_NAME.test(f.path) || !f.path.startsWith('files/') || !f.path.endsWith('.sdd')) throw new SddError('unsafe-path', `Unsafe file path "${f.path}"`, f.path);
    if (!files[f.path]) throw new SddError('missing-entry', `${f.path} is missing from the file`, f.path);
    if (f.source !== undefined && (!SAFE_NAME.test(f.source) || !f.source.startsWith('files/') || !f.source.endsWith('/source.sdd'))) throw new SddError('unsafe-path', `Unsafe source path "${f.source}"`, f.source);
  }
  if (sha256Hex(concat(manifest.files.map((f) => files[f.path]))) !== manifest.checksum) throw new SddError('checksum', 'Checksum mismatch: the file was modified or damaged after it was saved');

  let budget = lim.maxUncompressedBytes - total;
  const warnings: string[] = [];
  const out = manifest.files.map((f) => {
    let r;
    try {
      r = readSdd(files[f.path], { maxFileBytes: lim.maxFileBytes, maxUncompressedBytes: Math.max(budget, 0), maxEntries: lim.maxEntries });
    } catch (e) {
      if (e instanceof SddError) throw new SddError(e.code, `${f.path}: ${e.message}`, f.path);
      throw e;
    }
    budget -= r.uncompressedBytes;
    if (budget < 0) throw new SddError('zip-bomb', 'Archive expands beyond the allowed size');
    for (const w of r.warnings) warnings.push(`${f.name}: ${w}`);
    if (f.source && files[f.source]) {
      const c = sourceConflict(strFromU8(files[f.source]), r.project, f.source);
      if (c) warnings.push(`${f.name}: ${c}`);
    }
    const thumb = r.thumbnails[r.project.activePageId] ?? Object.values(r.thumbnails)[0];
    return { id: f.id, folderId: f.folderId, name: f.name, kind: f.kind, position: f.position, doc: r.project, warnings: r.warnings, ...(thumb ? { thumbnail: thumb } : {}) };
  });
  return { name: manifest.name, createdAt: manifest.createdAt, updatedAt: manifest.updatedAt, folders: manifest.folders, files: out, warnings };
}
