/**
 * Price table for the capacity calculator's cost ESTIMATE. The numbers are GENERATED, never typed: `npm run prices:update`
 * (scripts/prices/update-prices.ts) reads the providers' official pricing APIs (AWS Price List bulk files, Azure Retail Prices API,
 * GCP Cloud Billing Catalog API) for the ids listed in `priceMap.ts` and writes `prices.generated.json`. Public on-demand Linux list
 * prices in one region per provider, no discounts, committed use, free tier or taxes: treat the result as an order of magnitude and
 * check the provider's calculator before budgeting.
 */
import generated from './prices.generated.json';
import { DEFAULT_REGION, DEFAULT_SKU_BY_ICON, HOURS_PER_MONTH, SECONDS_PER_MONTH, type PriceUnit, type Provider } from './priceMap';
import type { PriceFile, PriceRow } from './priceParse';

export { DEFAULT_SKU_BY_ICON, HOURS_PER_MONTH, SECONDS_PER_MONTH };
export type { PriceUnit };
export type PriceEntry = PriceRow;

const file = generated as unknown as PriceFile;

/** price id -> row (provider, region, label, unit, usd per unit, source URL, fetch time) */
export const PRICES: Record<string, PriceEntry> = file.rows;
/** day (UTC) the table was generated */
export const PRICE_TABLE_DATE = file.generatedAt.slice(0, 10);

export interface PriceSource { provider: Provider; name: string; region: string; /** day of the newest row of this provider */ asOf: string }
export const PROVIDER_NAMES: Record<Provider, string> = { aws: 'AWS', gcp: 'GCP', azure: 'Azure' };

/** one line of provenance per provider that has rows; a provider whose refresh was skipped keeps its own older date */
export function priceSources(providers?: Iterable<Provider>): PriceSource[] {
  const want = providers ? new Set(providers) : null;
  const out: PriceSource[] = [];
  for (const p of ['aws', 'gcp', 'azure'] as Provider[]) {
    if (want && !want.has(p)) continue;
    const rows = Object.values(PRICES).filter((r) => r.provider === p);
    if (!rows.length) continue;
    out.push({ provider: p, name: PROVIDER_NAMES[p], region: rows[0].region || DEFAULT_REGION[p], asOf: rows.map((r) => r.fetchedAt).sort().at(-1)!.slice(0, 10) });
  }
  return out;
}

/** "AWS list, on-demand, us-east-1, as of 2026-10-27" */
export const describePriceSource = (s: PriceSource) => `${s.name} list, on-demand, ${s.region}, as of ${s.asOf}`;
