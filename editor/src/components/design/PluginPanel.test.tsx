import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginFrame, PluginPanel } from './PluginPanel';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { usePlugins } from '../../lib/plugins/store';
import type { InstalledPlugin } from '../../lib/plugins/manifest';

const plugin = (perms: InstalledPlugin['permissions']): InstalledPlugin => ({ id: 'p1', name: 'Test', version: '1', permissions: perms, code: 'console.log(1)', enabled: true });
beforeEach(() => {
  localStorage.clear();
  usePlugins.getState().reset();
  useDiagramStore.getState().reset();
  useUiStore.getState().resetUi();
});

describe('PluginFrame', () => {
  it('renders a sandboxed iframe: scripts only (no same-origin), strict CSP in the document', () => {
    const { container } = render(<PluginFrame plugin={plugin([])} onResult={vi.fn()} onClose={vi.fn()} />);
    const f = container.querySelector('iframe')!;
    expect(f.getAttribute('sandbox')).toBe('allow-scripts');
    expect(f.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(f.getAttribute('srcdoc')).toContain("default-src 'none'");
    expect(f.getAttribute('srcdoc')).toContain("connect-src 'none'");
    expect(f.hasAttribute('src')).toBe(false);
  });
  it('answers validated calls from ITS iframe only, and applies them to the document', async () => {
    const { container } = render(<PluginFrame plugin={plugin(['nodes:write'])} onResult={vi.fn()} onClose={vi.fn()} />);
    const win = container.querySelector('iframe')!.contentWindow!;
    const post = vi.spyOn(win, 'postMessage');
    const call = { sdd: 1, id: 7, method: 'createNodes', params: { nodes: [{ type: 'card', x: 1, y: 2, data: { label: 'From plugin' } }] } };
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: call, source: win })); });
    await waitFor(() => expect(useDiagramStore.getState().nodes).toHaveLength(1));
    expect(useDiagramStore.getState().nodes[0].data.label).toBe('From plugin');
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ sdd: 1, id: 7, ok: true }), '*');
    // one undo step
    act(() => useDiagramStore.getState().undo());
    expect(useDiagramStore.getState().nodes).toHaveLength(0);
  });
  it('ignores messages from other windows (another iframe, the page itself)', async () => {
    render(<PluginFrame plugin={plugin(['nodes:write'])} onResult={vi.fn()} onClose={vi.fn()} />);
    const evil = { sdd: 1, id: 1, method: 'createNodes', params: { nodes: [{ type: 'card', x: 0, y: 0 }] } };
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: evil, source: window })); window.dispatchEvent(new MessageEvent('message', { data: evil })); });
    expect(useDiagramStore.getState().nodes).toHaveLength(0);
  });
  it('rejects malicious payloads and missing permissions with an error reply, never a write', async () => {
    const { container } = render(<PluginFrame plugin={plugin(['nodes:read'])} onResult={vi.fn()} onClose={vi.fn()} />);
    const win = container.querySelector('iframe')!.contentWindow!;
    const post = vi.spyOn(win, 'postMessage');
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { sdd: 1, id: 1, method: 'createNodes', params: { nodes: [{ type: 'card', x: 0, y: 0 }] } }, source: win }));
      window.dispatchEvent(new MessageEvent('message', { data: { sdd: 1, id: 2, method: 'getNodes', params: '<script>' }, source: win }));
      window.dispatchEvent(new MessageEvent('message', { data: 'garbage', source: win }));
    });
    expect(useDiagramStore.getState().nodes).toHaveLength(0);
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ id: 1, ok: false, error: expect.objectContaining({ code: 'permission_denied' }) }), '*');
  });
  it('the ready event starts the plugin and a result event reports back', async () => {
    const onResult = vi.fn();
    const { container } = render(<PluginFrame plugin={plugin([])} args={{ a: 1 }} onResult={onResult} onClose={vi.fn()} />);
    const win = container.querySelector('iframe')!.contentWindow!;
    const post = vi.spyOn(win, 'postMessage');
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: { sdd: 1, event: 'ready' }, source: win })); });
    expect(post).toHaveBeenCalledWith({ sdd: 1, event: 'run', args: { a: 1 } }, '*');
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: { sdd: 1, event: 'result', ok: true, value: 'md' }, source: win })); });
    expect(onResult).toHaveBeenCalledWith({ ok: true, value: 'md', error: undefined });
  });
});

describe('PluginPanel', () => {
  it('renders nothing until opened; says so when no plugin is enabled; lists enabled ones with a Run button', () => {
    render(<PluginPanel />);
    expect(screen.queryByRole('dialog', { name: 'Plugins' })).toBeNull();
    act(() => useUiStore.getState().setDesign({ pluginsOpen: true }));
    expect(screen.getByText(/No plugins enabled/)).toBeTruthy();
    act(() => { usePlugins.getState().install({ name: 'Hello', permissions: ['notify'], code: '' }); });
    expect(screen.getByRole('button', { name: 'Run Hello' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Run Hello' }));
    expect(document.querySelector('iframe[sandbox="allow-scripts"]')).toBeTruthy();
  });
});
