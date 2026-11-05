/** Installed plugins of this browser (localStorage). Plugins never touch app storage themselves: they only get the sandboxed API. */
import { create } from 'zustand';
import { parseManifest, MAX_PLUGIN_CODE, type InstalledPlugin, type PluginManifest } from './manifest';

const KEY = 'sdd:plugins';
interface PluginsState {
  plugins: InstalledPlugin[];
  hydrate: () => void;
  install: (raw: unknown, resolvedCode?: string) => { ok: true; plugin: InstalledPlugin } | { ok: false; error: string };
  setEnabled: (id: string, on: boolean) => void;
  remove: (id: string) => void;
  reset: (clearStorage?: boolean) => void;
}
const save = (list: InstalledPlugin[]) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota / private mode */ } };
const toInstalled = (m: PluginManifest, code: string, enabled = true): InstalledPlugin => ({
  id: m.id ?? `pl_${Math.random().toString(36).slice(2, 10)}`, name: m.name, version: m.version ?? '1.0.0', ...(m.description ? { description: m.description } : {}), permissions: m.permissions, code, ...(m.entry ? { entry: m.entry } : {}), enabled,
});

export const usePlugins = create<PluginsState>((set, get) => ({
  plugins: [],
  hydrate: () => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      if (!Array.isArray(raw)) return;
      const ok: InstalledPlugin[] = [];
      for (const p of raw) {
        const r = parseManifest({ ...p, entry: undefined, code: typeof p?.code === 'string' ? p.code : '' });
        if (r.ok && typeof p.id === 'string') ok.push({ ...toInstalled(r.manifest, p.code), id: p.id, enabled: p.enabled !== false, ...(typeof p.entry === 'string' ? { entry: p.entry } : {}) });
      }
      set({ plugins: ok });
    } catch { /* corrupt: start empty */ }
  },
  install: (raw, resolvedCode) => {
    const r = parseManifest(raw);
    if (!r.ok) return r;
    const code = r.manifest.code ?? resolvedCode;
    if (code === undefined) return { ok: false, error: 'The plugin has no code' };
    const plugin = toInstalled(r.manifest, code);
    const rest = get().plugins.filter((p) => p.id !== plugin.id);
    const plugins = [...rest, plugin];
    save(plugins);
    set({ plugins });
    return { ok: true, plugin };
  },
  setEnabled: (id, on) => { const plugins = get().plugins.map((p) => (p.id === id ? { ...p, enabled: on } : p)); save(plugins); set({ plugins }); },
  remove: (id) => { const plugins = get().plugins.filter((p) => p.id !== id); save(plugins); set({ plugins }); },
  reset: (clearStorage = true) => { if (clearStorage) { try { localStorage.removeItem(KEY); } catch { /* ignore */ } } set({ plugins: [] }); },
}));

type Fetcher = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status?: number; json?: () => Promise<unknown>; text?: () => Promise<string> }>;
const https = (u: string) => { try { return new URL(u).protocol === 'https:'; } catch { return false; } };

/** manifest URL (https) -> installed plugin. A manifest with an `entry` script has that script fetched ONCE and stored as inline code: the sandbox never loads anything over the network. */
export async function installFromUrl(url: string, fetcher: Fetcher = (u, i) => fetch(u, { ...i, credentials: 'omit', cache: 'no-store' })): Promise<{ ok: true; plugin: InstalledPlugin } | { ok: false; error: string }> {
  if (!https(url)) return { ok: false, error: 'Only https URLs can be installed' };
  try {
    const res = await fetcher(url);
    if (!res.ok || !res.json) return { ok: false, error: `Could not fetch the manifest (${res.status ?? 'network'})` };
    const manifest = await res.json();
    const parsed = parseManifest(manifest);
    if (!parsed.ok) return parsed;
    if (parsed.manifest.entry) {
      const script = await fetcher(parsed.manifest.entry);
      if (!script.ok || !script.text) return { ok: false, error: `Could not fetch the plugin script (${script.status ?? 'network'})` };
      const code = await script.text();
      if (code.length > MAX_PLUGIN_CODE) return { ok: false, error: 'The plugin script is too large' };
      return usePlugins.getState().install(manifest, code);
    }
    return usePlugins.getState().install(manifest);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Install failed' };
  }
}

/** a manifest chosen from disk: JSON text of the manifest (with inline `code`) */
export function installFromText(text: string): { ok: true; plugin: InstalledPlugin } | { ok: false; error: string } {
  try { return usePlugins.getState().install(JSON.parse(text)); } catch { return { ok: false, error: 'Not valid JSON' }; }
}
