// Regenerates core/capacity/prices.generated.json from the providers' OFFICIAL pricing APIs, for the ids in
// core/capacity/priceMap.ts only. Run: npm run prices:update   (or: make prices)
//   AWS    Price List bulk files (no credentials): index.json -> region_index.json -> <region>/index.csv, streamed and filtered
//   Azure  Retail Prices API (no credentials): https://prices.azure.com/api/retail/prices?$filter=...
//   GCP    Cloud Billing Catalog API, needs GCP_BILLING_API_KEY in the environment; without it GCP is skipped and its previous rows stay
// Flags: --region <aws|azure|gcp>=<region> (repeatable; defaults us-east-1 / eastus / us-central1), --only aws,azure,gcp
// Exit code 1 when a mapped id could not be resolved (the previous value is kept and reported); without a key GCP is silently off.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as mapNs from '../../core/capacity/priceMap';
import * as parseNs from '../../core/capacity/priceParse';
import type { PriceMapEntry, Provider } from '../../core/capacity/priceMap';
import type { AwsResult, AzureItem, GcpSku, PriceFile, PriceRow } from '../../core/capacity/priceParse';

// The server package is CommonJS; depending on the tsx / Node version its named exports only show up on `default`.
const interop = <T extends object>(ns: T): T => ((ns as { default?: T }).default ?? ns);
const { DEFAULT_REGION, PRICE_MAP } = interop(mapNs);
const { AwsCollector, azureFilter, createCsvParser, finalizeRows, pickAzure, pickGcp, rateToUsd } = interop(parseNs);

const OUT = fileURLToPath(new URL('../../core/capacity/prices.generated.json', import.meta.url));
const AWS_BASE = 'https://pricing.us-east-1.amazonaws.com';
const AZURE_API = 'https://prices.azure.com/api/retail/prices';
const GCP_API = 'https://cloudbilling.googleapis.com/v1';

// ------------------------------------------------------------------------------------------------ args
const regions: Record<Provider, string> = { ...DEFAULT_REGION };
let only: Set<Provider> = new Set(['aws', 'azure', 'gcp']);
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--region') {
    const [p, r] = (argv[++i] ?? '').split('=');
    if (!(p in regions) || !r) { console.error('--region expects <aws|azure|gcp>=<region>'); process.exit(2); }
    regions[p as Provider] = r;
  } else if (argv[i] === '--only') {
    only = new Set((argv[++i] ?? '').split(',').filter(Boolean) as Provider[]);
    if (![...only].every((p) => p in regions) || !only.size) { console.error('--only expects a list of aws,azure,gcp'); process.exit(2); }
  } else { console.error(`unknown argument ${argv[i]}`); process.exit(2); }
}

const fetchedAt = new Date().toISOString();
const fresh: Record<string, PriceRow | { error: string }> = {};
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function get(url: string, timeoutMs = 60_000, tries = 3): Promise<Response> {
  let last: unknown;
  for (let t = 1; t <= tries; t++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'system-design-diagram prices:update' } });
      if (res.ok) return res;
      last = new Error(`HTTP ${res.status} ${res.statusText} for ${url.replace(/key=[^&]+/, 'key=***')}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 1000 * t));
  }
  throw last;
}

function row(e: PriceMapEntry, rate: number, rateUnit: string, sourceUrl: string): PriceRow {
  return { provider: e.provider, region: regions[e.provider], label: e.label, unit: e.unit, usd: rateToUsd(rate, rateUnit, e.unit), rate, rateUnit, sourceUrl, fetchedAt };
}

// ------------------------------------------------------------------------------------------------ AWS
async function awsOffer(offer: string, entries: PriceMapEntry[], index: { offers: Record<string, { currentRegionIndexUrl: string }> }) {
  const fail = (error: string) => { for (const e of entries) fresh[e.id] = { error }; };
  try {
    const ri = index.offers[offer]?.currentRegionIndexUrl;
    if (!ri) return fail(`offer ${offer} is not in the AWS price list index`);
    const regionIndex = (await (await get(AWS_BASE + ri)).json()) as { regions: Record<string, { currentVersionUrl: string }> };
    const ver = regionIndex.regions[regions.aws]?.currentVersionUrl;
    if (!ver) return fail(`region ${regions.aws} has no ${offer} price list`);
    const url = AWS_BASE + ver.replace(/index\.json$/, 'index.csv');
    const collector = new AwsCollector(entries.map((e) => ({ id: e.id, query: e.aws! })));
    const parser = createCsvParser((cells) => collector.onRow(cells));
    const res = await get(url, 15 * 60_000);
    const dec = new TextDecoder();
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) parser.push(dec.decode(chunk, { stream: true }));
    parser.push(dec.decode());
    parser.end();
    const results: Record<string, AwsResult> = collector.results();
    for (const e of entries) {
      const r = results[e.id];
      try { fresh[e.id] = r.ok ? row(e, r.rate, r.rateUnit, url) : { error: r.error }; } catch (err) { fresh[e.id] = { error: msg(err) }; }
    }
    console.log(`  aws ${offer}: ${entries.length} id(s) from ${url}`);
  } catch (e) { fail(msg(e)); }
}

async function fetchAws(entries: PriceMapEntry[]) {
  let index: { offers: Record<string, { currentRegionIndexUrl: string }> };
  try { index = (await (await get(`${AWS_BASE}/offers/v1.0/aws/index.json`)).json()) as typeof index; } catch (e) { for (const x of entries) fresh[x.id] = { error: msg(e) }; return; }
  const byOffer = new Map<string, PriceMapEntry[]>();
  for (const e of entries) byOffer.set(e.aws!.offer, [...(byOffer.get(e.aws!.offer) ?? []), e]);
  await Promise.all([...byOffer].map(([offer, es]) => awsOffer(offer, es, index)));
}

// ------------------------------------------------------------------------------------------------ Azure
async function fetchAzure(entries: PriceMapEntry[]) {
  for (const e of entries) {
    const q = e.azure!;
    const first = `${AZURE_API}?$filter=${encodeURIComponent(azureFilter(q, regions.azure))}`;
    try {
      const items: AzureItem[] = [];
      for (let url: string | null = first, page = 0; url && page < 20; page++) {
        const body = (await (await get(url)).json()) as { Items: AzureItem[]; NextPageLink: string | null };
        items.push(...body.Items);
        url = body.NextPageLink;
      }
      const { rate, rateUnit } = pickAzure(items, q);
      fresh[e.id] = row(e, rate, rateUnit, first);
    } catch (err) { fresh[e.id] = { error: msg(err) }; }
  }
  console.log(`  azure: ${entries.length} id(s) from ${AZURE_API}`);
}

// ------------------------------------------------------------------------------------------------ GCP
async function fetchGcp(entries: PriceMapEntry[], key: string) {
  const cache = new Map<string, Promise<GcpSku[]>>();
  const catalog = (serviceId: string) => {
    if (!cache.has(serviceId)) {
      cache.set(serviceId, (async () => {
        const skus: GcpSku[] = [];
        let token = '';
        do {
          const url = `${GCP_API}/services/${serviceId}/skus?currencyCode=USD&pageSize=5000&key=${encodeURIComponent(key)}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
          const body = (await (await get(url)).json()) as { skus?: GcpSku[]; nextPageToken?: string };
          skus.push(...(body.skus ?? []));
          token = body.nextPageToken ?? '';
        } while (token);
        return skus;
      })());
    }
    return cache.get(serviceId)!;
  };
  for (const e of entries) {
    try {
      const { rate, rateUnit } = pickGcp(await catalog(e.gcp!.serviceId), e.gcp!, regions.gcp);
      fresh[e.id] = row(e, rate, rateUnit, `${GCP_API}/services/${e.gcp!.serviceId}/skus`);
    } catch (err) { fresh[e.id] = { error: msg(err) }; }
  }
  console.log(`  gcp: ${entries.length} id(s) from ${GCP_API}`);
}

// ------------------------------------------------------------------------------------------------ main
async function main() {
  const previous: PriceFile | null = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as PriceFile) : null;
  const skipped = new Set<Provider>((['aws', 'azure', 'gcp'] as Provider[]).filter((p) => !only.has(p)));
  const warnings: string[] = [];
  const entriesOf = (p: Provider) => PRICE_MAP.filter((e) => e.provider === p);
  console.log(`fetching prices (aws ${regions.aws}, azure ${regions.azure}, gcp ${regions.gcp})`);
  const jobs: Promise<void>[] = [];
  if (only.has('aws')) jobs.push(fetchAws(entriesOf('aws')));
  if (only.has('azure')) jobs.push(fetchAzure(entriesOf('azure')));
  if (only.has('gcp')) {
    const key = process.env.GCP_BILLING_API_KEY;
    if (key) jobs.push(fetchGcp(entriesOf('gcp'), key));
    else skipped.add('gcp'); // no key: GCP is off, silently; previous GCP rows (if any) stay
  }
  await Promise.all(jobs);

  // a changed region invalidates the previous rows of that provider: never mix regions
  const prevRows = Object.fromEntries(Object.entries(previous?.rows ?? {}).filter(([, r]) => r.region === regions[r.provider]));
  const { rows, failures, unavailable } = finalizeRows(PRICE_MAP, prevRows, fresh, skipped);
  const file: PriceFile = { generatedAt: new Date().toISOString(), rows };
  writeFileSync(OUT, `${JSON.stringify(file, null, 2)}\n`);

  const ok = Object.values(rows).filter((r) => r.fetchedAt === fetchedAt).length;
  console.log(`\nwrote ${OUT}\n  ${Object.keys(rows).length}/${PRICE_MAP.length} rows, ${ok} fetched now`);
  for (const w of warnings) console.warn(`WARNING: ${w}`);
  for (const id of unavailable) console.warn(`WARNING: no price for ${id} (provider skipped, nothing previous)`);
  for (const f of failures) console.error(`FAILED ${f.id}: ${f.error}${f.kept ? ' (previous value kept)' : ' (no value)'}`);
  if (failures.length) { console.error(`\n${failures.length} id(s) failed`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
