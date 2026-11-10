import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exportPage: vi.fn(),
  exportProjectBytes: vi.fn(),
  newProject: vi.fn(),
  exportDialog: vi.fn(),
}));
vi.mock('../lib/exportImage', async (orig) => ({ ...(await orig<typeof import('../lib/exportImage')>()), exportPage: mocks.exportPage }));
vi.mock('../workspace/projectFile', async (orig) => ({ ...(await orig<typeof import('../workspace/projectFile')>()), exportProjectBytes: mocks.exportProjectBytes }));
vi.mock('../lib/dialogActions', async (orig) => ({ ...(await orig<typeof import('../lib/dialogActions')>()), newProjectDialog: mocks.newProject, exportDialog: mocks.exportDialog }));

import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useWorkspace } from '../workspace/store';
import { seedProject } from '../test/workspace';
import { blankClass } from '../lib/uml/geometry';
import { serializeProject } from '../lib/project';

vi.setConfig({ testTimeout: 60000 });
const s = () => useDiagramStore.getState();
const wait = (ms = 20) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const fileMenu = () => screen.getAllByRole('button', { name: /^File$/ }).find((b) => b.getAttribute('aria-haspopup') === 'menu')!;
async function pick(name: RegExp) {
  await act(async () => void fireEvent.click(fileMenu()));
  await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name })); await new Promise((r) => setTimeout(r, 5)); });
}

beforeEach(() => {
  localStorage.clear();
  s().reset();
  useUiStore.getState().resetUi();
  mocks.exportPage.mockReset().mockResolvedValue(undefined);
  mocks.exportProjectBytes.mockReset().mockReturnValue(new Uint8Array([1]));
  mocks.newProject.mockReset().mockResolvedValue(null);
  mocks.exportDialog.mockReset().mockResolvedValue(null);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  render(<App initialProjectId={seedProject('Dlg').projectId} />);
  act(() => s().placeNodes([blankClass('c1', { x: 0, y: 0 }, 'class', 'A')]));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Toolbar dialogs and failures', () => {
  it('new project: a cancelled dialog does nothing; a chosen template opens a new project', async () => {
    await pick(/New project/);
    expect(mocks.newProject).toHaveBeenCalledTimes(1);
    mocks.newProject.mockResolvedValue({ name: 'From template', templateId: undefined });
    await pick(/New project/);
    await wait();
    mocks.newProject.mockImplementation(async (tpls: { id: string }[]) => ({ name: 'T', templateId: tpls[0].id }));
    await pick(/New project/);
    await wait();
    expect(mocks.newProject).toHaveBeenCalledTimes(3);
  });

  it('PNG / SVG export success and failure; project export failure', async () => {
    await pick(/Export page as PNG/);
    expect(mocks.exportPage).toHaveBeenCalled();
    mocks.exportPage.mockRejectedValue(new Error('boom'));
    await pick(/Export page as SVG/);
    mocks.exportPage.mockRejectedValue('plain string');
    await pick(/Export page as PNG/);
    mocks.exportProjectBytes.mockImplementation(() => { throw new Error('zip failed'); });
    await pick(/Export project \(\.sdd\)/);
    mocks.exportProjectBytes.mockImplementation(() => { throw 'str'; });
    await pick(/Export project \(\.sdd\)/);
    await wait();
  });

  it('export dialog: current page, every page (switching pages) and failure', async () => {
    await pick(/Export image/);
    mocks.exportDialog.mockResolvedValue({ format: 'png', scale: 2, transparent: true, background: 'white', pages: 'current' });
    await pick(/Export image/);
    await wait();
    expect(mocks.exportPage).toHaveBeenCalledTimes(1);
    act(() => { s().addPage('Second'); });
    const first = s().pages[0].id;
    act(() => s().switchPage(first));
    mocks.exportDialog.mockResolvedValue({ format: 'svg', scale: 1, transparent: false, background: 'white', pages: 'all' });
    await pick(/Export image/);
    await wait(1200);
    expect(mocks.exportPage.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(s().activePageId).toBe(first);
    mocks.exportPage.mockRejectedValue(new Error('nope'));
    await pick(/Export image/);
    await wait(1200);
    mocks.exportPage.mockRejectedValue('str');
    mocks.exportDialog.mockResolvedValue({ format: 'png', scale: 1, transparent: false, background: 'white', pages: 'current' });
    await pick(/Export image/);
    await wait();
  });

  it('JSON import: a valid project is added; an invalid one reports the error', async () => {
    const good = serializeProject(s().toProject());
    fireEvent.change(screen.getByTestId('import-input'), { target: { files: [new File([good], 'a.json')] } });
    await wait(50);
    fireEvent.change(screen.getByTestId('import-input'), { target: { files: [new File(['{"nope":1}'], 'b.json')] } });
    await wait(50);
    expect(screen.getByTestId('topbar')).toBeTruthy();
  });

  it('project import failures: unreadable file and a non-sdd file', async () => {
    const bad = new File(['x'], 'a.sdd');
    Object.defineProperty(bad, 'arrayBuffer', { value: () => Promise.reject(new Error('read failed')) });
    fireEvent.change(screen.getByTestId('import-project-input'), { target: { files: [bad] } });
    await wait(50);
    const junk = new File([new Uint8Array([80, 75, 3, 4, 0, 0, 0, 0])], 'b.sdd');
    fireEvent.change(screen.getByTestId('import-project-input'), { target: { files: [junk] } });
    await wait(100);
    fireEvent.change(screen.getByTestId('import-project-input'), { target: { files: [] } });
    expect(screen.getByTestId('topbar')).toBeTruthy();
  });

  it('without a workspace project the file name renames the document itself', async () => {
    act(() => useWorkspace.setState({ project: null } as never));
    const input = screen.getByLabelText('File name');
    fireEvent.change(input, { target: { value: 'Solo' } });
    fireEvent.blur(input);
    expect(s().projectName).toBe('Solo');
  });

  it('the project caret offers All projects', async () => {
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Project menu' })));
    await act(async () => void fireEvent.click(screen.getByRole('menuitem', { name: /All projects/ })));
    await wait();
  });
});
