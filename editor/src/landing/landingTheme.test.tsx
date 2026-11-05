import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { useSettingsStore } from '../store/settingsStore';
import { resolveTheme } from '../lib/theme';
import { SETTINGS_KEY } from '../lib/settings';

const realMatchMedia = window.matchMedia;
const mockScheme = (dark: boolean) => {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('prefers-color-scheme: dark') ? dark : false, media: q, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({ global: {} });
  useDiagramStore.getState().reset();
  document.documentElement.removeAttribute('data-theme');
  window.history.replaceState({}, '', '/');
});
afterEach(() => { window.matchMedia = realMatchMedia; });

describe('resolveTheme (pure)', () => {
  it('follows the OS when the visitor never picked a theme; explicit choices win', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('app default theme', () => {
  it('no stored preference + OS dark resolves dark on the projects page too', async () => {
    mockScheme(true);
    window.history.replaceState({}, '', '/projects');
    render(<App />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });
  it('no stored preference + OS light resolves light', async () => {
    mockScheme(false);
    window.history.replaceState({}, '', '/projects');
    render(<App />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
  });
});

describe('landing theme resolution', () => {
  it('renders dark when the OS is dark and no theme was chosen', async () => {
    mockScheme(true);
    render(<App />);
    await screen.findByTestId('landing');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });
  it('renders light when the OS is light', async () => {
    mockScheme(false);
    render(<App />);
    await screen.findByTestId('landing');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
  });
  it('app theme = system + OS dark renders dark', async () => {
    mockScheme(true);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'system' }));
    render(<App />);
    await screen.findByTestId('landing');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });
  it('an explicit light choice stays light even when the OS is dark', async () => {
    mockScheme(true);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'light' }));
    render(<App />);
    await screen.findByTestId('landing');
    await new Promise((r) => setTimeout(r, 50));
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('landing scrolls on the document', () => {
  it('the landing root is not an inner scroll container', async () => {
    render(<App />);
    const root = await screen.findByTestId('landing');
    const css = (await import('node:fs')).readFileSync((await import('node:path')).join(process.cwd(), 'src/landing/landing.css'), 'utf8');
    const rule = css.split('\n').find((l) => /^\.landing\s*\{/.test(l)) ?? '';
    expect(rule).not.toMatch(/overflow-y\s*:\s*(auto|scroll)/);
    expect(rule).not.toMatch(/height\s*:\s*100%/);
    expect(root.className).toContain('landing');
  });
  it('nav links smooth-scroll to their sections', async () => {
    const calls: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) { calls.push(this.id); };
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    for (const [name, id] of [['Features', 'features'], ['Templates', 'templates'], ['Clusters', 'clusters']] as const) {
      nav.querySelector<HTMLAnchorElement>(`a[href="#${id}"]`)!.click();
      expect(calls.at(-1), name).toBe(id);
    }
  });
});
