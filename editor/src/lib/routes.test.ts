import { describe, expect, it } from 'vitest';
import { parseRoute, routePath } from './router';

describe('auth + share routes', () => {
  it('parses /login, /register and /s/:token', () => {
    expect(parseRoute('/login')).toEqual({ name: 'login' });
    expect(parseRoute('/register/')).toEqual({ name: 'register' });
    expect(parseRoute('/s/abc_DEF-123')).toEqual({ name: 'share', token: 'abc_DEF-123' });
    expect(parseRoute('/s/')).toEqual({ name: 'landing' });
  });
  it('routePath round-trips', () => {
    for (const p of ['/login', '/register', '/s/tok', '/projects', '/p/x', '/']) expect(routePath(parseRoute(p))).toBe(p);
  });
});
