import { describe, expect, it } from 'vitest';
import { parseQuery, scoreEntry, searchIndex, topTags } from './search';
import { ALL_ITEMS, searchItems, searchSections, SECTIONS } from '../data/catalog';
import { SEARCH_INDEX, type SearchIndexData } from '../data/search-index.generated';
import { TOP_TAGS } from '../data/topTags';

const ids = (l: { id: string }[]) => l.map((x) => x.id);
const tagged = (t: string) => ALL_ITEMS.filter((i) => i.tags.includes(t)).map((i) => i.id);

describe('tags on the catalog', () => {
  it('every item has tags (generic items too)', () => {
    for (const i of ALL_ITEMS) expect(i.tags.length, i.id).toBeGreaterThan(0);
  });
  it('provider, category and trait tags are present', () => {
    const tags = (id: string) => ALL_ITEMS.find((i) => i.id === id)!.tags;
    expect(tags('dynamodb')).toEqual(expect.arrayContaining(['aws', 'database', 'nosql', 'cloud', 'managed']));
    expect(tags('bigquery')).toEqual(expect.arrayContaining(['gcp', 'database']));
    expect(tags('cosmosdb')).toEqual(expect.arrayContaining(['azure', 'database']));
    expect(tags('kafka')).toEqual(expect.arrayContaining(['apache', 'streaming', 'open-source', 'self-hosted']));
    expect(tags('loki')).toEqual(expect.arrayContaining(['grafana-labs', 'logs', 'monitoring']));
    expect(tags('postgresql')).toEqual(expect.arrayContaining(['sql', 'database', 'postgres']));
  });
  it('search index has one entry per catalog definition and a consistent inverted index', () => {
    expect(SEARCH_INDEX.ids.length).toBeGreaterThan(600);
    for (const [tag, list] of Object.entries(SEARCH_INDEX.tagIndex)) for (const i of list) expect(SEARCH_INDEX.tags[i], tag).toContain(tag);
  });
});

describe('query parsing', () => {
  it('terms, #tags and chips', () => {
    expect(parseQuery('aws database')).toEqual({ terms: ['aws', 'database'], tags: [] });
    expect(parseQuery('#Monitoring grafana', ['aws'])).toEqual({ terms: ['grafana'], tags: ['aws', 'monitoring'] });
    expect(parseQuery('  ')).toEqual({ terms: [], tags: [] });
  });
});

describe('searching', () => {
  it('"aws" returns EVERY aws-tagged item (and nothing else): count equals the AWS catalog size', () => {
    const want = tagged('aws');
    expect(want.length).toBeGreaterThanOrEqual(15);
    const got = ids(searchItems('aws'));
    expect(new Set(got)).toEqual(new Set(want));
    expect(got.length).toBe(want.length);
    // the prebuilt index agrees
    expect(new Set(ids(searchIndex(SEARCH_INDEX, 'aws')))).toEqual(new Set(want));
  });
  it('ranking: name matches first, then tag matches', () => {
    const got = ids(searchItems('aws'));
    expect(got[0]).toBe('aws'); // the item literally named AWS
    const nameHits = ALL_ITEMS.filter((i) => i.tags.includes('aws') && /aws/i.test(i.label)).map((i) => i.id);
    const firstTagOnly = got.findIndex((id) => !nameHits.includes(id));
    expect(got.slice(0, firstTagOnly).every((id) => nameHits.includes(id))).toBe(true);
  });
  it('multi-term AND: "aws database" is a subset of "aws" and of "database"', () => {
    const both = new Set(ids(searchItems('aws database')));
    expect(both.size).toBeGreaterThan(3);
    const aws = new Set(ids(searchItems('aws')));
    const db = new Set(ids(searchItems('database')));
    for (const id of both) {
      expect(aws.has(id), id).toBe(true);
      expect(db.has(id), id).toBe(true);
    }
    expect([...both]).toEqual(expect.arrayContaining(['dynamodb', 'aurora', 'redshift']));
    expect(both.has('sqs')).toBe(false);
  });
  it('#tag syntax: only items carrying that exact tag', () => {
    const got = ids(searchItems('#monitoring'));
    expect(new Set(got)).toEqual(new Set(tagged('monitoring')));
    expect(ids(searchItems('#monitoring grafana')).every((id) => tagged('monitoring').includes(id))).toBe(true);
    expect(ids(searchItems('#monitoring grafana'))).toContain('grafana');
  });
  it('chip filters: toggling narrows and widens', () => {
    const aws = ids(searchItems('', ['aws']));
    expect(new Set(aws)).toEqual(new Set(tagged('aws')));
    const awsDb = ids(searchItems('', ['aws', 'database']));
    expect(awsDb.length).toBeLessThan(aws.length);
    expect(awsDb.every((id) => aws.includes(id))).toBe(true);
    expect(searchItems('', []).length).toBe(ALL_ITEMS.length); // no query, no chips -> everything (the full catalog)
    expect(searchIndex(SEARCH_INDEX, '', [])).toEqual([]);
  });
  it('chips combine with text and are honoured by the sidebar sections search', () => {
    const secs = searchSections(SECTIONS, 'amazon', ['database']);
    const flat = secs.flatMap((s) => s.subs.flatMap((b) => b.items.map((i) => i.id)));
    expect(flat.length).toBeGreaterThan(0);
    expect(flat.every((id) => tagged('database').includes(id))).toBe(true);
  });
  it('tag search lists items across all sub-categories without loading icon packs', () => {
    const secs = searchSections(SECTIONS, '#aws');
    expect(secs.length).toBeGreaterThan(2); // spread over several top-level sections
  });
  it('aliases still work ("k8s" finds Kubernetes)', () => {
    expect(ids(searchItems('k8s'))).toContain('kubernetes');
  });
  it('scoreEntry: tag exact < name', () => {
    const e = { id: 'x', label: 'Thing', aliases: [], tags: ['aws'] };
    const n = { id: 'aws-thing', label: 'AWS Thing', aliases: [], tags: ['aws'] };
    const pq = parseQuery('aws');
    expect(scoreEntry(n, pq)).toBeGreaterThan(scoreEntry(e, pq));
    expect(scoreEntry(e, parseQuery('nope'))).toBe(0);
  });
});

describe('top tag chips', () => {
  it('the preferred chips come first, in order, with counts', () => {
    const chips = topTags(SEARCH_INDEX, TOP_TAGS, 10);
    expect(chips.map((c) => c.tag)).toEqual(TOP_TAGS.filter((t) => SEARCH_INDEX.tagIndex[t]));
    expect(chips[0]).toEqual({ tag: 'aws', count: tagged('aws').length });
  });
});

// 10 ms on a laptop; shared CI runners are 2-4x slower, so they get 40 ms (still catches an accidental O(n^2))
const BUDGET_MS = process.env.CI ? 40 : 10;

describe('performance', () => {
  const synthetic = (n: number): SearchIndexData => {
    const tagsPool = ['aws', 'gcp', 'azure', 'database', 'monitoring', 'k8s', 'queue', 'security', 'open-source', 'apache'];
    const idx: SearchIndexData = { ids: [], names: [], aliases: [], tags: [], tagIndex: {} };
    for (let i = 0; i < n; i++) {
      const tags = [tagsPool[i % 10], tagsPool[(i * 7) % 10], 'x' + (i % 50)];
      idx.ids.push(`item-${i}`);
      idx.names.push(`service ${i} ${tagsPool[i % 10]} thing`);
      idx.aliases.push([`alias${i}`, `svc${i}`]);
      idx.tags.push([...new Set(tags)]);
      for (const t of new Set(tags)) (idx.tagIndex[t] ??= []).push(i);
    }
    return idx;
  };
  it('3000 items: text, tag, multi-term and #tag searches each stay within the time budget (best of 15)', () => {
    const big = synthetic(3000);
    for (const q of ['aws', 'aws database', '#monitoring', 'serv', 'thing 12']) {
      let best = Infinity;
      for (let i = 0; i < 15; i++) {
        const t = performance.now();
        searchIndex(big, q);
        best = Math.min(best, performance.now() - t);
      }
      expect(best, q).toBeLessThan(BUDGET_MS);
    }
  });
  it('the real index too', () => {
    let best = Infinity;
    for (let i = 0; i < 15; i++) {
      const t = performance.now();
      searchIndex(SEARCH_INDEX, 'aws database');
      best = Math.min(best, performance.now() - t);
    }
    expect(best).toBeLessThan(BUDGET_MS);
  });
});
