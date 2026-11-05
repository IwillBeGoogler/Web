import { describe, expect, it } from 'vitest';
import { nextTheme, resolveTheme } from './theme';
import { motionConfig } from './motion';
import { clampSidebarWidth, DEFAULT_LAYOUT, loadLayout, saveLayout, SIDEBAR_MAX, SIDEBAR_MIN, toggleInspector, toggleSidebar } from './layout';

describe('resolveTheme', () => {
  it('explicit choices win; system follows the OS', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
  it('toggle cycles light -> dark -> system -> light', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
    expect(nextTheme('system')).toBe('light');
  });
});

describe('motionConfig', () => {
  it('uses short springs by default and disables non-essential motion when reduced', () => {
    const m = motionConfig(false);
    expect(m.duration).toBeGreaterThanOrEqual(0.15);
    expect(m.duration).toBeLessThanOrEqual(0.25);
    expect(m.spring.type).toBe('spring');
    const r = motionConfig(true);
    expect(r.duration).toBe(0);
    expect(r.spring).toEqual({ duration: 0 });
    expect(r.enabled).toBe(false);
  });
});

describe('layout state', () => {
  it('clamps sidebar width', () => {
    expect(clampSidebarWidth(10)).toBe(SIDEBAR_MIN);
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX);
    expect(clampSidebarWidth(300)).toBe(300);
    expect(clampSidebarWidth(Number.NaN)).toBe(DEFAULT_LAYOUT.sidebarWidth);
  });
  it('toggles panels independently', () => {
    const a = toggleSidebar(DEFAULT_LAYOUT);
    expect(a.sidebarOpen).toBe(!DEFAULT_LAYOUT.sidebarOpen);
    expect(a.inspectorOpen).toBe(DEFAULT_LAYOUT.inspectorOpen);
    expect(toggleInspector(a).inspectorOpen).toBe(!DEFAULT_LAYOUT.inspectorOpen);
  });
  it('persists and tolerates corrupt storage', () => {
    const st = (() => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; })();
    saveLayout(st, { sidebarOpen: false, inspectorOpen: true, sidebarWidth: 320 });
    expect(loadLayout(st)).toEqual({ sidebarOpen: false, inspectorOpen: true, sidebarWidth: 320 });
    st.setItem('sdd:layout', '{bad');
    expect(loadLayout(st)).toEqual(DEFAULT_LAYOUT);
    st.setItem('sdd:layout', JSON.stringify({ sidebarOpen: 'x', sidebarWidth: 5 }));
    expect(loadLayout(st).sidebarWidth).toBe(SIDEBAR_MIN);
    const boom = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadLayout(boom)).toEqual(DEFAULT_LAYOUT);
    expect(() => saveLayout(boom, DEFAULT_LAYOUT)).not.toThrow();
  });
});
