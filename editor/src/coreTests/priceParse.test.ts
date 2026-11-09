import { describe, expect, it } from 'vitest';
import { AwsCollector, azureFilter, createCsvParser, finalizeRows, pickAzure, pickGcp, rateToUsd, type GcpSku, type PriceRow } from '@core/capacity/priceParse';
import type { PriceMapEntry } from '@core/capacity/priceMap';

const csv = (chunks: string[]) => {
  const rows: string[][] = [];
  const p = createCsvParser((r) => rows.push(r));
  chunks.forEach((c) => p.push(c));
  p.end();
  return rows;
};

describe('createCsvParser', () => {
  it('parses plain rows, CRLF and chunk splits', () => {
    expect(csv(['a,b\r\nc,', 'd\n'])).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('handles quotes, escaped quotes and quoted newlines', () => {
    expect(csv(['"a,1","say ""hi""","x\ny"\n'])).toEqual([['a,1', 'say "hi"', 'x\ny']]);
  });
  it('closing quote split across chunks; trailing row without newline; empty trailing field', () => {
    expect(csv(['"a"', '"b",', 'c'])).toEqual([['a"b', 'c']]);
    expect(csv(['a,'])).toEqual([['a', '']]);
    expect(csv(['\n\n'])).toEqual([]);
  });
});

describe('rateToUsd', () => {
  it('converts per unit', () => {
    expect(rateToUsd(0.1, 'Hrs', 'instance-month')).toBe(73);
    expect(rateToUsd(0.2, 'Requests', 'per-million-requests')).toBe(200000);
    expect(rateToUsd(0.023, 'GB-Mo', 'per-gb-month')).toBe(0.023);
    expect(rateToUsd(0.09, ' GB ', 'per-gb-transfer')).toBe(0.09);
  });
  it('rejects bad rates and units', () => {
    expect(() => rateToUsd(0, 'Hrs', 'instance-month')).toThrow(/> 0/);
    expect(() => rateToUsd(NaN, 'Hrs', 'instance-month')).toThrow(/> 0/);
    expect(() => rateToUsd(1, 'GB', 'instance-month')).toThrow(/does not fit/);
  });
});

const HEAD = ['SKU', 'TermType', 'StartingRange', 'PricePerUnit', 'Unit', 'Instance'];
const row = (sku: string, inst: string, rate: number, start = 0, term = 'OnDemand', unit = 'Hrs') => [sku, term, String(start), String(rate), unit, inst];
const run = (rows: string[][], queries: ConstructorParameters<typeof AwsCollector>[0]) => {
  const c = new AwsCollector(queries);
  rows.forEach((r) => c.onRow(r));
  return c.results();
};
const q = (id: string, where: Record<string, string | RegExp>, tier?: 'first' | 'firstPaid') => ({ id, query: { offer: 'AmazonEC2', where, tier } });

describe('AwsCollector', () => {
  it('reports no header', () => {
    expect(run([['Disclaimer']], [q('a', { Instance: 'x' })]).a).toEqual({ ok: false, error: 'no header row found in the price list' });
  });
  it('reports unknown column', () => {
    const r = run([HEAD, row('1', 'x', 1)], [q('a', { Nope: 'x' })]);
    expect(r.a).toEqual({ ok: false, error: 'unknown column "Nope" in the AmazonEC2 price list' });
  });
  it('picks a match, skips non-OnDemand and non-matching, regex match', () => {
    const r = run([['preamble'], HEAD, row('1', 'm5', 0.1, 0, 'Reserved'), row('2', 'c5', 0.3), row('3', 'm5', 0.2)], [q('a', { Instance: /^m/ }), q('b', { Instance: 'zzz' })]);
    expect(r.a).toEqual({ ok: true, rate: 0.2, rateUnit: 'Hrs', sku: '3' });
    expect(r.b).toEqual({ ok: false, error: 'no row matched in AmazonEC2' });
  });
  it('same price on different SKUs is fine, different prices are ambiguous', () => {
    expect(run([HEAD, row('1', 'm', 0.2), row('2', 'm', 0.2)], [q('a', { Instance: 'm' })]).a.ok).toBe(true);
    const r = run([HEAD, row('1', 'm', 0.2), row('2', 'm', 0.5)], [q('a', { Instance: 'm' })]);
    expect(r.a).toMatchObject({ ok: false });
    expect((r.a as { error: string }).error).toMatch(/ambiguous: 2 SKUs/);
  });
  it('tiers: first vs firstPaid, and zero price failure', () => {
    const rows = [HEAD, row('1', 'm', 0, 0), row('1', 'm', 0.4, 100)];
    const r = run(rows, [q('a', { Instance: 'm' }), q('b', { Instance: 'm' }, 'firstPaid')]);
    expect(r.a).toMatchObject({ ok: false, error: 'price is not above 0 in AmazonEC2' });
    expect(r.b).toMatchObject({ ok: true, rate: 0.4 });
    const z = run([HEAD, row('1', 'm', 0)], [q('c', { Instance: 'm' }, 'firstPaid')]);
    expect(z.c).toMatchObject({ ok: false });
  });
  it('missing cell value tolerated (where column beyond row length)', () => {
    const r = run([HEAD, ['1', 'OnDemand', '0', '1', 'Hrs']], [q('a', { Instance: '' })]);
    expect(r.a.ok).toBe(true);
  });
});

describe('azure', () => {
  it('builds filter with quoting', () => {
    expect(azureFilter({ serviceName: "O'x" }, 'eastus')).toBe("armRegionName eq 'eastus' and priceType eq 'Consumption' and serviceName eq 'O''x'");
    expect(azureFilter({ serviceName: 's', armSkuName: 'a', productName: 'p', skuName: 'k', meterName: 'm' }, 'r')).toContain("meterName eq 'm'");
  });
  it('picks rows', () => {
    expect(pickAzure([{ retailPrice: 1, unitOfMeasure: '1 Hour' }, { retailPrice: 2, unitOfMeasure: '1 Hour', tierMinimumUnits: 5 }], { serviceName: 's' })).toEqual({ rate: 1, rateUnit: '1 Hour' });
  });
  it('linuxOnly drops windows/spot; none left throws', () => {
    const items = [
      { retailPrice: 5, unitOfMeasure: 'h', productName: 'VM Windows' },
      { retailPrice: 6, unitOfMeasure: 'h', skuName: 'D2 Spot' },
      { retailPrice: 7, unitOfMeasure: 'h', type: 'Reservation' },
    ];
    expect(() => pickAzure(items, { serviceName: 's', armSkuName: 'D2', linuxOnly: true })).toThrow(/no row matched in Azure Retail Prices \(s D2\)/);
    expect(() => pickAzure([], { serviceName: 's', meterName: 'mm' })).toThrow(/s mm/);
    expect(() => pickAzure([], { serviceName: 's' })).toThrow(/\(s \)/);
  });
  it('ambiguous prices throw', () => {
    expect(() => pickAzure([{ retailPrice: 1, unitOfMeasure: 'h' }, { retailPrice: 2, unitOfMeasure: 'h' }], { serviceName: 's' })).toThrow(/ambiguous/);
  });
});

const sku = (description: string, group: string, units: string, nanos: number, unit = 'h', extra: Partial<GcpSku> = {}): GcpSku => ({
  description, serviceRegions: ['r1'], category: { resourceGroup: group, usageType: 'OnDemand' },
  pricingInfo: [{ pricingExpression: { usageUnit: unit, tieredRates: [{ startUsageAmount: 10, unitPrice: { units: '9', nanos: 0 } }, { startUsageAmount: 0, unitPrice: { units, nanos } }] } }], ...extra,
});

describe('pickGcp', () => {
  const query = { serviceId: 's', parts: [{ description: /Core/, resourceGroup: 'CPU', qty: 2 }, { description: 'Ram', resourceGroup: 'RAM', qty: 4 }] };
  it('sums parts', () => {
    const r = pickGcp([sku('Core x', 'CPU', '0', 1e7), sku('Ram', 'RAM', '0', 5e6, 'GiBy.h')], query, 'r1');
    expect(r.rateUnit).toBe('h');
    expect(r.rate).toBeCloseTo(0.04);
  });
  it('no match / region / usageType', () => {
    expect(() => pickGcp([], query, 'r1')).toThrow(/no row matched in GCP/);
    expect(() => pickGcp([sku('Core', 'CPU', '0', 1, 'h', { serviceRegions: undefined })], query, 'r1')).toThrow(/no row/);
  });
  it('sku with no price throws', () => {
    expect(() => pickGcp([sku('Core', 'CPU', '0', 1, 'h', { pricingInfo: [] })], query, 'r1')).toThrow(/has no price/);
    expect(() => pickGcp([sku('Core', 'CPU', '0', 1, 'h', { pricingInfo: [{ pricingExpression: { tieredRates: [{}] } }] })], query, 'r1')).toThrow(/has no price/);
  });
  it('ambiguous and unit mismatch', () => {
    const one = { serviceId: 's', parts: [{ description: 'Core', resourceGroup: 'CPU', qty: 1 }] };
    expect(() => pickGcp([sku('Core', 'CPU', '1', 0), sku('Core', 'CPU', '2', 0)], one, 'r1')).toThrow(/ambiguous/);
    expect(() => pickGcp([sku('Core x', 'CPU', '1', 0, 'h'), sku('Ram', 'RAM', '1', 0, 'GiBy.mo')], query, 'r1')).toThrow(/different units/);
  });
  it('defaults: missing units/nanos/usageUnit, no usageType', () => {
    const s: GcpSku = { description: 'Core', serviceRegions: ['r1'], category: { resourceGroup: 'CPU' }, pricingInfo: [{ pricingExpression: { tieredRates: [{ unitPrice: { nanos: 5e8 } }] } }] };
    expect(pickGcp([s], { serviceId: 's', parts: [{ description: 'Core', resourceGroup: 'CPU', qty: 2 }] }, 'r1')).toEqual({ rate: 1, rateUnit: '' });
    const t: GcpSku = { ...s, pricingInfo: [{ pricingExpression: { tieredRates: [{ unitPrice: { units: '3' } }] } }] };
    expect(pickGcp([t], { serviceId: 's', parts: [{ description: 'Core', resourceGroup: 'CPU', qty: 1 }] }, 'r1').rate).toBe(3);
  });
});

describe('finalizeRows', () => {
  const entry = (id: string, provider: 'aws' | 'gcp' | 'azure' = 'aws'): PriceMapEntry => ({ id, provider, label: id, unit: 'instance-month' });
  const pr = (usd: number, fetchedAt = 'now'): PriceRow => ({ provider: 'aws', region: 'r', label: 'l', unit: 'instance-month', usd, rate: usd, rateUnit: 'h', sourceUrl: 'u', fetchedAt });
  it('merges fresh, keeps previous on failure, reports', () => {
    const prev = { b: pr(1, 'old'), c: pr(2, 'old'), g: pr(9, 'old') };
    const res = finalizeRows(
      [entry('a'), entry('b'), entry('c'), entry('d'), entry('e'), entry('f'), entry('g', 'gcp'), entry('h', 'gcp')],
      prev,
      { a: pr(5), b: { error: 'boom' }, c: pr(0), e: pr(NaN) },
      new Set(['gcp']),
    );
    expect(res.rows.a.usd).toBe(5);
    expect(res.rows.b.fetchedAt).toBe('old');
    expect(res.rows.c.fetchedAt).toBe('old');
    expect(res.rows.g.usd).toBe(9);
    expect(res.unavailable).toEqual(['h']);
    expect(res.failures).toEqual([
      { id: 'b', error: 'boom', kept: true },
      { id: 'c', error: 'price is not above 0 (0)', kept: true },
      { id: 'd', error: 'not fetched', kept: false },
      { id: 'e', error: 'price is not above 0 (NaN)', kept: false },
      { id: 'f', error: 'not fetched', kept: false },
    ]);
  });
});
