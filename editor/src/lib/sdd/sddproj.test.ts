import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createProject } from '../project';
import type { DiagramNode, Project } from '../../types';
import { SDD_MIMETYPE, SddError, buildSdd } from './sdd';
import { sha256Hex } from './sha256';
import { MAX_PROJ_FILES, buildSddProj, readSddProj, validateTree, type SddProj } from './sddproj';

const node = (id: string): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label: id } }) as DiagramNode;
const doc = (id: string, name: string, nodes: string[]): Project => {
  const p = createProject(name);
  return { ...p, id, pages: [{ ...p.pages[0], nodes: nodes.map(node) }] };
};
const sample = (): SddProj => ({
  name: 'Platform', createdAt: 1, updatedAt: 2,
  folders: [{ id: 'f1', parentId: null, name: 'infra', position: 1 }, { id: 'f2', parentId: 'f1', name: 'db', position: 0 }],
  files: [
    { id: 'a', folderId: null, name: 'Overview', kind: 'sdd', position: 0, doc: doc('a', 'Overview', ['x']) },
    { id: 'b', folderId: 'f2', name: 'Schema', kind: 'erd', position: 0, doc: doc('b', 'Schema', ['y', 'z']) },
  ],
});

describe('project container, type "project" (client)', () => {
  it('layout: mimetype first and stored, manifest, one nested .sdd per file', () => {
    const bytes = buildSddProj(sample());
    expect(Object.keys(unzipSync(bytes))).toEqual(['mimetype', 'manifest.json', 'files/a.sdd', 'files/a/source.sdd', 'files/b.sdd', 'files/b/source.sdd']);
    expect(strFromU8(unzipSync(bytes).mimetype)).toBe(SDD_MIMETYPE);
    expect(JSON.parse(strFromU8(unzipSync(bytes)['manifest.json']))).toMatchObject({ format: 'sdd', type: 'project', formatVersion: 1, name: 'Platform' });
  });

  it('round-trips folders, files, kinds, positions and documents', () => {
    const r = readSddProj(buildSddProj(sample()));
    expect(r.name).toBe('Platform');
    expect(r.folders).toEqual(sample().folders);
    expect(r.files.map((f) => [f.id, f.folderId, f.name, f.kind, f.position])).toEqual([['a', null, 'Overview', 'sdd', 0], ['b', 'f2', 'Schema', 'erd', 0]]);
    expect(r.files[1].doc.pages[0].nodes.map((n) => n.id)).toEqual(['y', 'z']);
  });

  it('an empty project is valid', () => {
    expect(readSddProj(buildSddProj({ name: 'Empty', createdAt: 1, updatedAt: 1, folders: [], files: [] })).files).toEqual([]);
  });

  describe('malicious archives are rejected with a code', () => {
    const MIME = strToU8(SDD_MIMETYPE);
    const parts = () => unzipSync(buildSddProj(sample()));
    const z = (f: Record<string, Uint8Array>) => zipSync({ mimetype: [MIME, { level: 0 }], ...Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'mimetype')) } as Zippable);
    const code = (bytes: Uint8Array, lim = {}) => {
      try {
        readSddProj(bytes, lim);
      } catch (e) {
        return e instanceof SddError ? e.code : `other:${(e as Error).message}`;
      }
      return 'accepted';
    };
    const withManifest = (mut: (m: any) => void) => {
      const f = parts();
      const m = JSON.parse(strFromU8(f['manifest.json']));
      mut(m);
      return z({ ...f, 'manifest.json': strToU8(JSON.stringify(m)) });
    };
    it('path traversal and absolute entries', () => {
      expect(code(z({ ...parts(), '../../evil': strToU8('x') }))).toBe('unsafe-path');
      expect(code(z({ ...parts(), '/abs': strToU8('x') }))).toBe('unsafe-path');
      expect(code(z({ ...parts(), 'a\\b': strToU8('x') }))).toBe('unsafe-path');
    });
    it('manifest paths that escape or point outside files/', () => {
      expect(code(withManifest((m) => { m.files[0].path = '../manifest.json'; }))).toBe('unsafe-path');
      expect(code(withManifest((m) => { m.files[0].path = 'manifest.json'; }))).toBe('unsafe-path');
      expect(code(withManifest((m) => { m.files[0].path = 'files/nope.sdd'; }))).toBe('missing-entry');
    });
    it('wrong mimetype, garbage, truncated, a plain .sdd', () => {
      expect(code(zipSync({ ...parts(), mimetype: [strToU8('text/plain'), { level: 0 }] } as Zippable))).toBe('bad-mimetype');
      expect(code(strToU8('hello world, definitely not a zip file at all'))).toBe('corrupt-zip');
      expect(code(buildSddProj(sample()).slice(0, 100))).toBe('corrupt-zip');
      expect(code(buildSdd(doc('a', 'a', ['x'])) as Uint8Array)).toBe('unsupported'); // a file container, not a project
    });
    it('checksum: a swapped nested file', () => {
      const f = parts();
      f['files/a.sdd'] = buildSdd(doc('a', 'Hacked', ['x'])) as Uint8Array<ArrayBuffer>;
      expect(code(z(f))).toBe('checksum');
    });
    it('a corrupt nested .sdd names its path', () => {
      const f = parts();
      f['files/a.sdd'] = strToU8('not a zip at all, but long enough to pass the size guard');
      const m = JSON.parse(strFromU8(f['manifest.json']));
      m.checksum = sha256Hex(Uint8Array.from([...f['files/a.sdd'], ...f['files/b.sdd']]));
      f['manifest.json'] = strToU8(JSON.stringify(m));
      try {
        readSddProj(z(f));
        throw new Error('accepted');
      } catch (e) {
        expect(e).toBeInstanceOf(SddError);
        expect((e as SddError).entry).toBe('files/a.sdd');
      }
    });
    it('zip bomb and size limits', () => {
      const bomb = z({ ...parts(), 'big.bin': new Uint8Array(64 * 1024 * 1024) });
      expect(bomb.length).toBeLessThan(2 * 1024 * 1024);
      expect(code(bomb, { maxUncompressedBytes: 20 * 1024 * 1024 })).toBe('zip-bomb');
      expect(code(buildSddProj(sample()), { maxFileBytes: 100 })).toBe('too-large');
      const f: Record<string, Uint8Array> = { ...parts() };
      for (let i = 0; i < 30; i++) f[`junk/${i}.txt`] = strToU8('x');
      expect(code(z(f), { maxEntries: 20 })).toBe('too-many-entries');
    });
    it('a nested archive that outgrows the shared budget', () => {
      const f = parts();
      const inflated = zipSync({ ...unzipSync(f['files/a.sdd']), 'assets/pad.bin': new Uint8Array(6 * 1024 * 1024) } as Zippable);
      f['files/a.sdd'] = inflated;
      const m = JSON.parse(strFromU8(f['manifest.json']));
      m.checksum = sha256Hex(Uint8Array.from([...f['files/a.sdd'], ...f['files/b.sdd']]));
      f['manifest.json'] = strToU8(JSON.stringify(m));
      expect(code(z(f), { maxUncompressedBytes: 4 * 1024 * 1024 })).toMatch(/zip-bomb/);
    });
    it('a lying manifest: format, version, kind, too many files', () => {
      expect(code(withManifest((m) => { m.format = 'zip'; }))).toBe('schema');
      expect(code(withManifest((m) => { m.formatVersion = 99; }))).toBe('unsupported');
      expect(code(withManifest((m) => { m.files[0].kind = 'banana'; }))).toBe('schema');
      expect(code(withManifest((m) => { m.files = Array.from({ length: MAX_PROJ_FILES + 1 }, (_, i) => ({ ...m.files[0], id: `x${i}` })); }))).toBe('schema');
    });
    it('broken trees: cycles, unknown parents, duplicate ids, unknown folder, excessive depth', () => {
      expect(code(withManifest((m) => { m.folders = [{ id: 'f1', parentId: 'f2', name: 'a', position: 0 }, { id: 'f2', parentId: 'f1', name: 'b', position: 0 }]; m.files[1].folderId = null; }))).toBe('bad-tree');
      expect(code(withManifest((m) => { m.folders[0].parentId = 'ghost'; }))).toBe('bad-tree');
      expect(code(withManifest((m) => { m.folders[1].id = 'f1'; }))).toBe('bad-tree');
      expect(code(withManifest((m) => { m.files[0].folderId = 'ghost'; }))).toBe('bad-tree');
      expect(code(withManifest((m) => { m.files[1].id = 'a'; }))).toBe('bad-tree');
      const deep = Array.from({ length: 70 }, (_, i) => ({ id: `d${i}`, parentId: i ? `d${i - 1}` : null, name: `d${i}`, position: 0 }));
      expect(() => validateTree(deep, [])).toThrow(/too deeply/);
    });
  });
});
