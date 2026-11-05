import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installFromUrl, usePlugins } from './store';
import { SAMPLE_PLUGINS } from './samples';

beforeEach(() => { localStorage.clear(); usePlugins.getState().reset(); });

describe('plugin store', () => {
  it('starts empty; samples can be installed from the list and are enabled', () => {
    expect(usePlugins.getState().plugins).toEqual([]);
    const r = usePlugins.getState().install(SAMPLE_PLUGINS[0]);
    expect(r.ok).toBe(true);
    expect(usePlugins.getState().plugins[0]).toMatchObject({ name: 'Rename selection', enabled: true });
    expect(usePlugins.getState().plugins[0].id).toBeTruthy();
  });
  it('persists to localStorage and reloads', () => {
    usePlugins.getState().install(SAMPLE_PLUGINS[1]);
    usePlugins.getState().reset(false);
    usePlugins.getState().hydrate();
    expect(usePlugins.getState().plugins.map((p) => p.name)).toEqual(['Generate grid of icons']);
  });
  it('rejects an invalid manifest and a duplicate id', () => {
    expect(usePlugins.getState().install({ name: '', permissions: [], code: 'x' }).ok).toBe(false);
    usePlugins.getState().install({ ...SAMPLE_PLUGINS[0], id: 'same' });
    expect(usePlugins.getState().install({ ...SAMPLE_PLUGINS[1], id: 'same' }).ok).toBe(true);
    expect(usePlugins.getState().plugins.filter((p) => p.id === 'same')).toHaveLength(1); // replaced, not duplicated
  });
  it('enable / disable / remove', () => {
    usePlugins.getState().install(SAMPLE_PLUGINS[0]);
    const id = usePlugins.getState().plugins[0].id;
    usePlugins.getState().setEnabled(id, false);
    expect(usePlugins.getState().plugins[0].enabled).toBe(false);
    usePlugins.getState().remove(id);
    expect(usePlugins.getState().plugins).toEqual([]);
  });
  it('a corrupt stored value is ignored', () => {
    localStorage.setItem('sdd:plugins', '{not json');
    usePlugins.getState().hydrate();
    expect(usePlugins.getState().plugins).toEqual([]);
    localStorage.setItem('sdd:plugins', JSON.stringify([{ name: 'x', permissions: ['root'], code: '' }]));
    usePlugins.getState().hydrate();
    expect(usePlugins.getState().plugins).toEqual([]);
  });
  it('installFromUrl fetches a manifest (https only), resolves a relative entry script into inline code', async () => {
    const fetcher = vi.fn(async (url: string) => (url.endsWith('manifest.json') ? { ok: true, json: async () => ({ name: 'Remote', permissions: ['notify'], entry: 'https://cdn.example.com/p.js' }) } : { ok: true, text: async () => 'async function run(){ await sdd.notify({message:"hi"}); }' }));
    const r = await installFromUrl('https://example.com/manifest.json', fetcher as never);
    expect(r.ok).toBe(true);
    expect(usePlugins.getState().plugins[0].code).toContain('sdd.notify');
    expect(usePlugins.getState().plugins[0].entry).toBe('https://cdn.example.com/p.js');
  });
  it('installFromUrl refuses non-https URLs and failing fetches', async () => {
    expect((await installFromUrl('http://example.com/m.json', vi.fn() as never)).ok).toBe(false);
    expect((await installFromUrl('javascript:alert(1)', vi.fn() as never)).ok).toBe(false);
    expect((await installFromUrl('https://example.com/m.json', (async () => ({ ok: false, status: 404 })) as never)).ok).toBe(false);
    expect((await installFromUrl('https://example.com/m.json', (async () => { throw new Error('net'); }) as never)).ok).toBe(false);
  });
});
