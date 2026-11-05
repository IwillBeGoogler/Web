import { describe, expect, it } from 'vitest';
import { navigate, parseRoute, routePath } from './router';

describe('router mapping', () => {
  it('/ -> landing, /projects -> projects, /p/:id -> editor', () => {
    expect(parseRoute('/')).toEqual({ name: 'landing' });
    expect(parseRoute('')).toEqual({ name: 'landing' });
    expect(parseRoute('/projects')).toEqual({ name: 'projects' });
    expect(parseRoute('/projects/')).toEqual({ name: 'projects' });
    expect(parseRoute('/p/abc-123')).toEqual({ name: 'project', id: 'abc-123' });
    expect(parseRoute('/p/a%20b')).toEqual({ name: 'project', id: 'a b' });
  });
  it('unknown paths and malformed ids fall back to the landing page', () => {
    expect(parseRoute('/nope')).toEqual({ name: 'landing' });
    expect(parseRoute('/p/')).toEqual({ name: 'landing' });
    expect(parseRoute('/p/a/b')).toEqual({ name: 'landing' });
    expect(parseRoute('/p/a/f/')).toEqual({ name: 'landing' });
    expect(parseRoute('/p/a/f/b/c')).toEqual({ name: 'landing' });
    expect(parseRoute('/p/%E0%A4%A')).toEqual({ name: 'landing' });
  });
  it('parses the file route /p/:projectId/f/:fileId', () => {
    expect(parseRoute('/p/prj_1/f/fil_2')).toEqual({ name: 'file', projectId: 'prj_1', fileId: 'fil_2' });
    expect(parseRoute('/p/a%20b/f/c%2Fd/')).toEqual({ name: 'file', projectId: 'a b', fileId: 'c/d' });
    expect(parseRoute('/p/%E0%A4%A/f/x')).toEqual({ name: 'landing' });
    expect(parseRoute('/p/x/f/%E0%A4%A')).toEqual({ name: 'landing' });
  });
  it('routePath is the inverse', () => {
    for (const p of ['/', '/projects', '/p/x1', '/p/x1/f/y2']) expect(routePath(parseRoute(p))).toBe(p);
    expect(routePath({ name: 'file', projectId: 'a b', fileId: 'c/d' })).toBe('/p/a%20b/f/c%2Fd');
    expect(routePath({ name: 'project', id: 'a b' })).toBe('/p/a%20b');
  });
  it('navigate pushes history and notifies listeners', () => {
    window.history.replaceState({}, '', '/');
    let hits = 0;
    const on = () => hits++;
    window.addEventListener('sdd:navigate', on);
    navigate('/projects');
    expect(window.location.pathname).toBe('/projects');
    navigate('/projects'); // no-op
    navigate('/p/z', { replace: true });
    expect(window.location.pathname).toBe('/p/z');
    expect(hits).toBe(2);
    window.removeEventListener('sdd:navigate', on);
  });
});
