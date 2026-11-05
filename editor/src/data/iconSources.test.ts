import { describe, expect, it } from 'vitest';
import { CATALOG_DEFS } from './catalog.generated';
import { ICON_SOURCES } from './icons/sources.generated';
import { auditIconSources, isOfficialSource, type IconSourceEntry } from './iconSources';

const entry = (source: IconSourceEntry['source'], branded = true): IconSourceEntry => ({ source, origin: 'x', branded });

describe('auditIconSources', () => {
  it('flags branded handmade, missing and non-allowlisted sources; ignores generic non-brand', () => {
    const p = auditIconSources({ a: entry('handmade'), b: entry('iconify-logos'), c: entry('generic', false), d: entry('generic') }, ['a', 'b', 'c', 'd', 'e']);
    expect(p.map((x) => [x.id, x.source])).toEqual([['a', 'handmade'], ['d', 'generic'], ['e', 'missing']]);
  });
  it('allowlist excludes handmade/generic', () => {
    expect(isOfficialSource('handmade')).toBe(false);
    expect(isOfficialSource('generic')).toBe(false);
    expect(isOfficialSource('parent-project')).toBe(true);
  });
});

describe('catalog icon provenance', () => {
  it('every catalog item has a recorded source', () => {
    expect(auditIconSources(ICON_SOURCES, CATALOG_DEFS.map((d) => d.id)).filter((p) => p.source === 'missing')).toEqual([]);
  });
  it('every branded item comes from an official source (no handmade brand icons)', () => {
    // brands with no official logo source yet keep a generic stand-in (scripts/gen-icons.mjs FALLBACK) instead of vanishing from the palette
    const STAND_INS = new Set(['manticore', 'greenplum', 'lmdb', 'proxysql', 'micronaut', 'echo', 'fivetran', 'postmark', 'collectd', 'statsd', 'papertrail', 'logrocket', 'maxwell', 'canal', 'meltano', 'estuary', 'striim', 'conduktor', 'sqoop', 'squid', 'litespeed', 'kvm']);
    expect(auditIconSources(ICON_SOURCES, CATALOG_DEFS.map((d) => d.id)).filter((p) => !STAND_INS.has(p.id))).toEqual([]);
  });
  it('known brands are branded and never generic', () => {
    for (const id of ['journald', 'node-exporter', 'cadvisor', 'vector', 'victorialogs', 'vmbackup', 'vmalert', 'vmagent', 'vmauth', 'active-directory', 'prometheus', 'grafana']) {
      const e = ICON_SOURCES[id];
      expect(e, id).toBeDefined();
      expect(e.branded, id).toBe(true);
      expect(['generic', 'handmade'], id).not.toContain(e.source);
    }
  });
  it('parent-project logos are used where no standalone logo exists', () => {
    expect(ICON_SOURCES['journald'].origin).toMatch(/systemd/i);
    expect(ICON_SOURCES['node-exporter'].source).toBe('parent-project');
    expect(ICON_SOURCES['node-exporter'].origin).toMatch(/prometheus/i);
    for (const id of ['vmalert', 'vmbackup', 'vmagent', 'vmauth']) expect(ICON_SOURCES[id].origin, id).toMatch(/victoriametrics/i);
  });
  it('generic glyphs are only used for non-brand items', () => {
    const generic = Object.entries(ICON_SOURCES).filter(([, e]) => e.source === 'generic');
    expect(generic.length).toBeGreaterThan(50);
    for (const [id, e] of generic) expect(e.branded, id).toBe(false);
  });
});
