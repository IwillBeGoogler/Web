import { describe, expect, it } from 'vitest';
import './bootstrap';
import { ALL_ITEMS, ITEMS_BY_ID, SECTIONS, searchItems } from './catalog';
import { mergedSearchIndex, PROVIDERS } from './cloud';
import { resolveId } from './idAliases';
import { getIcon, resolveIcon } from './icons';
import { searchIndex } from '../lib/search';
import { auditSvgBody } from '../lib/svgAudit';

const section = (id: string) => SECTIONS.find((s) => s.id === id)!;
const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe('provider packs register generically', () => {
  it('every provider with items has a section, refs, loaders and tags', () => {
    for (const p of PROVIDERS) {
      if (!p.DEFS.length) continue;
      expect(SECTIONS.some((s) => s.id === p.SECTION.id), p.SECTION.id).toBe(true);
      for (const d of p.DEFS) {
        expect(d.tags, d.id).toContain(p.SECTION.id);
        expect(ITEMS_BY_ID.get(resolveId(d.id)), d.id).toBeTruthy();
      }
    }
  });
});

describe('AWS (official Architecture Icons)', () => {
  const aws = section('aws');
  const items = aws.subs.flatMap((s) => s.items);
  it('has the full service set (>= 250 services) plus official group styles', () => {
    expect(aws.subs.length).toBeGreaterThanOrEqual(12);
    const services = aws.subs.filter((s) => s.id !== 'groups').flatMap((s) => s.items);
    expect(services.length).toBeGreaterThanOrEqual(250);
    expect(aws.subs.find((s) => s.id === 'groups')!.items.length).toBeGreaterThanOrEqual(10);
  });
  it('"aws" search returns the WHOLE pack (every item, every sub-category), name matches first', () => {
    const tagged = ALL_ITEMS.filter((i) => i.tags.includes('aws') && i.kind !== 'cluster').map((i) => i.id);
    for (const it of items) expect(tagged, it.id).toContain(it.id);
    const got = ids(searchItems('aws').filter((i) => i.kind !== 'cluster'));
    expect(new Set(got)).toEqual(new Set(tagged));
    expect(got.length).toBeGreaterThanOrEqual(300);
    expect(ids(searchIndex(mergedSearchIndex(), 'aws')).length).toBe(got.length);
  });
  it('"aws database" gives the AWS database services', () => {
    const got = new Set(ids(searchItems('aws database')));
    for (const id of ['dynamodb', 'aurora', 'neptune', 'redshift']) expect(got.has(id), id).toBe(true);
    expect(got.has('aws-lambda') || got.has('lambda')).toBe(false);
  });
  it('service aliases work (s3, eks, sqs, iam, msk)', () => {
    for (const q of ['s3', 'eks', 'sqs', 'iam', 'msk', 'lambda', 'elb']) expect(searchItems(q).some((i) => i.tags.includes('aws')), q).toBe(true);
  });
  it('legacy ids now render the OFFICIAL icon (a coloured tile, not the old Iconify logo)', async () => {
    const icon = await resolveIcon('s3');
    expect(icon.kind).toBe('brand');
    if (icon.kind === 'brand') {
      expect(icon.viewBox).toBe('0 0 80 80');
      expect(auditSvgBody(icon.body, icon.viewBox).ok).toBe(true);
    }
  });
  it('group items carry official colours and the group icon', () => {
    const vpc = items.find((i) => i.label === 'VPC')!;
    expect(vpc.kind).toBe('group');
    expect(vpc.preset!.data.stroke).toMatch(/^#[0-9A-F]{6}$/i);
    expect(vpc.preset!.data.groupIcon).toBe(vpc.id);
    expect(getIcon(vpc.id).kind).not.toBe('badge');
    const region = items.find((i) => i.label === 'Region')!;
    expect(region.preset!.data.strokeStyle).toBe('dashed');
  });
  it('every AWS icon passes the audit (no blank / tiny / white-only)', async () => {
    for (const it of items.slice(0, 400)) {
      const icon = await resolveIcon(it.iconId);
      expect(icon.kind, it.id).toBe('brand');
      if (icon.kind === 'brand') expect(auditSvgBody(icon.body, icon.viewBox).ok, it.id).toBe(true);
    }
  });
});

/** shared expectations for every provider pack */
function providerSuite(id: string, opts: { min: number; subs?: number; legacy?: string[]; aliases?: string[]; database?: string[] }) {
  describe(`${id} pack`, () => {
    const sec = section(id);
    const items = sec?.subs.flatMap((s) => s.items) ?? [];
    it(`has >= ${opts.min} items across several sub-categories`, () => {
      expect(sec, id).toBeTruthy();
      expect(items.length).toBeGreaterThanOrEqual(opts.min);
      expect(sec.subs.length).toBeGreaterThanOrEqual(opts.subs ?? 3);
    });
    it(`"${id}" search returns the WHOLE pack (count == provider-tagged catalog size)`, () => {
      const tagged = ALL_ITEMS.filter((i) => i.tags.includes(id) && i.kind !== 'cluster').map((i) => i.id);
      for (const it of items) expect(tagged, it.id).toContain(it.id);
      const got = ids(searchItems(id).filter((i) => i.kind !== 'cluster')); // cluster wizard entries are runtime-registered (not in the generated index)
      expect(got.filter((x) => !tagged.includes(x)), 'found by name/alias but not tagged').toEqual([]);
      expect(tagged.filter((x) => !got.includes(x)), 'tagged but not found').toEqual([]);
      expect(got.length).toBe(tagged.length);
      expect(ids(searchIndex(mergedSearchIndex(), id)).length).toBe(tagged.length);
    });
    if (opts.legacy)
      it('legacy catalog ids use the official icon now', async () => {
        for (const lid of opts.legacy!) {
          expect(items.some((i) => i.id === lid), lid).toBe(true);
          const icon = await resolveIcon(lid);
          expect(icon.kind, lid).toBe('brand');
        }
      });
    if (opts.aliases)
      it('aliases find services', () => {
        for (const q of opts.aliases!) expect(searchItems(q).some((i) => i.tags.includes(id)), q).toBe(true);
      });
    if (opts.database)
      it(`"${id} database" finds the database services`, () => {
        const got = new Set(ids(searchItems(`${id} database`)));
        for (const d of opts.database!) expect(got.has(d), d).toBe(true);
      });
    it('every icon renders (audit: not blank, tiny or white-only)', async () => {
      for (const it of items) {
        const icon = await resolveIcon(it.iconId);
        expect(icon.kind, it.id).toBe('brand');
        if (icon.kind === 'brand') expect(auditSvgBody(icon.body, icon.viewBox).ok, it.id).toBe(true);
      }
    });
  });
}
providerSuite('gcp', { min: 200, legacy: ['bigquery', 'cloud-sql', 'spanner', 'gcs'], aliases: ['gke', 'gce', 'pubsub', 'bigtable'], database: ['spanner', 'cloud-sql'] });
providerSuite('azure', { min: 450, legacy: ['cosmosdb', 'azure-blob', 'service-bus', 'event-hubs', 'aks', 'acr'], aliases: ['aks', 'vnet', 'key vault', 'apim', 'functions'], database: ['cosmosdb'] });
providerSuite('k8s', { min: 40, aliases: ['pod', 'ingress', 'configmap', 'pvc', 'kubelet'] });
providerSuite('platforms', { min: 25, legacy: ['cloudflare'], aliases: ['oci', 'linode', 'vsphere', 'droplet', 'hcloud'] });
describe('other clouds: vendor tags', () => {
  it('each vendor has its own tag', () => {
    for (const [tag, label] of [['cloudflare', 'Cloudflare Workers'], ['oracle', 'Oracle Cloud Infrastructure'], ['ibm', 'IBM Cloud'], ['alibaba', 'Alibaba Cloud'], ['digitalocean', 'DigitalOcean'], ['hetzner', 'Hetzner'], ['openstack', 'OpenStack']] as const)
      expect(ALL_ITEMS.some((i) => i.tags.includes(tag) && i.label === label), tag).toBe(true);
  });
});
providerSuite('cncf', { min: 35, subs: 2, aliases: ['envoy', 'argo', 'helm'] });
describe('cncf maturity tags', () => {
  it('graduated and incubating are tags and sub-categories', () => {
    expect(ALL_ITEMS.filter((i) => i.tags.includes('graduated')).length).toBeGreaterThan(20);
    expect(ALL_ITEMS.filter((i) => i.tags.includes('incubating')).length).toBeGreaterThan(20);
    expect(section('cncf').subs.map((s) => s.id)).toEqual(['graduated', 'incubating']);
  });
});
