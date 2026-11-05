import { describe, expect, it } from 'vitest';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { buildSdd, readSdd, SddError, SDD_MIMETYPE, type SddLimits } from './sdd';
import { sha256Hex } from './sha256';
import { migrateProjectFile, migratePageFile, CURRENT_SCHEMA } from './migrations';
import { decideOpen, resolveConflict } from './conflict';
import { monitoringStack } from '../../templates/monitoringStack';
import { migrateV1 } from '../project';
import type { Project } from '../../types';

const bytesOf = (s: string) => new TextEncoder().encode(s);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const customHash = sha256Hex(png);
const assetOf = () => ({ [customHash]: { mime: 'image/png', data: btoa(String.fromCharCode(...png)) } });

function sampleProject(): Project {
  const t = monitoringStack();
  const p = migrateV1(t, 'Sample', 1_700_000_000_000);
  p.id = 'prj_sample';
  p.pages[0].id = 'pg_one';
  p.pages[0].viewport = { x: 10, y: 20, zoom: 1.25 };
  p.pages.push({
    id: 'pg_two',
    name: 'Cluster',
    nodes: [
      { id: 'g', type: 'group', position: { x: 0, y: 0 }, width: 300, height: 200, style: { width: 300, height: 200 }, data: { label: 'G', stroke: '#2f6fdb', strokeStyle: 'dashed', fillOpacity: 10 } },
      { id: 'a', type: 'icon', position: { x: 20, y: 40 }, parentId: 'g', data: { label: 'PG', iconId: 'postgresql', subtitle: ':5432' } },
      { id: 'c', type: 'icon', position: { x: 400, y: 40 }, data: { label: 'Custom', iconId: `asset:${customHash}` } },
    ],
    edges: [{ id: 'e', source: 'a', target: 'c', label: 'x', data: { dashed: true, color: '#0f7b6c', lineType: 'curved', arrows: 'both', strokeWidth: 3, flow: true } }],
  });
  p.activePageId = 'pg_two';
  p.settings = { node: { background: 'filled', fill: '#f5f5f5' }, edge: { color: '#0f7b6c' }, theme: 'dark' };
  return p;
}
describe('sha256', () => {
  it('matches known vectors', () => {
    expect(sha256Hex(bytesOf(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(bytesOf('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(bytesOf('a'.repeat(1000)))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });
});

describe('container layout', () => {
  it('mimetype is the FIRST entry and stored uncompressed', () => {
    const data = buildSdd(sampleProject());
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(dv.getUint32(0, true)).toBe(0x04034b50); // local file header
    expect(dv.getUint16(8, true)).toBe(0); // compression method 0 = stored
    const nameLen = dv.getUint16(26, true);
    const extraLen = dv.getUint16(28, true);
    expect(strFromU8(data.subarray(30, 30 + nameLen))).toBe('mimetype');
    expect(strFromU8(data.subarray(30 + nameLen + extraLen, 30 + nameLen + extraLen + SDD_MIMETYPE.length))).toBe('application/vnd.sdd+zip');
  });
  it('has manifest, project and one JSON per page; assets by hash; optional thumbnails', () => {
    const hash = customHash;
    const p = sampleProject();
    p.assets = assetOf();
    const zip = unzipSync(buildSdd(p, { thumbnails: { pg_one: png } }));
    expect(Object.keys(zip)[0]).toBe('mimetype');
    for (const f of ['manifest.json', 'project.json', 'pages/pg_one.json', 'pages/pg_two.json', `assets/${hash}.png`, 'thumbnails/pg_one.png']) expect(zip[f], f).toBeDefined();
    const manifest = JSON.parse(strFromU8(zip['manifest.json']));
    expect(manifest).toMatchObject({ format: 'sdd', formatVersion: 1, projectId: 'prj_sample', name: 'Sample' });
    expect(manifest.pages).toEqual([{ id: 'pg_one', name: 'Page 1', file: 'pages/pg_one.json' }, { id: 'pg_two', name: 'Cluster', file: 'pages/pg_two.json' }]);
    expect(manifest.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof manifest.appVersion).toBe('string');
    for (const f of ['project.json', 'pages/pg_one.json']) expect(JSON.parse(strFromU8(zip[f])).schemaVersion).toBe(CURRENT_SCHEMA);
  });
  it('built-in icons are referenced by id only (no embedded svg)', () => {
    const zip = unzipSync(buildSdd(sampleProject()));
    expect(strFromU8(zip['pages/pg_two.json'])).toContain('"iconId": "postgresql"');
    expect(Object.keys(zip).filter((k) => k.startsWith('assets/'))).toEqual([]);
  });
});

describe('round trip', () => {
  it('project -> .sdd bytes -> project is deep-equal (pages, groups, edge styles, settings, viewports, assets)', () => {
    const p = sampleProject();
    p.assets = assetOf();
    const r = readSdd(buildSdd(p));
    expect(r.project).toEqual(p);
    expect(r.warnings).toEqual([]);
  });
  it('is stable: write(read(write(p))) equals write(p) structure', () => {
    const p = sampleProject();
    const a = readSdd(buildSdd(p)).project;
    const b = readSdd(buildSdd(a)).project;
    expect(b).toEqual(a);
  });
  it('strips transient UI state', () => {
    const p = sampleProject();
    p.pages[0].nodes[0] = { ...p.pages[0].nodes[0], selected: true, dragging: true, measured: { width: 1, height: 1 } };
    const r = readSdd(buildSdd(p)).project;
    expect(JSON.stringify(r)).not.toMatch(/"selected"|"dragging"|"measured"/);
  });
  it('returns thumbnails when present', () => {
    expect(readSdd(buildSdd(sampleProject(), { thumbnails: { pg_one: png } })).thumbnails.pg_one).toEqual(png);
  });
});

describe('integrity', () => {
  const tamper = (file: string, fn: (s: string) => string) => {
    const zip = unzipSync(buildSdd(sampleProject()));
    zip[file] = strToU8(fn(strFromU8(zip[file])));
    return rezip(zip);
  };
  const rezip = (zip: Record<string, Uint8Array>) => {
    const { mimetype, ...rest } = zip;
    return zipSync({ mimetype: [mimetype, { level: 0 }], ...rest });
  };
  it('checksum mismatch is detected and names the entry set', () => {
    const bytes = tamper('pages/pg_one.json', (s) => s.replace('"Prometheus"', '"Prometheus2"'));
    expect(() => readSdd(bytes)).toThrowError(SddError);
    try {
      readSdd(bytes);
    } catch (e) {
      expect((e as SddError).code).toBe('checksum');
      expect((e as SddError).message).toMatch(/checksum/i);
    }
  });
  it('asset whose bytes do not match its hash name is rejected', () => {
    const p = sampleProject();
    p.assets = { ['b'.repeat(64)]: assetOf()[customHash] };
    expect(() => readSdd(buildSdd(p))).toThrowError(/asset/i);
  });
});

describe('rejection of unsafe or broken files', () => {
  const code = (fn: () => unknown): string => {
    try {
      fn();
    } catch (e) {
      return e instanceof SddError ? e.code : `other:${(e as Error).message}`;
    }
    return 'none';
  };
  const withEntries = (extra: Record<string, Uint8Array>, drop: string[] = []) => {
    const zip = unzipSync(buildSdd(sampleProject()));
    for (const d of drop) delete zip[d];
    const { mimetype, ...rest } = { ...zip, ...extra };
    return zipSync({ mimetype: [mimetype ?? strToU8(SDD_MIMETYPE), { level: 0 }], ...rest });
  };
  it('corrupt / non-zip data', () => {
    expect(code(() => readSdd(new Uint8Array([1, 2, 3, 4, 5])))).toBe('corrupt-zip');
    expect(code(() => readSdd(new Uint8Array(0)))).toBe('corrupt-zip');
    const good = buildSdd(sampleProject());
    expect(code(() => readSdd(good.subarray(0, Math.floor(good.length / 2))))).toBe('corrupt-zip');
  });
  it('path traversal entries', () => {
    for (const name of ['../evil.json', 'pages/../../x.json', '/abs.json', 'a\\b.json', 'pages/x\0.json'])
      expect(code(() => readSdd(withEntries({ [name]: strToU8('{}') }))), name).toBe('unsafe-path');
  });
  it('oversized file (size guard) and zip bombs (uncompressed limit) and entry-count limit', () => {
    const good = buildSdd(sampleProject());
    const tiny: SddLimits = { maxFileBytes: 100 };
    expect(code(() => readSdd(good, tiny))).toBe('too-large');
    expect(code(() => readSdd(good, { maxUncompressedBytes: 50 }))).toBe('zip-bomb');
    const bomb = withEntries({ 'assets/x.bin': new Uint8Array(2_000_000) });
    expect(code(() => readSdd(bomb, { maxUncompressedBytes: 1_000_000 }))).toBe('zip-bomb');
    expect(code(() => readSdd(good, { maxEntries: 3 }))).toBe('too-many-entries');
  });
  it('default limits: 100 MB file size', () => {
    const fake = { length: 100 * 1024 * 1024 + 1 } as unknown as Uint8Array;
    expect(code(() => readSdd(fake))).toBe('too-large');
  });
  it('missing / wrong mimetype, missing manifest, bad JSON, missing page', () => {
    expect(code(() => readSdd(zipSync({ 'manifest.json': strToU8('{}') })))).toBe('bad-mimetype');
    expect(code(() => readSdd(zipSync({ mimetype: [strToU8('text/plain'), { level: 0 }] })))).toBe('bad-mimetype');
    expect(code(() => readSdd(zipSync({ mimetype: [strToU8(SDD_MIMETYPE), { level: 0 }] })))).toBe('missing-entry');
    expect(code(() => readSdd(withEntries({ 'manifest.json': strToU8('{nope') })))).toBe('bad-json');
    expect(code(() => readSdd(withEntries({}, ['pages/pg_two.json'])))).toBe('missing-entry');
  });
  it('schema errors name the failing entry and field', () => {
    const zip = unzipSync(buildSdd(sampleProject()));
    const page = JSON.parse(strFromU8(zip['pages/pg_one.json']));
    page.nodes[0].type = 'weird';
    const bytes = withEntries({ 'pages/pg_one.json': strToU8(JSON.stringify(page)) });
    try {
      readSdd(bytes, {}, { verifyChecksum: false });
      throw new Error('should fail');
    } catch (e) {
      expect(e).toBeInstanceOf(SddError);
      expect((e as SddError).code).toBe('schema');
      expect((e as SddError).entry).toBe('pages/pg_one.json');
      expect((e as SddError).message).toMatch(/pages\/pg_one\.json/);
      expect((e as SddError).message).toMatch(/nodes/);
    }
  });
});

describe('schema migrations', () => {
  it('v1 project/page shapes are migrated to the current schema', () => {
    const oldProject = { schemaVersion: 1, id: 'p', name: 'Old', createdAt: 1, updatedAt: 2, activePage: 'pg', pageOrder: ['pg'] };
    const mp = migrateProjectFile(oldProject) as Record<string, unknown>;
    expect(mp.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(mp.activePageId).toBe('pg');
    expect('activePage' in mp).toBe(false);
    const oldPage = { schemaVersion: 1, id: 'pg', name: 'P', nodes: [{ id: 'a', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'A', icon: 'redis' } }], edges: [] };
    const pg = migratePageFile(oldPage) as { schemaVersion: number; nodes: { data: Record<string, unknown> }[] };
    expect(pg.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(pg.nodes[0].data.iconId).toBe('redis');
    expect('icon' in pg.nodes[0].data).toBe(false);
  });
  it('files newer than this app are rejected with a clear error', () => {
    expect(() => migrateProjectFile({ schemaVersion: CURRENT_SCHEMA + 5 })).toThrowError(/newer/i);
  });
  it('an old .sdd opens end to end', () => {
    // build a valid current file, then downgrade project/page JSON to the v1 shape and refresh the checksum
    const zip = unzipSync(buildSdd(sampleProject()));
    const project = JSON.parse(strFromU8(zip['project.json']));
    project.schemaVersion = 1;
    project.activePage = project.activePageId;
    delete project.activePageId;
    zip['project.json'] = strToU8(JSON.stringify(project, null, 2));
    for (const f of ['pages/pg_one.json', 'pages/pg_two.json']) {
      const pg = JSON.parse(strFromU8(zip[f]));
      pg.schemaVersion = 1;
      for (const n of pg.nodes) if (n.data.iconId) { n.data.icon = n.data.iconId; delete n.data.iconId; }
      zip[f] = strToU8(JSON.stringify(pg, null, 2));
    }
    const manifest = JSON.parse(strFromU8(zip['manifest.json']));
    manifest.checksum = sha256Hex(new Uint8Array([...zip['project.json'], ...zip['pages/pg_one.json'], ...zip['pages/pg_two.json']]));
    zip['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
    const { mimetype, ...rest } = zip;
    const r = readSdd(zipSync({ mimetype: [mimetype, { level: 0 }], ...rest }));
    expect(r.project.activePageId).toBe('pg_two');
    expect(r.project.pages[1].nodes.find((n) => n.id === 'a')!.data.iconId).toBe('postgresql');
  });
});

describe('unknown icon ids', () => {
  it('open succeeds; unknown ids are listed as warnings (generic fallback happens at render)', () => {
    const p = sampleProject();
    p.pages[1].nodes[1] = { ...p.pages[1].nodes[1], data: { ...p.pages[1].nodes[1].data, iconId: 'totally-unknown-logo' } };
    const r = readSdd(buildSdd(p));
    expect(r.project.pages[1].nodes[1].data.iconId).toBe('totally-unknown-logo');
    const unknown = r.warnings.filter((w) => /totally-unknown-logo/.test(w));
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatch(/Cluster/); // page name
  });
  it('asset icons whose asset is missing also warn', () => {
    const r = readSdd(buildSdd(sampleProject())); // node c references asset:aaaa… but no asset embedded
    expect(r.warnings.some((w) => /asset/i.test(w))).toBe(true);
  });
});

describe('open conflict: replace vs copy', () => {
  it('decideOpen', () => {
    const p = sampleProject();
    expect(decideOpen(['x', 'y'], p)).toEqual({ kind: 'new' });
    expect(decideOpen(['x', 'prj_sample'], p)).toEqual({ kind: 'conflict', existingId: 'prj_sample' });
  });
  it('replace keeps id; copy gets a new id, "(copy)" name and fresh page ids with content intact', () => {
    const p = sampleProject();
    expect(resolveConflict(p, 'replace')).toEqual(p);
    const c = resolveConflict(p, 'copy');
    expect(c.id).not.toBe(p.id);
    expect(c.name).toBe('Sample (copy)');
    expect(c.pages.map((x) => x.id)).not.toEqual(p.pages.map((x) => x.id));
    expect(c.pages[0].nodes).toHaveLength(p.pages[0].nodes.length);
    expect(c.pages.some((x) => x.id === c.activePageId)).toBe(true);
    expect(c.pages[0].viewport).toEqual(p.pages[0].viewport);
  });
});
