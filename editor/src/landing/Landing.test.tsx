import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import App from '../App';
import { saveProject } from '../lib/projects';
import { createProject } from '../lib/project';
import { createWsProject, listWsProjects, loadTree } from '../workspace/storage';
import { useDiagramStore } from '../store/diagramStore';
import { showcaseTemplates } from './TemplatesShowcase';
import { canWebGL } from './HeroScene';

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  window.history.replaceState({}, '', '/');
});

describe('landing page', () => {
  it('"/" renders the landing: headline, subhead, CTAs, nav, sections, footer version', async () => {
    render(<App />);
    expect(await screen.findByTestId('landing')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Design systems, beautifully.');
    expect(screen.getByText(/2,000\+ real logos, clusters, smart routing\. Saves to \.sdd\./)).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const l of ['Features', 'Templates', 'Clusters', 'Docs', 'GitHub', 'Start drawing']) expect(within(nav).getByText(l)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Browse templates/ })).toBeInTheDocument();
    expect(screen.getAllByTestId('feature-card')).toHaveLength(6);
    expect(screen.getByTestId('marquee')).toBeInTheDocument();
    expect(screen.getByTestId('mini-demo')).toBeInTheDocument();
    expect(screen.getByTestId('app-version')).toHaveTextContent(/^\d+\.\d+\.\d+/);
    expect(screen.getByRole('list', { name: 'Template gallery' }).querySelectorAll('li').length).toBeGreaterThanOrEqual(4);
  });
  it('without WebGL (jsdom) the hero falls back to the animated SVG', async () => {
    expect(canWebGL()).toBe(false);
    render(<App />);
    expect(await screen.findByTestId('hero-fallback')).toBeInTheDocument();
    expect(document.querySelector('canvas')).toBeNull(); // no WebGL: no canvas at all
    expect(screen.getByTestId('landing-dots')).toBeInTheDocument(); // the calm static dotted backdrop (no animation, no 3D background)
  });
  it('the SVG fallback labels every node', async () => {
    render(<App />);
    const svg = await screen.findByTestId('hero-fallback');
    const labels = [...svg.querySelectorAll('.hero-label')].map((n) => n.textContent);
    expect([...labels].sort()).toEqual(['Grafana', 'Kafka', 'Kubernetes', 'PostgreSQL', 'Prometheus', 'Redis', 'nginx']);
  });
  it('CTAs navigate to /projects and show the dashboard', async () => {
    render(<App />);
    await screen.findByTestId('landing');
    const ctas = screen.getAllByRole('link', { name: /Start drawing/ });
    expect(ctas.length).toBeGreaterThanOrEqual(2); // nav + hero
    for (const c of ctas) expect(c).toHaveAttribute('href', '/projects');
    fireEvent.click(ctas[ctas.length - 1]);
    expect(window.location.pathname).toBe('/projects');
    expect(await screen.findByLabelText('Search projects')).toBeInTheDocument();
    expect(screen.queryByTestId('landing')).toBeNull();
  });
  it('"Open app" at the bottom also goes to /projects', async () => {
    render(<App />);
    await screen.findByTestId('landing');
    fireEvent.click(screen.getAllByRole('link', { name: /Open app/ })[0]);
    expect(window.location.pathname).toBe('/projects');
  });
  it('returning users get a "Continue where you left off" link to their latest project', async () => {
    const p = createWsProject(localStorage, 'Payments').project;
    render(<App />);
    const link = await screen.findByRole('link', { name: /Continue where you left off/ });
    expect(link).toHaveAttribute('href', `/p/${p.id}`);
    expect(link).toHaveTextContent('Payments');
    fireEvent.click(link);
    expect(window.location.pathname).toMatch(new RegExp(`^/p/${p.id}`));
    expect(await screen.findByTestId('topbar')).toBeInTheDocument();
    expect(window.location.pathname).toMatch(new RegExp(`^/p/${p.id}/f/fil_`)); // /p/:project opened the project's file
    expect(useDiagramStore.getState().projectName).toBe('Payments');
  });
  it('first-time visitors have no continue link', async () => {
    render(<App />);
    await screen.findByTestId('landing');
    expect(screen.queryByText(/Continue where you left off/)).toBeNull();
  });
  it('clicking a template creates a project from it and opens the editor', async () => {
    render(<App />);
    const first = showcaseTemplates()[0];
    fireEvent.click(await screen.findByRole('button', { name: `Open template ${first.name}` }));
    await waitFor(() => expect(listWsProjects(localStorage)).toHaveLength(1));
    await waitFor(() => expect(window.location.pathname).toMatch(new RegExp(`^/p/${listWsProjects(localStorage)[0].id}/f/fil_`)));
    expect(await screen.findByTestId('topbar')).toBeInTheDocument();
  });
});

describe('routing in the app shell', () => {
  it('/projects shows the dashboard; /p/:id opens the editor (deep link); unknown project goes back to /projects', async () => {
    window.history.replaceState({}, '', '/projects');
    const { unmount } = render(<App />);
    expect(await screen.findByLabelText('Search projects')).toBeInTheDocument();
    unmount();
    const p = createWsProject(localStorage, 'Deep').project;
    window.history.replaceState({}, '', `/p/${p.id}`);
    const r2 = render(<App />);
    expect(await screen.findByTestId('topbar')).toBeInTheDocument();
    r2.unmount();
    window.history.replaceState({}, '', '/p/does-not-exist');
    render(<App />);
    expect(await screen.findByLabelText('Search projects')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/projects');
  });
  it('an old /p/:id link (a pre-workspace project) still opens: migrated to a project with one file, redirected to the file route', async () => {
    const old = saveProject(localStorage, { ...createProject('Legacy'), id: 'prj_legacy01' });
    window.history.replaceState({}, '', `/p/${old.id}`);
    render(<App />);
    expect(await screen.findByTestId('topbar')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/p/prj_legacy01/f/fil_prj_legacy01');
    expect(useDiagramStore.getState().projectName).toBe('Legacy');
    expect(loadTree(localStorage, 'prj_legacy01').files.map((f) => f.name)).toEqual(['Legacy']);
  });
  it('a file id used where a project id belongs redirects to the file route', async () => {
    const { project, fileId } = createWsProject(localStorage, 'Redirect');
    window.history.replaceState({}, '', `/p/${fileId}`);
    render(<App />);
    expect(await screen.findByTestId('topbar')).toBeInTheDocument();
    expect(window.location.pathname).toBe(`/p/${project.id}/f/${fileId}`);
  });
  it('back to projects from the editor updates the URL', async () => {
    const p = createWsProject(localStorage, 'Back').project;
    window.history.replaceState({}, '', `/p/${p.id}`);
    render(<App />);
    fireEvent.click(await screen.findByLabelText('Back to projects'));
    expect(window.location.pathname).toBe('/projects');
  });
});

describe('three.js stays out of the entry bundle', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  it('only threeScene.ts imports "three" statically; the hero loads it with a dynamic import', () => {
    const files = walk(join(process.cwd(), 'src')).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));
    const staticImporters = files.filter((f) => /^\s*import[^;\n]*from\s+['"]three(\/[^'"]*)?['"]/m.test(readFileSync(f, 'utf8')));
    expect(staticImporters.map((f) => f.split('/').pop())).toEqual(['threeScene.ts']);
    const hero = readFileSync(join(process.cwd(), 'src/landing/HeroScene.tsx'), 'utf8');
    expect(hero).toMatch(/import\(['"]\.\/threeScene['"]\)/);
    expect(hero).not.toMatch(/from ['"]\.\/threeScene['"]/);
  });
});
