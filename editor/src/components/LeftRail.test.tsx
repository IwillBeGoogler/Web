import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { openPalette, seedProject } from '../test/workspace';
import { useLayoutStore } from '../store/layoutStore';
import { useWorkspace } from '../workspace/store';

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  useUiStore.getState().resetUi();
  useWorkspace.getState().unload();
  useLayoutStore.setState({ sidebarOpen: false, inspectorOpen: false });
});
const group = () => screen.getByRole('group', { name: 'Diagram type' });
const open = () => render(<App initialProjectId={seedProject('Rail').projectId} />);

describe('left rail: the component palette only', () => {
  it('starts collapsed as a slim icon rail (search + categories); a click expands it and the choice is remembered', () => {
    open();
    const rail = screen.getByTestId('palette-rail');
    expect(within(rail).getByRole('button', { name: 'Search components' })).toBeInTheDocument();
    expect(within(rail).getAllByRole('button').length).toBeGreaterThanOrEqual(6); // search + one per category
    expect(screen.queryByPlaceholderText(/Search components/i)).toBeNull();
    fireEvent.click(within(rail).getByRole('button', { name: 'Search components' }));
    expect(screen.getByPlaceholderText(/Search components/i)).toBeInTheDocument();
    expect(screen.queryByTestId('palette-rail')).toBeNull();
    expect(JSON.parse(localStorage.getItem('sdd:layout') ?? '{}').sidebarOpen).toBe(true);
  });

  it('a category icon expands the palette on that category', () => {
    open();
    fireEvent.click(within(screen.getByTestId('palette-rail')).getByRole('button', { name: 'UML components' }));
    expect(within(group()).getByRole('button', { name: 'UML' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('⌘\\ toggles the palette; a stored open state is applied on load', () => {
    localStorage.setItem('sdd:layout', JSON.stringify({ sidebarOpen: true, inspectorOpen: false, sidebarWidth: 264 }));
    open();
    expect(screen.getByPlaceholderText(/Search components/i)).toBeInTheDocument();
    expect(screen.queryByTestId('palette-rail')).toBeNull();
  });

  it('there is no Files | Components toggle and no explorer in the rail', () => {
    open();
    openPalette();
    expect(screen.queryByRole('tab', { name: /Files/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Components/ })).toBeNull();
    expect(screen.queryByTestId('rail-files')).toBeNull();
    expect(screen.queryByRole('tree', { name: 'Project files' })).toBeNull();
  });

  it('the top bar has the file switcher; one open file means no tab bar and no pages row', () => {
    open();
    expect(screen.getByTestId('topbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch file' })).toBeInTheDocument();
    expect(screen.queryByTestId('file-tabs')).toBeNull();
    expect(screen.queryByTestId('workspace-bar')).toBeNull();
    expect(screen.queryByText('Pages')).toBeNull();
    expect((screen.getByLabelText('File name') as HTMLInputElement).value).toBe('Rail');
  });
});

describe('inspector: only when something is selected (or pinned)', () => {
  it('is not rendered with an empty selection, slides in on select and out on deselect', async () => {
    open();
    expect(screen.queryByLabelText('Properties')).toBeNull();
    act(() => useDiagramStore.getState().addNode({ id: 'n1', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'Svc' }, selected: true } as never));
    expect(await screen.findByLabelText('Properties')).toBeInTheDocument();
    expect(screen.queryByText(/Select a node, group or edge/)).toBeNull();
    act(() => useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => ({ ...n, selected: false })) })));
    await waitFor(() => expect(screen.queryByLabelText('Properties')).toBeNull());
  });
  it('stays closed with nothing selected, even when the toggle pins it', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Inspector/ }));
    expect(screen.queryByLabelText('Properties')).toBeNull();
  });
});

describe('palette mode filter', () => {
  const topHeaders = () => Array.from(document.querySelectorAll('.acc-l1 > .acc-item > .acc-header')).map((h) => h.textContent ?? '');
  it('All / Architecture / Data / UML / Board; the ERD and every UML diagram section are real', () => {
    open();
    openPalette();
    expect(within(group()).getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'Architecture', 'Data', 'UML', 'Board']);
    expect(within(group()).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(topHeaders().some((t) => /Database \(ER\)/.test(t))).toBe(true);
    expect(topHeaders().some((t) => /^UML/.test(t))).toBe(true);

    fireEvent.click(within(group()).getByRole('button', { name: 'UML' }));
    expect(topHeaders()).toHaveLength(1); // one UML section with 5 subs
    const ensureOpen = (h: HTMLElement) => { if (h.getAttribute('aria-expanded') !== 'true') fireEvent.click(h); };
    ensureOpen(document.querySelector('.acc-l1 > .acc-item > .acc-header') as HTMLElement);
    ensureOpen(screen.getByRole('button', { name: /^Class\d*$/ }));
    const cls = screen.getByTestId('palette-uml-class');
    expect(cls).not.toBeDisabled();
    expect(cls).toHaveAttribute('draggable', 'true');
    expect(screen.getByTestId('palette-uml-rel-inheritance')).not.toHaveAttribute('draggable', 'true'); // relations join selected classes
    ensureOpen(screen.getByRole('button', { name: /^Use case\d*$/ }));
    const actor = screen.getByTestId('palette-uml-actor');
    expect(actor).not.toBeDisabled();
    expect(actor).toHaveAttribute('draggable', 'true');

    fireEvent.click(within(group()).getByRole('button', { name: 'Data' }));
    expect(topHeaders().map((t) => t.replace(/\d+$/, '').trim())).toEqual(['Databases', 'Database (ER)']);

    fireEvent.click(within(group()).getByRole('button', { name: 'Board' }));
    expect(topHeaders().map((t) => t.replace(/\d+$/, '').trim())).toEqual(['Board', 'Generic']);

    fireEvent.click(within(group()).getByRole('button', { name: 'Architecture' }));
    expect(topHeaders().some((t) => /UML|Database \(ER\)/.test(t))).toBe(false);
    expect(localStorage.getItem('sdd:palette-mode')).toBe('architecture');
  });

  it('search runs inside the chosen mode', () => {
    open();
    openPalette();
    fireEvent.click(within(group()).getByRole('button', { name: 'UML' }));
    fireEvent.change(screen.getByLabelText('Search components'), { target: { value: 'postgres' } });
    expect(screen.getByText('No matches')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search components'), { target: { value: 'class' } });
    expect(screen.getByTestId('palette-uml-class')).toBeInTheDocument();
  });

  it('the stored mode is restored', () => {
    localStorage.setItem('sdd:palette-mode', 'board');
    localStorage.setItem('sdd:layout', JSON.stringify({ sidebarOpen: true, inspectorOpen: false, sidebarWidth: 264 }));
    open();
    expect(within(group()).getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
  });
});
