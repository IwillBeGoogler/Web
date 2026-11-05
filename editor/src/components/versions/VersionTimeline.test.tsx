import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { VersionFull, VersionMeta } from '../../api/types';
import { useDialogStore } from '../../lib/dialogs';
import { createStoredProject } from '../../lib/projects';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { useDiffStore } from '../../versions/diffStore';
import { closeTimeline, openTimeline, select, useTimeline } from '../../versions/timelineStore';
import type { Project } from '../../types';
import App from '../../App';
import { DialogHost } from '../ui/DialogHost';
import { VersionTimeline } from './VersionTimeline';

const meta = (version: number, extra: Partial<VersionMeta> = {}): VersionMeta => ({ version, name: 'P', label: null, createdBy: 'u1', createdAt: Date.now() - (5 - version) * 60_000, ...extra });
const mk = (labels: string[]): Project =>
  ({ version: 2, id: 'f', name: 'F', createdAt: 1, updatedAt: 1, activePageId: 'p', pages: [{ id: 'p', name: 'P', nodes: labels.map((l, i) => ({ id: l, type: 'icon', position: { x: i * 200, y: 0 }, data: { label: l } })), edges: [] }] }) as unknown as Project;
const DOCS: Record<number, string[]> = { 1: ['A'], 2: ['A', 'B'], 3: ['B', 'C'] };
const metas = [meta(1), meta(2, { named: true, label: 'Release 1', createdBy: '0' }), meta(3)];
const mkClient = () => ({
  listVersions: vi.fn(async () => metas),
  getVersion: vi.fn(async (_id: string, v: number) => ({ ...metas[v - 1], data: mk(DOCS[v]) }) as VersionFull),
});
const openBar = async (role: 'owner' | 'viewer' = 'owner', client = mkClient(), authors: Record<string, string> = { u1: 'Ada' }) => {
  await act(async () => openTimeline({ fileId: 'f', role, currentVersion: 3, client, activePageId: useDiagramStore.getState().activePageId, authors }));
  return client;
};
beforeEach(() => { closeTimeline(); useDiffStore.getState().clear(); useDialogStore.getState().clear(); useDiagramStore.getState().reset(); });
afterEach(() => closeTimeline());

describe('VersionTimeline', () => {
  it('renders nothing while closed; one point per version, named ones marked, live at the end', async () => {
    const { container } = render(<VersionTimeline />);
    expect(container).toBeEmptyDOMElement();
    await openBar();
    expect(await screen.findByTestId('vt-point-1')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^vt-point-/)).toHaveLength(3);
    expect(screen.getByTestId('vt-point-2')).toHaveClass('named');
    expect(screen.getByTestId('vt-point-1')).not.toHaveClass('named');
    expect(screen.getByRole('button', { name: 'Live' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows author, time and the change summary of the selected point', async () => {
    render(<VersionTimeline />);
    await openBar();
    fireEvent.click(await screen.findByTestId('vt-point-3'));
    await waitFor(() => expect(screen.getByTestId('vt-summary')).toHaveTextContent('1 added, 1 removed'));
    expect(screen.getByTestId('vt-meta')).toHaveTextContent('by Ada');
    expect(screen.getByTestId('vt-meta')).toHaveTextContent('ago');
    expect(screen.getByLabelText('Changes in this version')).toHaveTextContent('+ C');
    expect(screen.getByLabelText('Changes in this version')).toHaveTextContent('− A');
    expect(screen.getByLabelText('Legend')).toHaveTextContent('+ added'); // glyphs, not colour alone
    expect(screen.getByLabelText('Legend')).toHaveTextContent('~ changed');
  });

  it('a version without a known author says so instead of breaking', async () => {
    render(<VersionTimeline />);
    await openBar();
    fireEvent.click(await screen.findByTestId('vt-point-2'));
    await waitFor(() => expect(screen.getByTestId('vt-meta')).toHaveTextContent('by Unknown author'));
    expect(screen.getByTestId('vt-point-2').getAttribute('aria-label')).toContain('Unknown author');
  });

  it('← → move between points; → from the newest returns to live; Home / End jump', async () => {
    render(<VersionTimeline />);
    await openBar();
    const track = await screen.findByRole('group', { name: 'Versions' });
    await act(async () => void fireEvent.keyDown(track, { key: 'ArrowLeft' }));
    await waitFor(() => expect(useTimeline.getState().selected).toBe(2));
    await act(async () => void fireEvent.keyDown(track, { key: 'ArrowLeft' }));
    await waitFor(() => expect(useTimeline.getState().selected).toBe(1));
    await act(async () => void fireEvent.keyDown(track, { key: 'Home' }));
    await waitFor(() => expect(useTimeline.getState().selected).toBe(0));
    await act(async () => void fireEvent.keyDown(track, { key: 'End' }));
    await waitFor(() => expect(useTimeline.getState().selected).toBeNull());
    expect(screen.getByTestId('vt-point-3')).toHaveAttribute('tabindex', '0');
  });

  it('play button plays and pauses; Esc closes the bar and clears the highlight', async () => {
    render(<VersionTimeline />);
    await openBar();
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));
    await waitFor(() => expect(useTimeline.getState().playing).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(useTimeline.getState().playing).toBe(false);
    await act(async () => select(1));
    expect(useDiffStore.getState().diff).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('version-timeline')).toBeNull();
    expect(useDiffStore.getState().diff).toBeNull();
  });

  it('Restore asks for confirmation and uses the existing restore API; hidden for viewers', async () => {
    const restoreApi = vi.fn(async () => ({ file: { id: 'f' }, version: 9 }));
    const apiMod = await import('../../api/api');
    const spy = vi.spyOn(apiMod.api, 'restoreVersion').mockImplementation(restoreApi as never);
    vi.spyOn(apiMod.api, 'getFile').mockResolvedValue({ version: 3 } as never);
    render(<><VersionTimeline /><DialogHost /></>);
    await openBar('owner');
    fireEvent.click(await screen.findByTestId('vt-point-1'));
    const btn = await screen.findByRole('button', { name: 'Restore this version' });
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('f', 1));
    await waitFor(() => expect(useTimeline.getState().selected).toBeNull()); // back on the (restored) live view
    spy.mockRestore();
  });

  it('a viewer sees no restore button', async () => {
    render(<VersionTimeline />);
    await openBar('viewer');
    fireEvent.click(await screen.findByTestId('vt-point-1'));
    await screen.findByTestId('vt-viewonly');
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull();
  });

  it('the current version has no restore button; a dense history stays in one scrollable track', async () => {
    const many = Array.from({ length: 300 }, (_, i) => meta(i + 1, { createdAt: Date.now() - (300 - i) * 3_600_000 }));
    const client = { listVersions: vi.fn(async () => many), getVersion: vi.fn() };
    render(<VersionTimeline />);
    await act(async () => openTimeline({ fileId: 'f', role: 'owner', currentVersion: 300, client: client as never, activePageId: 'p' }));
    expect(await screen.findAllByTestId(/^vt-point-/)).toHaveLength(300);
    expect(screen.getAllByText(/·\s\d+$/).length).toBeGreaterThan(5); // day headings with counts
  });
});

describe('the canvas while previewing (whole app)', () => {
  const addLive = () => {
    const st = useDiagramStore.getState();
    st.addNode({ id: 'LIVE', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'Live node' } } as never);
  };
  beforeEach(() => {
    localStorage.clear();
    useUiStore.getState().resetUi();
  });
  it('draws the version read-only, keeps the live nodes aside, and shows them again on exit', async () => {
    const p = createStoredProject(localStorage, 'Tl');
    render(<App initialProjectId={p.id} />);
    await act(async () => addLive());
    const liveBefore = JSON.stringify(useDiagramStore.getState().nodes);
    const pastBefore = useDiagramStore.getState().past.length;
    await openBar();
    await act(async () => select(0));
    await waitFor(() => expect(document.querySelector('.react-flow__node[data-id="A"]')).not.toBeNull());
    expect(document.querySelector('.react-flow__node[data-id="LIVE"]')).toBeNull();
    expect(document.querySelector('.app')).toHaveClass('previewing');
    // editing keys do nothing meanwhile
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(JSON.stringify(useDiagramStore.getState().nodes)).toBe(liveBefore);
    expect(useDiagramStore.getState().past.length).toBe(pastBefore);
    // live edit arriving from a collaborator while previewing
    await act(async () => void useDiagramStore.getState().addNode({ id: 'REMOTE', type: 'icon', position: { x: 300, y: 0 }, data: { label: 'Remote' } } as never));
    await act(async () => closeTimeline());
    await waitFor(() => expect(document.querySelector('.react-flow__node[data-id="LIVE"]')).not.toBeNull());
    expect(document.querySelector('.react-flow__node[data-id="REMOTE"]')).not.toBeNull();
    expect(document.querySelector('.react-flow__node[data-id="A"]')).toBeNull();
    expect(document.querySelector('.app')).not.toHaveClass('previewing');
  });
});
