import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { bootstrapSession, guardRedirect, useSession, initials, type SessionApi } from './session';
import { parseRoute } from '../lib/router';

const user = { id: 'u1', email: 'ada@x.test', name: 'Ada Lovelace', isAdmin: false };
const fakeApi = (over: Partial<SessionApi> = {}): SessionApi => ({
  authConfig: vi.fn(async () => ({ authMode: 'session' as const, allowSignup: true })),
  me: vi.fn(async () => user),
  login: vi.fn(async () => user),
  register: vi.fn(async () => user),
  logout: vi.fn(async () => undefined),
  ...over,
});
beforeEach(() => useSession.getState().reset());

describe('server availability detection', () => {
  it('reachable + logged in -> server mode with the user', async () => {
    await bootstrapSession(fakeApi());
    expect(useSession.getState()).toMatchObject({ mode: 'server', authMode: 'session', allowSignup: true, user });
  });
  it('reachable, 401 on /auth/me -> server mode, no user', async () => {
    await bootstrapSession(fakeApi({ me: vi.fn(async () => { throw new ApiError(401, 'UNAUTHENTICATED', 'no'); }) }));
    expect(useSession.getState()).toMatchObject({ mode: 'server', user: null });
  });
  it('network failure -> local mode (offline / local)', async () => {
    await bootstrapSession(fakeApi({ authConfig: vi.fn(async () => { throw new ApiError(0, 'NETWORK', 'down'); }) }));
    expect(useSession.getState()).toMatchObject({ mode: 'local', user: null });
  });
  it('a 502 from a dev proxy with no backend -> local mode', async () => {
    await bootstrapSession(fakeApi({ authConfig: vi.fn(async () => { throw new ApiError(502, 'HTTP_502', 'bad gateway'); }) }));
    expect(useSession.getState().mode).toBe('local');
  });
  it('an HTML answer (SPA fallback, no backend) is not a server', async () => {
    await bootstrapSession(fakeApi({ authConfig: vi.fn(async () => '<!doctype html>' as never) }));
    expect(useSession.getState().mode).toBe('local');
  });
  it('AUTH_MODE=none -> server mode, user from /auth/me, no login needed', async () => {
    await bootstrapSession(fakeApi({ authConfig: vi.fn(async () => ({ authMode: 'none' as const, allowSignup: false })) }));
    expect(useSession.getState()).toMatchObject({ mode: 'server', authMode: 'none', user });
  });
  it('login / register / logout update the user', async () => {
    const api = fakeApi();
    await bootstrapSession(fakeApi({ me: vi.fn(async () => { throw new ApiError(401, 'U', 'x'); }) }));
    await useSession.getState().login(api, 'a@b.test', 'pw');
    expect(useSession.getState().user).toEqual(user);
    await useSession.getState().logout(api);
    expect(useSession.getState().user).toBeNull();
    await useSession.getState().register(api, 'a@b.test', 'pw', 'Ada');
    expect(api.register).toHaveBeenCalledWith('a@b.test', 'pw', 'Ada');
  });
});

describe('route guard', () => {
  const s = (p: Partial<ReturnType<typeof useSession.getState>>) => ({ mode: 'server' as const, authMode: 'session' as const, user: null, ...p });
  it('server + session + anonymous: /projects and /p/:id go to /login?next=', () => {
    expect(guardRedirect(parseRoute('/projects'), '/projects', s({}))).toBe('/login?next=%2Fprojects');
    expect(guardRedirect(parseRoute('/p/abc'), '/p/abc', s({}))).toBe('/login?next=%2Fp%2Fabc');
    expect(guardRedirect(parseRoute('/p/abc/f/def'), '/p/abc/f/def', s({}))).toBe('/login?next=%2Fp%2Fabc%2Ff%2Fdef');
    expect(guardRedirect(parseRoute('/p/abc/f/def'), '/p/abc/f/def', s({ user }))).toBeNull();
  });
  it('logged in, local mode, checking, auth none: no redirect', () => {
    expect(guardRedirect(parseRoute('/projects'), '/projects', s({ user }))).toBeNull();
    expect(guardRedirect(parseRoute('/projects'), '/projects', s({ mode: 'local' }))).toBeNull();
    expect(guardRedirect(parseRoute('/projects'), '/projects', s({ mode: 'checking' }))).toBeNull();
    expect(guardRedirect(parseRoute('/projects'), '/projects', s({ authMode: 'none' }))).toBeNull();
  });
  it('landing, share links and the auth pages are public', () => {
    expect(guardRedirect(parseRoute('/'), '/', s({}))).toBeNull();
    expect(guardRedirect(parseRoute('/s/tok'), '/s/tok', s({}))).toBeNull();
    expect(guardRedirect(parseRoute('/login'), '/login', s({}))).toBeNull();
  });
  it('already signed in: /login and /register go to next or /projects', () => {
    expect(guardRedirect(parseRoute('/login'), '/login', s({ user }))).toBe('/projects');
    expect(guardRedirect(parseRoute('/login'), '/login?next=%2Fp%2Fabc', s({ user }))).toBe('/p/abc');
    expect(guardRedirect(parseRoute('/register'), '/register', s({ user }))).toBe('/projects');
  });
  it('AUTH_MODE=none: /login has no purpose', () => {
    expect(guardRedirect(parseRoute('/login'), '/login', s({ authMode: 'none', user }))).toBe('/projects');
  });
  it('next is only followed for same-origin paths', () => {
    expect(guardRedirect(parseRoute('/login'), '/login?next=https%3A%2F%2Fevil.test', s({ user }))).toBe('/projects');
    expect(guardRedirect(parseRoute('/login'), '/login?next=%2F%2Fevil.test', s({ user }))).toBe('/projects');
  });
});

it('initials', () => {
  expect(initials('Ada Lovelace')).toBe('AL');
  expect(initials('ada')).toBe('A');
  expect(initials('', 'zed@x.test')).toBe('Z');
});
