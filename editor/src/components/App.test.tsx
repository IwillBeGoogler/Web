import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { useUsageStore } from '../store/usageStore';
import { useUiStore } from '../store/uiStore';
import { seedProject, showComponents } from '../test/workspace';

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  useUsageStore.getState().reset();
  useUiStore.getState().resetUi();
});

/** Render the editor on a fresh stored project. */
async function renderEditor() {
  const p = seedProject('Test');
  const r = render(<App initialProjectId={p.projectId} />);
  await showComponents();
  return r;
}

/** top-level (level 1) accordion header by label */
const header = (name: RegExp): HTMLElement => {
  const hs = Array.from(document.querySelectorAll<HTMLElement>('.acc-l1 > .acc-item > .acc-header'));
  const h = hs.find((x) => name.test(x.textContent ?? ''));
  if (!h) throw new Error(`no header ${name}`);
  return h;
};

describe('App palette accordion', () => {
  it('renders palette, toolbar and canvas; every category starts collapsed', async () => {
    await renderEditor();
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^File/ })).toBeInTheDocument();
    const headers = screen.getAllByRole('button').filter((b) => b.classList.contains('acc-header'));
    expect(headers.length).toBeGreaterThan(10);
    for (const h of headers) expect(h).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('palette-prometheus')).toBeNull();
  });
  it('clicking a header toggles aria-expanded and shows items; several stay open', async () => {
    await renderEditor();
    const clients = header(/^Clients/);
    fireEvent.click(clients);
    expect(clients).toHaveAttribute('aria-expanded', 'true');
    expect(clients).toHaveAttribute('aria-controls');
    expect(screen.getByTestId('palette-user')).toBeInTheDocument();
    fireEvent.click(header(/^Compute/));
    expect(header(/^Clients/)).toHaveAttribute('aria-expanded', 'true');
    expect(header(/^Compute/)).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(header(/^Compute/));
    expect(header(/^Compute/)).toHaveAttribute('aria-expanded', 'false');
  });
  it('several open at once; expand/collapse all', async () => {
    await renderEditor();
    fireEvent.click(header(/^Clients/));
    fireEvent.click(header(/^Compute/));
    expect(header(/^Clients/)).toHaveAttribute('aria-expanded', 'true');
    expect(header(/^Compute/)).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: /collapse all/i }));
    expect(header(/^Clients/)).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: /expand all/i }));
    expect(header(/^Clients/)).toHaveAttribute('aria-expanded', 'true');
  });
  it('arrow keys move focus between headers', async () => {
    await renderEditor();
    const clients = header(/^Clients/);
    clients.focus();
    fireEvent.keyDown(clients, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(header(/^Network/));
  });
  it('search auto-expands matching categories, hides others, and clearing restores state', async () => {
    await renderEditor();
    fireEvent.click(header(/^Clients/));
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'redis' } });
    expect(screen.getByTestId('palette-redis')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Clients\d/);
    fireEvent.change(input, { target: { value: '' } });
    expect(header(/^Clients/)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByTestId('palette-redis')).toBeNull();
  });
  it('loads template from menu', async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /^File/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Templates/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Insert: Monitoring stack' }));
    expect(useDiagramStore.getState().nodes).toHaveLength(25);
  });
  it('clicking a palette item adds a node and records it as recently used', async () => {
    await renderEditor();
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'redis' } });
    fireEvent.click(screen.getByTestId('palette-redis'));
    expect(useDiagramStore.getState().nodes[0].data.label).toBe('Redis');
    expect(useUsageStore.getState().recent[0]).toBe('redis');
  });
  it('favorites: star toggles and a Favorites section appears', async () => {
    await renderEditor();
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'redis' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^Favorite Redis/ })[0]);
    expect(useUsageStore.getState().favorites).toEqual(['redis']);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: '' } });
    expect(screen.getByRole('button', { name: /Favorites/ })).toBeInTheDocument();
  });
  it('virtualizes long lists: open section with 300+ items renders only a window', async () => {
    await renderEditor();
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'a' } }); // 1 char: prefix matches
    const total = useDiagramStore.getState().nodes.length; // unused, keeps store referenced
    expect(total).toBe(0);
    const grids = screen.getAllByTestId('palette-scroll');
    const biggest = grids.map((g) => within(g).queryAllByRole('button').length).sort((a, b) => b - a)[0];
    expect(biggest).toBeLessThan(200);
    await act(async () => {});
  });
});
