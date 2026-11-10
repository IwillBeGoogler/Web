import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginFrame, PluginPanel } from './PluginPanel';
import { useDiagramStore } from '../../store/diagramStore';
import { useToastStore } from '../../store/toastStore';
import { useUiStore } from '../../store/uiStore';
import { usePlugins } from '../../lib/plugins/store';
import type { InstalledPlugin } from '../../lib/plugins/manifest';

const plugin = (perms: InstalledPlugin['permissions'], extra: Partial<InstalledPlugin> = {}): InstalledPlugin => ({ id: 'p1', name: 'Test', version: '1', permissions: perms, code: 'x', enabled: true, ...extra });
const msgs = () => useToastStore.getState().toasts.map((t) => `${t.kind}:${t.message}`);
const send = (win: Window, data: unknown) => act(async () => { window.dispatchEvent(new MessageEvent('message', { data, source: win })); });
beforeEach(() => {
  localStorage.clear();
  usePlugins.getState().reset();
  useDiagramStore.getState().reset();
  useToastStore.getState().clear();
  useUiStore.getState().resetUi();
});

describe('PluginFrame extras', () => {
  it('notify calls map to success / error / info toasts prefixed by the plugin name', async () => {
    const { container } = render(<PluginFrame plugin={plugin(['notify'])} onResult={vi.fn()} onClose={vi.fn()} />);
    const win = container.querySelector('iframe')!.contentWindow!;
    await send(win, { sdd: 1, id: 1, method: 'notify', params: { message: 'done', kind: 'success' } });
    await send(win, { sdd: 1, id: 2, method: 'notify', params: { message: 'bad', kind: 'error' } });
    await send(win, { sdd: 1, id: 3, method: 'notify', params: { message: 'fyi' } });
    expect(msgs()).toEqual(['success:Test: done', 'error:Test: bad', 'info:Test: fyi']);
  });
  it('hidden until showPanel; then shows title (or plugin name), height, and a working close button', async () => {
    const onClose = vi.fn();
    const { container, rerender } = render(<PluginFrame plugin={plugin(['ui:panel'])} onResult={vi.fn()} onClose={onClose} />);
    const iframe = container.querySelector('iframe')!;
    expect(iframe.style.height).toBe('0px');
    expect(container.querySelector('.plugin-frame-head')).toBeNull();
    expect(container.querySelector('.plugin-frame')!.className).toBe('plugin-frame');
    await send(iframe.contentWindow!, { sdd: 1, id: 1, method: 'showPanel', params: { title: 'My panel', height: 320 } });
    expect(container.querySelector('.plugin-frame-head b')!.textContent).toBe('My panel');
    expect(container.querySelector('iframe')!.style.height).toBe('320px');
    expect(container.querySelector('.plugin-frame')!.className).toBe('plugin-frame shown');
    fireEvent.click(screen.getByRole('button', { name: 'Close plugin panel' }));
    expect(onClose).toHaveBeenCalled();
    rerender(<PluginFrame plugin={plugin(['ui:panel'], { id: 'p2' })} onResult={vi.fn()} onClose={onClose} />);
  });
  it('panel without title / height falls back to the plugin name and 200px', async () => {
    const { container } = render(<PluginFrame plugin={plugin(['ui:panel'])} onResult={vi.fn()} onClose={vi.fn()} />);
    await send(container.querySelector('iframe')!.contentWindow!, { sdd: 1, id: 1, method: 'showPanel', params: {} });
    expect(container.querySelector('.plugin-frame-head b')!.textContent).toBe('Test');
    expect(container.querySelector('iframe')!.style.height).toBe('200px');
  });
  it('result events: failures carry a trimmed error; non-boolean ok is false; unknown events are ignored', async () => {
    const onResult = vi.fn();
    const { container } = render(<PluginFrame plugin={plugin([])} onResult={onResult} onClose={vi.fn()} />);
    const win = container.querySelector('iframe')!.contentWindow!;
    await send(win, { sdd: 1, event: 'result', ok: false, error: 'e'.repeat(500) });
    expect(onResult.mock.calls[0][0].error).toHaveLength(300);
    await send(win, { sdd: 1, event: 'result', ok: 'yes', error: 5 });
    expect(onResult.mock.calls[1][0]).toEqual({ ok: false, value: undefined, error: undefined });
    await send(win, { sdd: 1, event: 'other' });
    expect(onResult).toHaveBeenCalledTimes(2);
  });
  it('null payloads are passed to the host and produce no reply', async () => {
    const { container } = render(<PluginFrame plugin={plugin([])} onResult={vi.fn()} onClose={vi.fn()} />);
    const win = container.querySelector('iframe')!.contentWindow!;
    const post = vi.spyOn(win, 'postMessage');
    await send(win, null);
    expect(post).not.toHaveBeenCalled();
  });
  it('the latest onResult callback is used without re-subscribing', async () => {
    const a = vi.fn(), b = vi.fn();
    const { container, rerender } = render(<PluginFrame plugin={plugin([])} onResult={a} onClose={vi.fn()} />);
    const win = container.querySelector('iframe')!.contentWindow!;
    rerender(<PluginFrame plugin={plugin([])} onResult={b} onClose={vi.fn()} />);
    await send(win, { sdd: 1, event: 'result', ok: true, value: 1 });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });
});

describe('PluginPanel extras', () => {
  const open = () => act(() => useUiStore.getState().setDesign({ pluginsOpen: true }));
  it('lists enabled plugins only, with description and permissions; close button and Escape close', () => {
    usePlugins.getState().install({ name: 'Alpha', description: 'does a', permissions: ['notify', 'nodes:read'], code: '' });
    usePlugins.getState().install({ name: 'Beta', permissions: [], code: '' });
    const off = usePlugins.getState().install({ name: 'Off', permissions: [], code: '' });
    if (off.ok) usePlugins.getState().setEnabled(off.plugin.id, false);
    render(<PluginPanel />);
    open();
    expect(screen.queryByText('Off')).toBeNull();
    expect(screen.getByText('does a')).toBeTruthy();
    expect(screen.getByText('notify · nodes:read')).toBeTruthy();
    expect(screen.getByText('no permissions')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'x' });
    expect(useUiStore.getState().pluginsOpen).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().pluginsOpen).toBe(false);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Close plugins' }));
    expect(useUiStore.getState().pluginsOpen).toBe(false);
  });
  it('run -> failed result toasts the error (or "failed") and closes the frame; string result is shown and can be copied', async () => {
    usePlugins.getState().install({ name: 'Alpha', permissions: [], code: '' });
    render(<PluginPanel />);
    open();
    const run = async (data: unknown) => {
      fireEvent.click(screen.getByRole('button', { name: 'Run Alpha' }));
      await send(document.querySelector('iframe')!.contentWindow!, data);
    };
    await run({ sdd: 1, event: 'result', ok: false, error: 'kaput' });
    expect(msgs()).toContain('error:Alpha: kaput');
    expect(document.querySelector('iframe')).toBeNull();
    await run({ sdd: 1, event: 'result', ok: false });
    expect(msgs()).toContain('error:Alpha: failed');
    await run({ sdd: 1, event: 'result', ok: true, value: 42 });
    expect(screen.queryByLabelText('Plugin output')).toBeNull();
    await run({ sdd: 1, event: 'result', ok: true, value: 'hello out' });
    expect(screen.getByLabelText('Plugin output').textContent).toBe('hello out');
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Copy' })));
    expect(writeText).toHaveBeenCalledWith('hello out');
    await waitFor(() => expect(msgs()).toContain('success:Copied'));
    writeText.mockRejectedValueOnce(new Error('no'));
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Copy' })));
    await waitFor(() => expect(msgs()).toContain('error:Could not use the clipboard'));
    // running again clears the previous output
    fireEvent.click(screen.getByRole('button', { name: 'Run Alpha' }));
    expect(screen.queryByLabelText('Plugin output')).toBeNull();
  });
  it('copy is a no-op without a clipboard API', async () => {
    usePlugins.getState().install({ name: 'Alpha', permissions: [], code: '' });
    render(<PluginPanel />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Run Alpha' }));
    await send(document.querySelector('iframe')!.contentWindow!, { sdd: 1, event: 'result', ok: true, value: 'v' });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(screen.getByLabelText('Plugin output')).toBeTruthy();
  });
  it('closing the running plugin panel stops it', async () => {
    usePlugins.getState().install({ name: 'Alpha', permissions: ['ui:panel'], code: '' });
    render(<PluginPanel />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Run Alpha' }));
    await send(document.querySelector('iframe')!.contentWindow!, { sdd: 1, id: 1, method: 'showPanel', params: {} });
    fireEvent.click(screen.getByRole('button', { name: 'Close plugin panel' }));
    expect(document.querySelector('iframe')).toBeNull();
  });
});
