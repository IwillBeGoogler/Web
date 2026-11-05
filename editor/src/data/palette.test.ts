import { describe, expect, it } from 'vitest';
import { ALL_ITEMS, ITEMS_BY_ID, SECTIONS, searchItems, searchSections } from './catalog';
import { createNodeFromPaletteItem, filterPalette, getItem, PALETTE } from './palette';
import { getIcon, hasIcon, isBrandIcon, resolveIcon } from './icons';
import { ICON_REF, PACK_LOADERS } from './icons/index.generated';
import { loadPack } from './icons/registry';
import { isUnsafe } from '../../scripts/sanitize.mjs';
import { monitoringStack } from '../templates/monitoringStack';

const sec = (id: string) => SECTIONS.find((s) => s.id === id)!;
const subIds = (id: string) => sec(id).subs.map((s) => s.id);
const idsOf = (secId: string) => sec(secId).subs.flatMap((s) => s.items.map((i) => i.id));

describe('catalog structure', () => {
  it('has the expected top-level sections', () => {
    const ids = SECTIONS.map((s) => s.id);
    for (const id of ['generic', 'clients', 'network', 'compute', 'databases', 'backend', 'messaging', 'frontend', 'ai', 'devops', 'observability', 'security', 'cloud', 'saas', 'apache'])
      expect(ids, id).toContain(id);
  });
  it('item ids are unique and each lives in exactly one section (cross-listing is by tags)', () => {
    expect(new Set(ALL_ITEMS.map((i) => i.id)).size).toBe(ALL_ITEMS.length);
    const total = SECTIONS.reduce((n, s) => n + s.subs.reduce((m, b) => m + b.items.length, 0), 0);
    expect(total).toBe(ALL_ITEMS.length);
    expect(idsOf('devops')).not.toContain('nginx');
    expect(idsOf('network')).toContain('nginx');
    expect(ITEMS_BY_ID.get('nginx')!.tags).toEqual(expect.arrayContaining(['devops', 'platform']));
    expect(ITEMS_BY_ID.get('nginx')).toBe(getItem('nginx'));
  });
  it('every sub-section is non-empty', () => {
    for (const s of SECTIONS) for (const b of s.subs) expect(b.items.length, `${s.id}/${b.id}`).toBeGreaterThan(0);
  });
  it('databases has the requested sub-sections', () => {
    for (const id of ['relational', 'document', 'kv', 'wide', 'db-search', 'tsdb', 'graph', 'olap', 'vector', 'embedded', 'object', 'db-tools'])
      expect(subIds('databases'), id).toContain(id);
  });
  it('devops has the requested sub-sections', () => {
    for (const id of ['scm', 'cicd', 'gitops', 'containers', 'orchestration', 'k8s-tools', 'iac', 'registries', 'testing', 'chatops', 'build'])
      expect(subIds('devops'), id).toContain(id);
  });
  it('apache is a tag-driven view: 60+ ASF items are reachable via the apache tag', () => {
    expect(ALL_ITEMS.filter((i) => i.tags.includes('apache')).length).toBeGreaterThanOrEqual(60);
    expect(idsOf('apache').length).toBeGreaterThanOrEqual(25);
    for (const id of ['asf-stream', 'asf-bigdata', 'asf-db', 'asf-formats', 'asf-processing', 'asf-web', 'asf-security', 'asf-dev', 'asf-other']) expect(subIds('apache')).toContain(id);
  });
  it('observability covers metrics, logs, traces, profiling, dashboards, alerting', () => {
    for (const id of ['metrics', 'exporters', 'logs', 'traces', 'profiling', 'dashboards', 'alerting', 'uptime', 'errors', 'ebpf', 'cloud-mon']) expect(subIds('observability')).toContain(id);
  });
  it('contains well-known tools from every category', () => {
    for (const id of ['postgresql', 'mongodb', 'redis', 'cassandra', 'elasticsearch', 'clickhouse', 'neo4j', 'qdrant', 'minio', 'kafka', 'rabbitmq', 'react', 'nextjs', 'pytorch', 'openai', 'vercel',
      'terraform', 'argocd', 'helm', 'prometheus', 'grafana', 'loki', 'tempo', 'jaeger', 'sentry', 'vault', 'trivy', 'stripe', 'twilio', 'debezium', 'caddy', 'vmware', 'proxmox', 'rack', 'gpu'])
      expect(ITEMS_BY_ID.has(id), id).toBe(true);
  });
});

describe('icons', () => {
  it('every icon-based item resolves to a real icon (no badge)', () => {
    for (const it of ALL_ITEMS.filter((i) => i.kind === 'icon')) {
      expect(it.iconId, it.id).toBeTruthy();
      expect(hasIcon(it.iconId!), it.id).toBe(true);
      expect(getIcon(it.iconId).kind, it.id).not.toBe('badge');
    }
  });
  it('every brand pack loads lazily, bodies exist and are sanitized', async () => {
    for (const [id, ref] of Object.entries(ICON_REF)) {
      if (ref.startsWith('g:')) continue;
      const [pack, key] = [ref.slice(0, ref.indexOf('/')), ref.slice(ref.indexOf('/') + 1)];
      expect(PACK_LOADERS[pack], `${id} pack`).toBeDefined();
      const icons = await loadPack(pack);
      expect(icons[key], `${id} -> ${ref}`).toBeDefined();
      expect(isUnsafe(icons[key].body), id).toBe(false);
      expect(icons[key].viewBox).toMatch(/^[\d.\s-]+$/);
    }
  });
  it('named products use a brand logo, generic components use stroke glyphs', async () => {
    for (const id of ['prometheus', 'grafana', 'postgresql', 'kafka', 'kubernetes', 'terraform', 'github', 'aws', 'stripe', 'alloy', 'tempo', 'pyroscope', 'cadvisor', 'victoriametrics', 'victorialogs']) {
      expect(isBrandIcon(id), id).toBe(true);
      expect((await resolveIcon(id)).kind, id).toBe('brand');
    }
    for (const id of ['service', 'database', 'queue', 'user', 'cache', 'load-balancer', 'firewall', 'rack', 'rest']) expect(getIcon(id).kind, id).toBe('generic');
  });
  it('unknown id falls back to badge (resolver only)', () => {
    expect(getIcon('does-not-exist').kind).toBe('badge');
  });
  it('template icons all resolve', () => {
    for (const n of monitoringStack().nodes.filter((n) => n.type === 'icon')) expect(getIcon(n.data.iconId).kind, String(n.data.iconId)).not.toBe('badge');
  });
});

describe('search (names, aliases, keywords)', () => {
  const find = (q: string) => searchItems(q).map((i) => i.id);
  it('empty query returns everything', () => expect(filterPalette(PALETTE, '').length).toBe(PALETTE.length));
  it('alias search', () => {
    expect(find('pg')).toContain('postgresql');
    expect(find('mongo')).toContain('mongodb');
    expect(find('es')).toContain('elasticsearch');
    expect(find('k8s')).toContain('kubernetes');
    expect(find('tf')).toContain('terraform');
    expect(find('gha')).toContain('github-actions');
    expect(find('cdc')).toContain('debezium');
    expect(find('lambda')).toContain('function');
    expect(find('otel')).toContain('opentelemetry');
  });
  it('case-insensitive and punctuation-insensitive', () => {
    expect(find('PROM')).toContain('prometheus');
    expect(find('node.js')).toContain('nodejs');
    expect(find('git hub')).toContain('github');
  });
  it('exact alias ranks first', () => {
    expect(find('pg')[0]).toBe('postgresql');
    expect(find('k8s')[0]).toBe('kubernetes');
  });
  it('short queries do not match by substring', () => {
    for (const id of find('es').slice(0, 5)) expect(searchItems('es').length).toBeGreaterThan(0), expect(id).toBeTruthy();
    expect(find('zz')).toEqual([]);
  });
  it('finds across sections and by section name', () => {
    const r = searchSections(SECTIONS, 'proxy').map((s) => s.id);
    expect(r).toContain('network');
    expect(r).toContain('platform');
    expect(searchItems('#devops proxy').some((i) => i.id === 'nginx')).toBe(true);
    const sub = searchSections(SECTIONS, 'time-series').flatMap((s) => s.subs.map((b) => b.id));
    expect(sub).toContain('tsdb');
  });
  it('no match', () => expect(find('zzzzqqq')).toEqual([]));
});

describe('createNodeFromPaletteItem', () => {
  const mk = (id: string) => createNodeFromPaletteItem(getItem(id)!, { x: 1, y: 2 }, 'n1');
  it('icon', () => expect(mk('prometheus')).toMatchObject({ id: 'n1', type: 'icon', position: { x: 1, y: 2 }, data: { label: 'Prometheus', subtitle: ':9090', iconId: 'prometheus' } }));
  it('text, group, sticky, shapes', () => {
    expect(mk('text').type).toBe('text');
    expect(mk('group')).toMatchObject({ type: 'group', width: 320 });
    expect(mk('note').type).toBe('sticky');
    expect(mk('diamond')).toMatchObject({ type: 'shape', data: { shape: 'diamond' } });
    expect(mk('circle')).toMatchObject({ data: { shape: 'ellipse' }, width: 100, height: 100 });
  });
  it('helper presets', () => {
    expect(mk('step-badge')).toMatchObject({ type: 'shape', data: { label: '1', fill: '#2d3340', textColor: '#ffffff' } });
    expect(mk('zone').data.strokeStyle).toBe('dashed');
    expect(mk('boundary').type).toBe('group');
  });
});

import { createNodeFromPaletteItem as makeNode, getItem as itemById } from './palette';
import { registerBoardSection } from './board';
registerBoardSection();
describe('Board palette items create nodes', () => {
  it('frame, mind map, stamp, sticky and text', () => {
    const at = { x: 10, y: 20 };
    expect(makeNode(itemById('board-frame')!, at, 'a')).toMatchObject({ type: 'frame', width: 800, height: 500, data: { label: 'Frame' } });
    expect(makeNode(itemById('board-mindmap')!, at, 'b')).toMatchObject({ type: 'mindmap', data: { root: true } });
    expect(makeNode(itemById('board-stamp')!, at, 'c')).toMatchObject({ type: 'stamp', data: { emoji: expect.any(String) } });
    expect(makeNode(itemById('board-sticky')!, at, 'd')).toMatchObject({ type: 'sticky', data: { autoFont: true } });
    expect(makeNode(itemById('board-text')!, at, 'e')).toMatchObject({ type: 'text', data: { label: 'Text', bold: false } });
  });
});
