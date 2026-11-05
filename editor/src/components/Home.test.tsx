import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { formatUpdated } from './ProjectsHome';
import { LEGACY_KEY } from '../lib/projects';
import { createWsProject, createWsFile, listWsProjects, renameWsProject, putWsProject, setProjectSync } from '../workspace/storage';
import { serializeDiagram } from '../lib/serialization';
import { monitoringStack } from '../templates/monitoringStack';
import { useDiagramStore } from '../store/diagramStore';

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
});

describe('projects home', () => {
  it('shows empty state; New project opens a modal (name + optional template), creates and opens the project', async () => {
    render(<App />);
    expect(screen.getByText(/No projects yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    expect(within(dialog).getByLabelText('Template (optional)')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Project name'), { target: { value: 'Payments' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(listWsProjects(localStorage).map((p) => p.name)).toEqual(['Payments']));
    expect(await screen.findByTestId('topbar')).toBeInTheDocument(); // editor opened
    expect(useDiagramStore.getState().projectName).toBe('Payments');
  });
  it('New project with a template creates the template content', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    const select = within(dialog).getByLabelText('Template (optional)') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: select.options[1].value } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(listWsProjects(localStorage)).toHaveLength(1));
    await screen.findByTestId('topbar');
    expect(useDiagramStore.getState().nodes.length).toBeGreaterThan(3);
  });
  it('lists name, file count and updated time; rename / duplicate / delete each open a modal', async () => {
    const p = createWsProject(localStorage, 'Alpha').project;
    render(<App />);
    const card = screen.getByTestId(`project-${p.id}`);
    expect(within(card).getByText('Alpha')).toBeInTheDocument();
    expect(card).toHaveTextContent('1 file');
    expect(card).toHaveTextContent(/just now|min ago/);

    fireEvent.click(within(card).getByRole('button', { name: 'Rename' }));
    let dialog = await screen.findByRole('dialog', { name: 'Rename project' });
    const input = within(dialog).getByLabelText('Project name');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Name is required'); // validation
    fireEvent.change(input, { target: { value: 'Beta' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(listWsProjects(localStorage)[0].name).toBe('Beta'));

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    dialog = await screen.findByRole('dialog', { name: 'Duplicate project' });
    expect((within(dialog).getByLabelText('Name of the copy') as HTMLInputElement).value).toBe('Beta (copy)');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(listWsProjects(localStorage).map((x) => x.name).sort()).toEqual(['Beta', 'Beta (copy)']));

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    dialog = await screen.findByRole('alertdialog', { name: /Delete project/ });
    expect(listWsProjects(localStorage)).toHaveLength(2); // asks first
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(listWsProjects(localStorage)).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    dialog = await screen.findByRole('alertdialog', { name: /Delete project/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }));
    await waitFor(() => expect(listWsProjects(localStorage)).toHaveLength(1));
  });
  it('projects with more than 3 files need type-to-confirm to delete', async () => {
    const p = createWsProject(localStorage, 'Big').project;
    for (const n of ['b', 'c', 'd']) createWsFile(localStorage, p.id, { name: n });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: /Delete project/ });
    const btn = within(dialog).getByRole('button', { name: 'Delete project' });
    expect(btn).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Type .*Big.* to confirm/), { target: { value: 'Big' } });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(listWsProjects(localStorage)).toHaveLength(0));
  });
  it('migrates the old single-diagram autosave into "Untitled" on first load', () => {
    localStorage.setItem(LEGACY_KEY, serializeDiagram(monitoringStack()));
    render(<App />);
    expect(screen.getByText('Untitled')).toBeInTheDocument();
    expect(listWsProjects(localStorage)).toHaveLength(1);
  });
  it('right-click on a card opens the project menu', async () => {
    const p = createWsProject(localStorage, 'Alpha').project;
    render(<App />);
    fireEvent.contextMenu(screen.getByTestId(`project-${p.id}`));
    expect(screen.getByRole('menuitem', { name: 'Open' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Duplicate project' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(listWsProjects(localStorage)).toHaveLength(2));
  });
  it('formatUpdated', () => {
    const now = Date.UTC(2026, 0, 10, 12);
    expect(formatUpdated(now - 10_000, now)).toBe('just now');
    expect(formatUpdated(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(formatUpdated(now - 3 * 3600_000, now)).toBe('3 h ago');
    expect(formatUpdated(now - 2 * 86400_000, now)).toBe('2 d ago');
  });
});

import { act } from '@testing-library/react';

describe('premium home', () => {
  it('empty state (no projects) vs list; greeting, nav and template gallery are always there', () => {
    render(<App />);
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Good (morning|afternoon|evening)|Working late/);
    expect(screen.getByRole('button', { name: 'Open .sdd' })).toBeInTheDocument();
    expect(screen.getByLabelText('Templates').querySelectorAll('li').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('logo-mark')).toBeInTheDocument();
  });
  it('lists projects (no empty state) with file counts and "edited …" relative time', () => {
    const { project } = createWsProject(localStorage, 'Alpha');
    createWsFile(localStorage, project.id, { name: 'Second' });
    render(<App />);
    expect(screen.queryByText('No projects yet')).toBeNull();
    expect(screen.getByText(/edited just now/)).toBeInTheDocument();
    expect(screen.getByTestId(`counts-${project.id}`)).toHaveTextContent('2 files · edited');
  });
  it('sort by name / last edited and filter', () => {
    const a = createWsProject(localStorage, 'Zulu').project;
    const b = createWsProject(localStorage, 'Alpha').project;
    renameWsProject(localStorage, a.id, 'Zulu', Date.now() + 1000); // Zulu is newer
    render(<App />);
    const names = () => Array.from(document.querySelectorAll('.project-open')).map((x) => x.textContent);
    expect(names()).toEqual(['Zulu', 'Alpha']);
    fireEvent.click(screen.getByRole('button', { name: 'Sort by name' }));
    expect(names()).toEqual(['Alpha', 'Zulu']);
    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: 'zul' } });
    expect(names()).toEqual(['Zulu']);
    expect(b.id).toBeTruthy();
  });
  it('thumbnails show a skeleton first, then the rendered diagram', async () => {
    createWsProject(localStorage, 'Alpha').project;
    render(<App />);
    expect(screen.getAllByTestId('thumb-skeleton').length).toBeGreaterThan(0);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(document.querySelector('.project-card .project-thumb svg')).toBeTruthy();
  });
  it('a project with a server thumbnail shows that image instead of drawing one', async () => {
    const { project } = createWsProject(localStorage, 'Alpha');
    putWsProject(localStorage, { ...project, thumbnailUrl: '/api/files/fil_1/thumbnail?v=abc' });
    render(<App />);
    const img = await screen.findByTestId(`thumb-img-${project.id}`);
    expect(img).toHaveAttribute('src', '/api/files/fil_1/thumbnail?v=abc');
    expect(document.querySelector(`[data-testid="project-${project.id}"] .project-thumb svg`)).toBeNull();
  });
  it('⌘K focuses the search', () => {
    createWsProject(localStorage, 'Alpha').project;
    render(<App />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(document.activeElement).toBe(screen.getByLabelText('Search projects'));
  });
  it('project menu exports the whole project as .sddproj', () => {
    const p = createWsProject(localStorage, 'Alpha').project;
    render(<App />);
    fireEvent.contextMenu(screen.getByTestId(`project-${p.id}`));
    expect(screen.getByRole('menuitem', { name: 'Export project (.sdd)' })).toBeInTheDocument();
  });
});

describe('blank project card', () => {
  it('renders inside the project grid with the same class as project cards, with title, subtitle and N chip', () => {
    createWsProject(localStorage, 'Alpha').project;
    render(<App />);
    const blank = screen.getByTestId('blank-card');
    expect(blank.tagName).toBe('LI');
    expect(blank).toHaveClass('project-card');
    expect(blank.parentElement).toHaveClass('project-grid');
    expect(screen.getByTestId(/^project-/)).toHaveClass('project-card');
    expect(blank.parentElement).toBe(screen.getByTestId(/^project-/).parentElement);
    expect(within(blank).getByText('Blank project')).toBeInTheDocument();
    expect(within(blank).getByText('Start from an empty canvas')).toBeInTheDocument();
    expect(within(blank).getByText('N')).toBeInTheDocument();
  });
  it('N opens the New project modal; ignored while typing, with modifiers or while a dialog is open', async () => {
    createWsProject(localStorage, 'Alpha').project;
    render(<App />);
    const search = screen.getByLabelText('Search projects');
    fireEvent.keyDown(search, { key: 'n' });
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
    expect(listWsProjects(localStorage)).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: 'n' });
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    fireEvent.keyDown(window, { key: 'n' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(listWsProjects(localStorage)).toHaveLength(2));
    expect(await screen.findByTestId('topbar')).toBeInTheDocument();
  });
  it('with no projects: blank card plus template suggestions beside it', async () => {
    render(<App />);
    const blank = screen.getByTestId('blank-card');
    expect(blank.parentElement!.querySelectorAll('.template-card').length).toBeGreaterThanOrEqual(2);
    fireEvent.click(within(blank).getByRole('button', { name: /^Blank project/ }));
    expect(await screen.findByRole('dialog', { name: 'New project' })).toBeInTheDocument();
  });
});

describe('viewer cannot rename', () => {
  it('no Rename button, no menu entry, no double-click rename on a project the user only views', async () => {
    const { project } = createWsProject(localStorage, 'Shared');
    setProjectSync(localStorage, project.id, { serverBacked: true, role: 'viewer', treeRev: 1, lastSyncedAt: 1 });
    render(<App />);
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
    fireEvent.contextMenu(screen.getByTestId(`project-${project.id}`));
    expect(screen.getByRole('menuitem', { name: 'Open' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull();
    fireEvent.doubleClick(document.querySelector('.project-open')!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('an editor still can', () => {
    const { project } = createWsProject(localStorage, 'Mine');
    setProjectSync(localStorage, project.id, { serverBacked: true, role: 'editor', treeRev: 1, lastSyncedAt: 1 });
    render(<App />);
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
  });
});
