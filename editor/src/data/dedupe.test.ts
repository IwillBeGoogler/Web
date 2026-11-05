import { describe, expect, it } from 'vitest';
import './bootstrap';
import { bootstrapCatalog } from './bootstrap';
import { ALL_ITEMS, ITEMS_BY_ID, SECTIONS, registerSections, searchItems } from './catalog';
import { registerCloudPacks } from './cloud';
import { clusterSection } from '../clusters/palette';
import { resolveId, ID_ALIASES } from './idAliases';
import { getItem } from './palette';
import { validateDiagram } from '../lib/serialization';

const snapshot = () => SECTIONS.map((s) => `${s.id}:${s.subs.map((b) => `${b.id}=${b.items.length}`).join(',')}`);

describe('registration is idempotent', () => {
  it('bootstrap / registerSections / registerCloudPacks N times: same SECTIONS, unique ids, one Clusters section', () => {
    const before = snapshot();
    for (let i = 0; i < 4; i++) {
      bootstrapCatalog();
      registerCloudPacks();
      registerSections([clusterSection()]);
    }
    expect(snapshot()).toEqual(before);
    const ids = SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SECTIONS.filter((s) => s.label === 'Clusters')).toHaveLength(1);
    for (const label of ['AWS', 'Google Cloud', 'Microsoft Azure', 'Kubernetes', 'Other clouds & platforms', 'CNCF']) expect(SECTIONS.filter((s) => s.label === label), label).toHaveLength(1);
  });
  it('upsert keeps the section position and replaces its content', () => {
    const at = SECTIONS.findIndex((s) => s.id === 'clusters');
    registerSections([{ ...clusterSection(), subs: clusterSection().subs.slice(0, 1) }]);
    expect(SECTIONS.findIndex((s) => s.id === 'clusters')).toBe(at);
    expect(SECTIONS[at].subs).toHaveLength(1);
    registerSections([clusterSection()]);
    expect(SECTIONS[at].subs.length).toBeGreaterThan(5);
  });
});

describe('item-level dedupe', () => {
  it('every item id appears in exactly one section and sub-section', () => {
    const seen = new Map<string, string>();
    for (const s of SECTIONS) for (const b of s.subs) for (const it of b.items) {
      expect(seen.has(it.id), `${it.id} in ${seen.get(it.id)} and ${s.id}/${b.id}`).toBe(false);
      seen.set(it.id, `${s.id}/${b.id}`);
    }
    expect(seen.size).toBe(ALL_ITEMS.length);
  });
  it('no two items share a display label (case-insensitive)', () => {
    const by = new Map<string, string[]>();
    for (const it of ALL_ITEMS) { const k = it.label.toLowerCase().replace(/[\s_-]+/g, ''); by.set(k, [...(by.get(k) ?? []), it.id]); }
    const clashes = [...by.entries()].filter(([, v]) => v.length > 1);
    expect(clashes).toEqual([]);
  });
  it('shared labels get a provider prefix', () => {
    const label = (id: string) => ITEMS_BY_ID.get(id)!.label;
    expect(label('azure-sql-server')).toBe('Azure SQL Server');
    expect(label('azure-oracle-database')).toBe('Azure Oracle Database');
    expect(label('gcp-firestore')).toBe('GCP Firestore');
    expect(label('k8s-service')).toBe('K8s Service');
    expect(label('k8s-user')).toBe('K8s User');
    expect(label('k8s-cronjob')).toBe('K8s CronJob');
    expect(label('azure-cache')).toBe('Azure Cache');
    expect(label('azure-nat')).toBe('Azure NAT');
    expect(label('azure-users')).toBe('Azure Users');
    expect(label('gcp-container-registry')).toBe('GCP Container Registry');
    expect(label('azure-savings-plans')).toBe('Azure Savings Plans');
    expect(label('aws-savings-plans')).toBe('AWS Savings Plans');
    expect(label('gcp-security')).toBe('GCP Security');
    expect(label('azure-security')).toBe('Azure Security');
    expect(label('azure-group-resource-group')).toBe('Resource group');
    expect(label('azure-resource-group')).toBe('Resource group (icon)');
    expect(label('k8s-group-namespace')).toBe('Namespace');
    expect(label('k8s-namespace')).toBe('Namespace (icon)');
    expect(label('azure-group-subnet')).toBe('Subnet');
    expect(label('azure-subnet')).toBe('Subnet (icon)');
  });
  it('generic keeps the abstract components; categories do not repeat them', () => {
    const generic = SECTIONS.find((s) => s.id === 'generic')!.subs.flatMap((b) => b.items.map((i) => i.id));
    for (const id of ['server', 'queue', 'database', 'cache']) expect(generic).toContain(id);
    const dbSection = SECTIONS.find((s) => s.id === 'databases')!.subs.flatMap((b) => b.items.map((i) => i.id));
    expect(dbSection).not.toContain('database');
  });
  it('cross-listing is by tags: #devops finds nginx, #cncf finds envoy, #asf-ish apache finds kafka', () => {
    const has = (q: string, id: string) => searchItems(q).some((i) => i.id === id);
    expect(has('#devops', 'nginx')).toBe(true);
    expect(has('#cncf', 'envoy')).toBe(true);
    expect(has('#apache', 'kafka')).toBe(true);
    expect(has('#observability', 'prometheus')).toBe(true);
  });
  it('nginx lives only under Network › Proxies & mesh', () => {
    const sec = SECTIONS.find((s) => s.subs.some((b) => b.items.some((i) => i.id === 'nginx')))!;
    expect(sec.id).toBe('network');
    expect(sec.subs.find((b) => b.items.some((i) => i.id === 'nginx'))!.label).toBe('Proxies & mesh');
  });
});

describe('merged duplicate ids', () => {
  it('alias map resolves the old ids; palette lookup and saved diagrams still load', () => {
    expect(resolveId('aws-compute-optimizer-198')).toBe('aws-compute-optimizer');
    expect(resolveId('aws-amazon-kinesis-video-streams-244')).toBe('aws-amazon-kinesis-video-streams');
    expect(resolveId('nginx')).toBe('nginx');
    for (const [from, to] of Object.entries(ID_ALIASES)) {
      expect(ITEMS_BY_ID.has(from)).toBe(false);
      expect(ITEMS_BY_ID.has(to)).toBe(true);
      expect(getItem(from)).toBe(getItem(to));
    }
    const r = validateDiagram({ version: 1, edges: [], nodes: [{ id: 'a', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'x', iconId: 'aws-compute-optimizer-198' } }] });
    expect(r.ok && r.diagram.nodes[0].data.iconId).toBe('aws-compute-optimizer');
  });
});
