/**
 * Pure parsing of the official pricing APIs into calculator prices (no network, no file access): used by
 * scripts/prices/update-prices.ts and unit-tested on small recorded snippets. Everything fails loudly: a query that matches no row,
 * or rows with different prices (ambiguous), is an error, never a guess.
 */
import { HOURS_PER_MONTH, type AwsQuery, type AzureQuery, type GcpQuery, type Match, type PriceMapEntry, type PriceUnit, type Provider } from './priceMap';

export interface PriceRow {
  provider: Provider;
  region: string;
  label: string;
  unit: PriceUnit;
  /** USD per calculator unit (instance-month, per million requests, per GB-month, per GB transferred) */
  usd: number;
  /** the provider's own rate and its unit, for audit */
  rate: number;
  rateUnit: string;
  sourceUrl: string;
  fetchedAt: string;
}
export interface PriceFile { generatedAt: string; rows: Record<string, PriceRow> }

// ---------------------------------------------------------------------------------------------------------------- CSV

/** Streaming CSV parser (RFC 4180 quoting, quoted newlines, CRLF): `push` string chunks of any size, then `end`. */
export function createCsvParser(onRow: (cells: string[]) => void) {
  let row: string[] = [];
  let field = '';
  let quoted = false; // inside "..."
  let quoteSeen = false; // a `"` inside quotes whose meaning (escape or close) depends on the next char
  let fieldStarted = false;
  const endField = () => { row.push(field); field = ''; fieldStarted = false; };
  const endRow = () => {
    if (fieldStarted || row.length > 0) { endField(); onRow(row); }
    row = [];
  };
  return {
    push(chunk: string) {
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i];
        if (quoteSeen) {
          quoteSeen = false;
          if (ch === '"') { field += '"'; continue; }
          quoted = false; // it was the closing quote; handle ch as unquoted
        }
        if (quoted) {
          if (ch === '"') quoteSeen = true;
          else field += ch;
        } else if (ch === '"') { quoted = true; fieldStarted = true; }
        else if (ch === ',') { fieldStarted = true; endField(); }
        else if (ch === '\n') endRow();
        else if (ch !== '\r') { field += ch; fieldStarted = true; }
      }
    },
    end() { quoteSeen = false; quoted = false; endRow(); },
  };
}

// ---------------------------------------------------------------------------------------------------------------- units

const UNITS: Record<PriceUnit, RegExp> = {
  'instance-month': /^(?:hrs?|1 hour|h)$/i,
  'per-million-requests': /^(?:requests?|writerequestunits|readrequestunits)$/i,
  'per-gb-month': /^(?:gb-mo|1 gb\/month|mo)$/i,
  'per-gb-transfer': /^(?:gb|1 gb)$/i,
};

/** converts a provider rate (price per `rateUnit`) to USD per calculator unit */
export function rateToUsd(rate: number, rateUnit: string, unit: PriceUnit): number {
  if (!Number.isFinite(rate) || !(rate > 0)) throw new Error(`rate must be > 0 (got ${rate})`);
  if (!UNITS[unit].test(rateUnit.trim())) throw new Error(`source unit "${rateUnit}" does not fit ${unit}`);
  const usd = unit === 'instance-month' ? rate * HOURS_PER_MONTH : unit === 'per-million-requests' ? rate * 1e6 : rate;
  return Math.round(usd * 1e6) / 1e6;
}

// ---------------------------------------------------------------------------------------------------------------- AWS

export type AwsResult = { ok: true; rate: number; rateUnit: string; sku: string } | { ok: false; error: string };
const matches = (m: Match, v: string) => (typeof m === 'string' ? v === m : m.test(v));

interface Candidate { sku: string; start: number; rate: number; unit: string }

/** Feed it the rows of one offer's region CSV; each query keeps only its matching OnDemand rows. */
export class AwsCollector {
  private cols: Map<string, number> | null = null;
  private cand: Candidate[][];
  private bad: Array<string | null>;
  constructor(private queries: Array<{ id: string; query: AwsQuery }>) {
    this.cand = queries.map(() => []);
    this.bad = queries.map(() => null);
  }
  onRow(cells: string[]) {
    if (!this.cols) {
      if (cells[0] !== 'SKU') return; // preamble (FormatVersion, Disclaimer ...)
      this.cols = new Map(cells.map((c, i) => [c, i]));
      this.queries.forEach((q, k) => {
        const missing = Object.keys(q.query.where).find((c) => !this.cols!.has(c));
        if (missing) this.bad[k] = `unknown column "${missing}" in the ${q.query.offer} price list`;
      });
      return;
    }
    const c = this.cols;
    if (cells[c.get('TermType')!] !== 'OnDemand') return;
    for (let k = 0; k < this.queries.length; k++) {
      if (this.bad[k]) continue;
      const where = this.queries[k].query.where;
      let ok = true;
      for (const col in where) if (!matches(where[col], cells[c.get(col)!] ?? '')) { ok = false; break; }
      if (!ok) continue;
      this.cand[k].push({ sku: cells[c.get('SKU')!], start: Number(cells[c.get('StartingRange')!]), rate: Number(cells[c.get('PricePerUnit')!]), unit: cells[c.get('Unit')!] });
    }
  }
  results(): Record<string, AwsResult> {
    const out: Record<string, AwsResult> = {};
    this.queries.forEach(({ id, query }, k) => {
      if (this.bad[k]) return void (out[id] = { ok: false, error: this.bad[k]! });
      if (!this.cols) return void (out[id] = { ok: false, error: 'no header row found in the price list' });
      const cs = this.cand[k];
      if (!cs.length) return void (out[id] = { ok: false, error: `no row matched in ${query.offer}` });
      // different SKUs are fine when they carry the same price (the lists repeat rows); different prices are ambiguous
      const key = (x: Candidate) => `${x.start}|${x.rate}|${x.unit}`;
      const bySku = new Map<string, Set<string>>();
      for (const x of cs) { if (!bySku.has(x.sku)) bySku.set(x.sku, new Set()); bySku.get(x.sku)!.add(key(x)); }
      const shapes = new Set([...bySku.values()].map((s) => [...s].sort().join(';')));
      if (shapes.size > 1) return void (out[id] = { ok: false, error: `ambiguous: ${bySku.size} SKUs with different prices matched in ${query.offer}` });
      const tiers = [...new Map(cs.map((x) => [x.start, x])).values()].sort((a, b) => a.start - b.start);
      const pick = query.tier === 'firstPaid' ? tiers.find((t) => t.rate > 0) : tiers[0];
      if (!pick || !(pick.rate > 0) || !Number.isFinite(pick.rate)) return void (out[id] = { ok: false, error: `price is not above 0 in ${query.offer}` });
      out[id] = { ok: true, rate: pick.rate, rateUnit: pick.unit, sku: pick.sku };
    });
    return out;
  }
}

// ---------------------------------------------------------------------------------------------------------------- Azure

const odata = (v: string) => `'${v.replace(/'/g, "''")}'`;
export function azureFilter(q: AzureQuery, region: string): string {
  const parts = [`armRegionName eq ${odata(region)}`, `priceType eq 'Consumption'`, `serviceName eq ${odata(q.serviceName)}`];
  if (q.armSkuName) parts.push(`armSkuName eq ${odata(q.armSkuName)}`);
  if (q.productName) parts.push(`productName eq ${odata(q.productName)}`);
  if (q.skuName) parts.push(`skuName eq ${odata(q.skuName)}`);
  if (q.meterName) parts.push(`meterName eq ${odata(q.meterName)}`);
  return parts.join(' and ');
}

export interface AzureItem {
  retailPrice: number; unitOfMeasure: string; tierMinimumUnits?: number; productName?: string; skuName?: string; meterName?: string; type?: string; skuId?: string;
}
export function pickAzure(items: AzureItem[], q: AzureQuery): { rate: number; rateUnit: string } {
  const rows = items.filter((i) => (i.tierMinimumUnits ?? 0) === 0 && (!i.type || i.type === 'Consumption')
    && (!q.linuxOnly || (!/windows/i.test(i.productName ?? '') && !/spot|low priority/i.test(`${i.skuName ?? ''} ${i.meterName ?? ''}`))));
  if (!rows.length) throw new Error(`no row matched in Azure Retail Prices (${q.serviceName} ${q.armSkuName ?? q.meterName ?? ''})`.trim());
  const prices = new Set(rows.map((r) => `${r.retailPrice}|${r.unitOfMeasure}`));
  if (prices.size > 1) throw new Error(`ambiguous: ${prices.size} different prices matched in Azure Retail Prices`);
  return { rate: rows[0].retailPrice, rateUnit: rows[0].unitOfMeasure };
}

// ---------------------------------------------------------------------------------------------------------------- GCP

export interface GcpSku {
  description: string;
  serviceRegions?: string[];
  category?: { resourceFamily?: string; resourceGroup?: string; usageType?: string };
  pricingInfo?: Array<{ pricingExpression?: { usageUnit?: string; tieredRates?: Array<{ startUsageAmount?: number; unitPrice?: { units?: string; nanos?: number } }> } }>;
}
/** vCPU + RAM style: each part is one SKU's first-tier price times `qty`; the usage units (`h` / `GiBy.h`, `GiBy.mo`) must agree */
export function pickGcp(skus: GcpSku[], q: GcpQuery, region: string): { rate: number; rateUnit: string } {
  let total = 0;
  let unit: string | null = null;
  for (const part of q.parts) {
    const found = skus.filter((s) => s.category?.resourceGroup === part.resourceGroup && (!s.category.usageType || s.category.usageType === 'OnDemand')
      && (s.serviceRegions ?? []).includes(region) && matches(part.description, s.description));
    if (!found.length) throw new Error(`no row matched in GCP catalog (${String(part.description)} in ${region})`);
    const prices = found.map((s) => {
      const pe = s.pricingInfo?.[0]?.pricingExpression;
      const tier = [...(pe?.tieredRates ?? [])].sort((a, b) => (a.startUsageAmount ?? 0) - (b.startUsageAmount ?? 0))[0];
      if (!pe || !tier?.unitPrice) throw new Error(`GCP SKU "${s.description}" has no price`);
      return { price: Number(tier.unitPrice.units ?? 0) + (tier.unitPrice.nanos ?? 0) / 1e9, unit: (pe.usageUnit ?? '').replace(/^GiBy\./, '') };
    });
    if (new Set(prices.map((p) => `${p.price}|${p.unit}`)).size > 1) throw new Error(`ambiguous: ${found.length} GCP SKUs with different prices matched (${String(part.description)})`);
    if (unit && unit !== prices[0].unit) throw new Error(`GCP parts use different units (${unit} / ${prices[0].unit})`);
    unit = prices[0].unit;
    total += prices[0].price * part.qty;
  }
  return { rate: total, rateUnit: unit! };
}

// ---------------------------------------------------------------------------------------------------------------- merge

export interface Failure { id: string; error: string; kept: boolean }
/**
 * Merges freshly fetched rows with the previous file. A failed id keeps its previous row (and that row's own fetchedAt) and is
 * reported; an id with no value at all is left out and reported. `skipped` providers were not attempted: their previous rows stay,
 * silently (they are listed in `unavailable` when there is nothing to keep).
 */
export function finalizeRows(entries: PriceMapEntry[], previous: Record<string, PriceRow>, fresh: Record<string, PriceRow | { error: string }>, skipped: Set<Provider> = new Set()) {
  const rows: Record<string, PriceRow> = {};
  const failures: Failure[] = [];
  const unavailable: string[] = [];
  for (const e of entries) {
    const prev = previous[e.id];
    if (skipped.has(e.provider)) {
      if (prev) rows[e.id] = prev; else unavailable.push(e.id);
      continue;
    }
    const f = fresh[e.id];
    let error: string | null = null;
    if (!f) error = 'not fetched';
    else if ('error' in f) error = f.error;
    else if (!Number.isFinite(f.usd) || !(f.usd > 0)) error = `price is not above 0 (${f.usd})`;
    if (!error) { rows[e.id] = f as PriceRow; continue; }
    if (prev) rows[e.id] = prev;
    failures.push({ id: e.id, error, kept: Boolean(prev) });
  }
  return { rows, failures, unavailable };
}
