import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createProject } from '../project';
import type { DiagramNode, Project } from '../../types';
import { readAnySdd } from './any';
import { SDD_MIMETYPE, SddError, buildSdd, readSdd } from './sdd';
import { SDDPROJ_MIMETYPE, buildSddProj, readSddProj, type SddProj } from './sddproj';
import { sniffSdd } from './sniff';
import { textToProject, projectToText } from './text';

const node = (id: string, label = id, extra: Record<string, unknown> = {}): DiagramNode => ({ id, type: 'icon', position: { x: 10, y: 20 }, data: { label, iconId: 'service' }, ...extra }) as DiagramNode;
const doc = (id: string, name: string, nodes: DiagramNode[]): Project => {
  const p = createProject(name);
  return { ...p, id, pages: [{ ...p.pages[0], nodes, edges: nodes.length > 1 ? [{ id: 'e1', source: nodes[0].id, target: nodes[1].id } as never] : [] }] };
};
const file = () => doc('a', 'Overview', [node('web', 'Web'), node('api', 'API')]);
const proj = (): SddProj => ({
  name: 'Platform', createdAt: 1, updatedAt: 2,
  folders: [{ id: 'f1', parentId: null, name: 'infra', position: 1 }],
  files: [
    { id: 'a', folderId: null, name: 'Overview', kind: 'sdd', position: 0, doc: file() },
    { id: 'b', folderId: 'f1', name: 'Schema', kind: 'erd', position: 0, doc: doc('b', 'Schema', [node('x'), node('y')]) },
  ],
});
const text = '#!sdd 1\ndiagram "Shop"\nnode web "Web" icon=browser\nnode api "API" icon=service\nweb -> api "HTTPS"\n';

/** the pre-unification archives, rebuilt from the new ones */
function legacyFile(bytes: Uint8Array): Uint8Array {
  const z = unzipSync(bytes);
  const m = JSON.parse(strFromU8(z['manifest.json']));
  delete m.type;
  const { mimetype, 'source.sdd': _s, ...rest } = z;
  void _s;
  return zipSync({ mimetype: [mimetype, { level: 0 }], ...rest, 'manifest.json': strToU8(JSON.stringify(m)) });
}
function legacyProject(bytes: Uint8Array): Uint8Array {
  const z = unzipSync(bytes);
  const m = JSON.parse(strFromU8(z['manifest.json']));
  m.format = 'sddproj';
  delete m.type;
  for (const f of m.files) delete f.source;
  const rest = Object.fromEntries(Object.entries(z).filter(([k]) => k.startsWith('files/') && k.endsWith('.sdd') && !k.endsWith('source.sdd')));
  return zipSync({ mimetype: [strToU8(SDDPROJ_MIMETYPE), { level: 0 }], 'manifest.json': strToU8(JSON.stringify(m)), ...rest });
}
const code = async (fn: () => unknown | Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    return e instanceof SddError ? e.code : `other:${(e as Error).message}`;
  }
  return 'accepted';
};

describe('sniffing', () => {
  it('a file container, a project container, text, and legacy spellings', () => {
    expect(sniffSdd(buildSdd(file()))).toEqual({ kind: 'file' });
    expect(sniffSdd(buildSddProj(proj()))).toEqual({ kind: 'project' });
    expect(sniffSdd(strToU8(text))).toEqual({ kind: 'text' });
    expect(sniffSdd(strToU8('﻿\n\n#!sdd\nnode a "A"'))).toEqual({ kind: 'text' });
    expect(sniffSdd(legacyFile(buildSdd(file())))).toEqual({ kind: 'file', legacy: 'no-type' });
    expect(sniffSdd(legacyProject(buildSddProj(proj())))).toEqual({ kind: 'project', legacy: 'sddproj' });
    expect(sniffSdd(strToU8('node a "A"\n'), 'old.sddt')).toEqual({ kind: 'text', legacy: 'sddt' });
  });
  it('rejects garbage, binary data, JSON and a text file without the header', () => {
    for (const bad of [strToU8('hello world'), strToU8('{"a":1}'), new Uint8Array([0, 1, 2, 3, 4, 5]), strToU8('node a "A"'), new Uint8Array(0)]) expect(() => sniffSdd(bad, 'x.sdd')).toThrow(SddError);
    expect(() => sniffSdd(new Uint8Array([0x50, 0x4b, 3, 4, 9, 9, 9, 9]))).toThrow(/valid .sdd archive|manifest/);
  });
  it('a ZIP without a manifest is rejected by the reader with the real reason', async () => {
    await expect(readAnySdd(zipSync({ mimetype: [strToU8(SDD_MIMETYPE), { level: 0 }] }))).rejects.toThrow(/manifest/);
  });
});

describe('manifest type', () => {
  it('file containers say type "file", project containers say type "project", same mimetype', () => {
    const f = unzipSync(buildSdd(file()));
    expect(JSON.parse(strFromU8(f['manifest.json']))).toMatchObject({ format: 'sdd', type: 'file' });
    const p = unzipSync(buildSddProj(proj()));
    expect(JSON.parse(strFromU8(p['manifest.json']))).toMatchObject({ format: 'sdd', type: 'project' });
    expect(strFromU8(f.mimetype)).toBe('application/vnd.sdd+zip');
    expect(strFromU8(p.mimetype)).toBe('application/vnd.sdd+zip');
  });
  it('readSdd refuses a project container and readSddProj refuses a file container, with a hint', () => {
    expect(() => readSdd(buildSddProj(proj()))).toThrow(/whole project/);
    expect(() => readSddProj(buildSdd(file()))).toThrow(/single file/);
  });
});

describe('human-readable source.sdd', () => {
  it('a file container carries source.sdd', () => {
    const z = unzipSync(buildSdd(file()));
    const src = strFromU8(z['source.sdd']);
    expect(src).toMatch(/^#!sdd 1/);
    expect(src).toContain('node web "Web" icon=service');
    expect(src).toContain('web -> api');
    expect(Object.keys(z)[0]).toBe('mimetype');
  });
  it('a project container carries files/<id>/source.sdd per file', () => {
    const z = unzipSync(buildSddProj(proj()));
    expect(Object.keys(z)).toEqual(expect.arrayContaining(['files/a.sdd', 'files/a/source.sdd', 'files/b.sdd', 'files/b/source.sdd']));
    expect(strFromU8(z['files/b/source.sdd'])).toContain('node x "x"');
  });
  it('matching source.sdd (even reformatted, with comments) is silent', () => {
    const z = unzipSync(buildSdd(file()));
    const edited = '// just formatting\n' + strFromU8(z['source.sdd']).replace(/\n/g, '\n\n');
    const bytes = zipSync({ mimetype: [z.mimetype, { level: 0 }], ...Object.fromEntries(Object.entries(z).filter(([k]) => k !== 'mimetype')), 'source.sdd': strToU8(edited) });
    expect(readSdd(bytes).warnings).toEqual([]);
  });
  it('a conflicting source.sdd: the JSON wins, with a warning (file and project)', () => {
    const z = unzipSync(buildSdd(file()));
    const bytes = zipSync({ mimetype: [z.mimetype, { level: 0 }], ...Object.fromEntries(Object.entries(z).filter(([k]) => k !== 'mimetype')), 'source.sdd': strToU8('#!sdd 1\nnode other "Other"\n') });
    const r = readSdd(bytes);
    expect(r.project.pages[0].nodes.map((n) => n.id)).toEqual(['web', 'api']);
    expect(r.warnings.join('|')).toMatch(/source\.sdd differs/);
    const pz = unzipSync(buildSddProj(proj()));
    const pbytes = zipSync({ mimetype: [pz.mimetype, { level: 0 }], ...Object.fromEntries(Object.entries(pz).filter(([k]) => k !== 'mimetype')), 'files/a/source.sdd': strToU8('#!sdd 1\nnode nope "Nope"\n') });
    const pr = readSddProj(pbytes);
    expect(pr.files[0].doc.pages[0].nodes.map((n) => n.id)).toEqual(['web', 'api']);
    expect(pr.warnings.join('|')).toMatch(/Overview: files\/a\/source\.sdd differs/);
  });
  it('a source.sdd with syntax errors is ignored with a warning', () => {
    const z = unzipSync(buildSdd(file()));
    const bytes = zipSync({ mimetype: [z.mimetype, { level: 0 }], ...Object.fromEntries(Object.entries(z).filter(([k]) => k !== 'mimetype')), 'source.sdd': strToU8('garbage garbage') });
    expect(readSdd(bytes).warnings.join('|')).toMatch(/syntax errors/);
  });
});

describe('round trips through readAnySdd', () => {
  it('file', async () => {
    const r = await readAnySdd(buildSdd(file()), 'o.sdd');
    expect(r.kind).toBe('file');
    if (r.kind === 'file') expect(r.project.pages[0].nodes.map((n) => n.id)).toEqual(['web', 'api']);
  });
  it('project', async () => {
    const r = await readAnySdd(buildSddProj(proj()), 'p.sdd');
    expect(r.kind).toBe('project');
    if (r.kind === 'project') {
      expect(r.name).toBe('Platform');
      expect(r.files.map((f) => [f.id, f.folderId, f.kind])).toEqual([['a', null, 'sdd'], ['b', 'f1', 'erd']]);
      expect(r.warnings).toEqual([]);
    }
  });
  it('text creates a laid-out one-page project', async () => {
    const r = await readAnySdd(strToU8(text), 'shop.sdd');
    expect(r.kind).toBe('text');
    if (r.kind === 'text') {
      expect(r.project.name).toBe('Shop');
      const pos = r.project.pages[0].nodes.map((n) => n.position);
      expect(new Set(pos.map((p) => `${p.x},${p.y}`)).size).toBe(2); // auto-layout gave each node its own spot
      expect(r.project.pages[0].edges[0]).toMatchObject({ source: 'web', target: 'api', label: 'HTTPS' });
    }
  });
  it('text -> project -> text is stable', () => {
    const { project } = textToProject(text);
    const t1 = projectToText(project);
    const again = textToProject(t1).project;
    expect(projectToText(again)).toBe(t1);
  });
  it('text with syntax errors fails with line numbers and creates nothing', async () => {
    await expect(readAnySdd(strToU8('#!sdd 1\nnode a "A"\nbogus\n'), 'x.sdd')).rejects.toThrow(/line 3/);
  });
});

describe('legacy archives still open (and are never written)', () => {
  it('a .sdd without manifest type is a file', async () => {
    const r = await readAnySdd(legacyFile(buildSdd(file())), 'old.sdd');
    expect(r.kind).toBe('file');
  });
  it('a .sddproj opens as a project', async () => {
    const r = await readAnySdd(legacyProject(buildSddProj(proj())), 'old.sddproj');
    expect(r.kind).toBe('project');
    if (r.kind === 'project') expect(r.files).toHaveLength(2);
  });
  it('a .sddt opens as text, even without the header', async () => {
    const r = await readAnySdd(strToU8('node a "A"\n'), 'diagram.sddt');
    expect(r.kind).toBe('text');
  });
  it('writers produce only the new spelling', () => {
    expect(JSON.parse(strFromU8(unzipSync(buildSddProj(proj()))['manifest.json'])).format).toBe('sdd');
    expect(strFromU8(unzipSync(buildSddProj(proj())).mimetype)).not.toBe(SDDPROJ_MIMETYPE);
  });
});

describe('the same safety limits apply to both kinds', () => {
  const kinds = [['file', () => buildSdd(file())], ['project', () => buildSddProj(proj())]] as const;
  for (const [k, make] of kinds) {
    it(`${k}: size limit`, async () => {
      expect(await code(() => readAnySdd(make(), 'x.sdd', { maxFileBytes: 100 }))).toBe('too-large');
    });
    it(`${k}: uncompressed budget (zip bomb)`, async () => {
      expect(await code(() => readAnySdd(make(), 'x.sdd', { maxUncompressedBytes: 50 }))).toBe('zip-bomb');
    });
    it(`${k}: entry count`, async () => {
      expect(await code(() => readAnySdd(make(), 'x.sdd', { maxEntries: 2 }))).toBe('too-many-entries');
    });
    it(`${k}: path traversal in an entry name`, async () => {
      const z = unzipSync(make());
      const bytes = zipSync({ mimetype: [z.mimetype, { level: 0 }], ...Object.fromEntries(Object.entries(z).filter(([n]) => n !== 'mimetype')), '../evil.txt': strToU8('x') });
      expect(await code(() => readAnySdd(bytes, 'x.sdd'))).toBe('unsafe-path');
    });
    it(`${k}: wrong mimetype`, async () => {
      const z = unzipSync(make());
      const bytes = zipSync({ mimetype: [strToU8('text/plain'), { level: 0 }], ...Object.fromEntries(Object.entries(z).filter(([n]) => n !== 'mimetype')) });
      expect(await code(() => readAnySdd(bytes, 'x.sdd'))).toBe('bad-mimetype');
    });
    it(`${k}: tampered contents fail the checksum`, async () => {
      const z = unzipSync(make());
      const target = k === 'file' ? 'pages/' + Object.keys(z).find((n) => n.startsWith('pages/'))!.slice(6) : 'files/a.sdd';
      const tampered = k === 'file' ? strToU8(strFromU8(z[target]).replace('Web', 'Hax')) : buildSdd(doc('a', 'Overview', [node('hax')]));
      const bytes = zipSync({ mimetype: [z.mimetype, { level: 0 }], ...Object.fromEntries(Object.entries({ ...z, [target]: tampered }).filter(([n]) => n !== 'mimetype')) });
      expect(await code(() => readAnySdd(bytes, 'x.sdd'))).toBe('checksum');
    });
  }
  it('text: size limit', async () => {
    expect(await code(() => readAnySdd(strToU8(text), 'x.sdd', { maxFileBytes: 10 }))).toBe('too-large');
  });
  it('project: an unsafe source path in the manifest', async () => {
    const z = unzipSync(buildSddProj(proj()));
    const m = JSON.parse(strFromU8(z['manifest.json']));
    m.files[0].source = 'files/../../x/source.sdd';
    const bytes = zipSync({ mimetype: [z.mimetype, { level: 0 }], ...Object.fromEntries(Object.entries({ ...z, 'manifest.json': strToU8(JSON.stringify(m)) }).filter(([n]) => n !== 'mimetype')) });
    expect(await code(() => readAnySdd(bytes, 'x.sdd'))).toBe('unsafe-path');
  });
});
