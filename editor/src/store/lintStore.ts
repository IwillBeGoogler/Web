import { create } from 'zustand';
import type { LintConfig, NamingStyle, Severity } from '@core/lint';

const KEY = 'sdd:lint';
const SEVERITIES: Severity[] = ['error', 'warning', 'info'];

function load(): LintConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as LintConfig | null;
    if (!raw || typeof raw !== 'object') return {};
    const rules: NonNullable<LintConfig['rules']> = {};
    for (const [id, v] of Object.entries(raw.rules ?? {})) {
      if (!v || typeof v !== 'object') continue;
      rules[id] = { ...(typeof v.enabled === 'boolean' ? { enabled: v.enabled } : {}), ...(SEVERITIES.includes(v.severity as Severity) ? { severity: v.severity } : {}) };
    }
    return { rules, ...(['snake_case', 'camelCase', 'any'].includes(raw.naming as string) ? { naming: raw.naming as NamingStyle } : {}) };
  } catch {
    return {};
  }
}
const save = (c: LintConfig) => {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private mode */ }
};

interface LintState {
  config: LintConfig;
  setRule: (id: string, patch: { enabled?: boolean; severity?: Severity | null }) => void;
  setNaming: (n: NamingStyle) => void;
  reset: () => void;
}
export const useLintStore = create<LintState>((set) => ({
  config: load(),
  setRule: (id, patch) => set((s) => {
    const cur = { ...(s.config.rules?.[id] ?? {}) };
    if (patch.enabled !== undefined) cur.enabled = patch.enabled;
    if (patch.severity === null) delete cur.severity;
    else if (patch.severity) cur.severity = patch.severity;
    const config = { ...s.config, rules: { ...(s.config.rules ?? {}), [id]: cur } };
    save(config);
    return { config };
  }),
  setNaming: (naming) => set((s) => { const config = { ...s.config, naming }; save(config); return { config }; }),
  reset: () => { save({}); set({ config: {} }); },
}));
