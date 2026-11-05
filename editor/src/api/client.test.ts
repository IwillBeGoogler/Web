import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, isRetryable } from './client';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function make(responses: (Response | Error | ((init: RequestInit) => Response | Error))[], over: Partial<ConstructorParameters<typeof ApiClient>[0]> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const r = responses[Math.min(i++, responses.length - 1)];
    const res = typeof r === 'function' ? r(init) : r;
    if (res instanceof Error) throw res;
    return res;
  });
  const sleep = vi.fn(async () => undefined);
  const client = new ApiClient({ fetch, sleep, baseUrl: '/api', backoffMs: 1, uuid: () => 'req-1', readCookie: () => undefined, ...over });
  return { client, calls, fetch, sleep };
}
const hdr = (init: RequestInit, name: string) => new Headers(init.headers).get(name);

describe('ApiClient keepalive', () => {
  it('sets fetch keepalive only when asked and the body fits the quota', async () => {
    const { client, calls } = make([() => json(200, {})]);
    await client.put('/a', { x: 1 }, { keepalive: true });
    await client.put('/a', { x: 1 });
    await client.put('/a', { x: 'y'.repeat(70_000) }, { keepalive: true });
    expect(calls.map((c) => c.init.keepalive)).toEqual([true, undefined, undefined]);
  });
});

describe('ApiClient requests', () => {
  it('prefixes the base url, sends credentials and a request id', async () => {
    const { client, calls } = make([json(200, { ok: 1 })]);
    const r = await client.get<{ ok: number }>('/auth/config');
    expect(r.data).toEqual({ ok: 1 });
    expect(calls[0].url).toBe('/api/auth/config');
    expect(calls[0].init.credentials).toBe('include');
    expect(hdr(calls[0].init, 'x-request-id')).toBe('req-1');
  });
  it('encodes query params and skips undefined', async () => {
    const { client, calls } = make([() => json(200, {})]);
    await client.get('/projects', { query: { q: 'a b', page: 2, x: undefined } });
    expect(calls[0].url).toBe('/api/projects?q=a+b&page=2');
  });
  it('sends json bodies with content-type', async () => {
    const { client, calls } = make([json(201, { a: 1 })]);
    await client.post('/projects', { name: 'x' });
    expect(calls[0].init.body).toBe('{"name":"x"}');
    expect(hdr(calls[0].init, 'content-type')).toBe('application/json');
  });
  it('204 resolves with undefined data', async () => {
    const { client } = make([new Response(null, { status: 204 })]);
    expect((await client.delete('/projects/x')).data).toBeUndefined();
  });
  it('exposes the ETag as a numeric version', async () => {
    const { client } = make([json(200, {}, { etag: '"7"' })]);
    expect((await client.get('/projects/x')).etag).toBe(7);
  });
  it('If-Match and X-Client-Id are forwarded', async () => {
    const { client, calls } = make([json(200, {})], { clientId: () => 'cid-9' });
    await client.put('/projects/x', { name: 'n' }, { ifMatch: 4 });
    expect(hdr(calls[0].init, 'if-match')).toBe('"4"');
    expect(hdr(calls[0].init, 'x-client-id')).toBe('cid-9');
  });
});

describe('CSRF', () => {
  it('adds X-CSRF-Token on unsafe methods only', async () => {
    const { client, calls } = make([json(200, {}), json(200, {})]);
    client.csrfToken = 'tok';
    await client.get('/projects');
    await client.post('/projects', {});
    expect(hdr(calls[0].init, 'x-csrf-token')).toBeNull();
    expect(hdr(calls[1].init, 'x-csrf-token')).toBe('tok');
  });
  it('falls back to the sdd_csrf cookie', async () => {
    const { client, calls } = make([json(200, {})], { readCookie: (n) => (n === 'sdd_csrf' ? 'from-cookie' : undefined) });
    await client.put('/projects/x', {});
    expect(hdr(calls[0].init, 'x-csrf-token')).toBe('from-cookie');
  });
  it('CSRF_INVALID: refreshes via /auth/me and retries once', async () => {
    const { client, calls } = make([
      json(403, { error: { code: 'CSRF_INVALID', message: 'bad' } }),
      json(200, { user: { id: 'u' }, csrfToken: 'fresh' }),
      json(200, { done: true }),
    ]);
    client.csrfToken = 'stale';
    const r = await client.post('/projects', {});
    expect(r.data).toEqual({ done: true });
    expect(calls.map((c) => c.url)).toEqual(['/api/projects', '/api/auth/me', '/api/projects']);
    expect(hdr(calls[2].init, 'x-csrf-token')).toBe('fresh');
  });
  it('CSRF_INVALID twice is surfaced, not looped', async () => {
    const bad = () => json(403, { error: { code: 'CSRF_INVALID', message: 'bad' } });
    const { client, calls } = make([bad(), json(200, { csrfToken: 'x' }), bad()]);
    await expect(client.post('/projects', {})).rejects.toMatchObject({ code: 'CSRF_INVALID', status: 403 });
    expect(calls).toHaveLength(3);
  });
});

describe('error mapping', () => {
  it('maps {error:{code,message,details,requestId}} to ApiError', async () => {
    const { client } = make([json(412, { error: { code: 'VERSION_CONFLICT', message: 'stale', details: { currentVersion: 5 }, requestId: 'r-9' } }, { etag: '"5"' })]);
    const e = await client.put('/projects/x', {}, { ifMatch: 1 }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 412, code: 'VERSION_CONFLICT', message: 'stale', details: { currentVersion: 5 }, requestId: 'r-9' });
    expect(e.isConflict).toBe(true);
  });
  it('non-json error bodies still produce an ApiError', async () => {
    const { client } = make([new Response('<html>bad gateway</html>', { status: 500, headers: { 'content-type': 'text/html' } })], { retries: 0 });
    await expect(client.get('/x')).rejects.toMatchObject({ status: 500, code: 'HTTP_500' });
  });
  it('401 calls onUnauthorized, 429 carries retryAfter', async () => {
    const onUnauthorized = vi.fn();
    const { client } = make([json(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } }), json(429, { error: { code: 'RATE_LIMITED', message: 'slow' } }, { 'retry-after': '12' })], { onUnauthorized });
    await expect(client.get('/projects')).rejects.toMatchObject({ status: 401, isUnauthorized: true });
    expect(onUnauthorized).toHaveBeenCalledOnce();
    await expect(client.get('/projects')).rejects.toMatchObject({ status: 429, retryAfter: 12 });
  });
  it('401 on /auth/* does not trigger onUnauthorized', async () => {
    const onUnauthorized = vi.fn();
    const { client } = make([json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'no' } })], { onUnauthorized });
    await expect(client.post('/auth/login', {})).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe('retry policy', () => {
  it('retries network errors with backoff, then succeeds', async () => {
    const { client, fetch, sleep } = make([new TypeError('Failed to fetch'), new TypeError('Failed to fetch'), json(200, { ok: true })], { retries: 2 });
    expect((await client.get('/projects')).data).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
  it('gives up after N retries with a NETWORK ApiError (status 0)', async () => {
    const { client, fetch } = make([new TypeError('Failed to fetch')], { retries: 2 });
    const e = await client.get('/projects').catch((x) => x);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(e).toMatchObject({ status: 0, code: 'NETWORK' });
    expect(e.isNetwork).toBe(true);
  });
  it('never retries 4xx', async () => {
    const { client, fetch } = make([json(404, { error: { code: 'NOT_FOUND', message: 'x' } })], { retries: 3 });
    await expect(client.get('/projects/x')).rejects.toMatchObject({ status: 404 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('retries 503 for idempotent requests, but a POST is not repeated', async () => {
    const a = make([json(503, { error: { code: 'NOT_READY', message: 'x' } }), json(200, {})], { retries: 2 });
    await a.client.get('/projects');
    expect(a.fetch).toHaveBeenCalledTimes(2);
    const b = make([new TypeError('Failed to fetch'), json(201, {})], { retries: 2 });
    await expect(b.client.post('/projects', {})).rejects.toMatchObject({ code: 'NETWORK' });
    expect(b.fetch).toHaveBeenCalledTimes(1);
  });
  it('isRetryable table', () => {
    const net = new ApiError(0, 'NETWORK', 'x');
    expect(isRetryable('GET', net)).toBe(true);
    expect(isRetryable('PUT', net)).toBe(true);
    expect(isRetryable('POST', net)).toBe(false);
    expect(isRetryable('POST', net, true)).toBe(true);
    expect(isRetryable('GET', new ApiError(400, 'X', 'x'))).toBe(false);
    expect(isRetryable('GET', new ApiError(412, 'X', 'x'))).toBe(false);
    expect(isRetryable('GET', new ApiError(502, 'X', 'x'))).toBe(true);
    expect(isRetryable('GET', new ApiError(500, 'INTERNAL', 'x'))).toBe(false);
  });
  it('a timeout aborts the request and reports TIMEOUT', async () => {
    const fetch = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))));
    const client = new ApiClient({ fetch, timeoutMs: 10, retries: 0, sleep: async () => undefined });
    await expect(client.get('/slow')).rejects.toMatchObject({ code: 'TIMEOUT', status: 0 });
  });
});
