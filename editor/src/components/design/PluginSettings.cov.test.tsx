import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlugins } from '../../lib/plugins/store';
import { SAMPLE_PLUGINS } from '../../lib/plugins/samples';
import { useToastStore } from '../../store/toastStore';
import { PluginSettings } from './PluginSettings';

const manifest = { name: 'Mine', version: '2.0.0', permissions: ['notify'], code: 'function run(){}' };
const msgs = () => useToastStore.getState().toasts.map((t) => t.message);

beforeEach(() => { localStorage.clear(); usePlugins.getState().reset(); useToastStore.getState().clear(); });
afterEach(() => vi.unstubAllGlobals());

describe('PluginSettings', () => {
  it('empty state lists all samples; installing one shows toast and removes it from samples', () => {
    render(<PluginSettings />);
    expect(screen.getByText('None installed.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `+ ${SAMPLE_PLUGINS[0].name}` }));
    expect(usePlugins.getState().plugins).toHaveLength(1);
    expect(msgs().some((m) => m.includes(SAMPLE_PLUGINS[0].name))).toBe(true);
    expect(screen.queryByRole('button', { name: `+ ${SAMPLE_PLUGINS[0].name}` })).toBeNull();
    expect(screen.getByRole('checkbox', { name: `Enable ${SAMPLE_PLUGINS[0].name}` })).toBeTruthy();
  });
  it('hides samples section when all installed; toggles, shows perms, removes', () => {
    for (const s of SAMPLE_PLUGINS) usePlugins.getState().install(s);
    usePlugins.getState().install({ name: 'Bare', permissions: [], code: 'x' });
    const { container } = render(<PluginSettings />);
    expect(container.querySelector('.plugin-samples')).toBeNull();
    expect(screen.getByText('no permissions')).toBeTruthy();
    const cb = screen.getByRole('checkbox', { name: 'Enable Bare' }) as HTMLInputElement;
    fireEvent.click(cb);
    expect(usePlugins.getState().plugins.find((p) => p.name === 'Bare')!.enabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bare' }));
    expect(usePlugins.getState().plugins.some((p) => p.name === 'Bare')).toBe(false);
  });
  it('hydrates from localStorage on mount', () => {
    usePlugins.getState().install(manifest);
    usePlugins.setState({ plugins: [] });
    render(<PluginSettings />);
    expect(screen.getByText('Mine')).toBeTruthy();
  });
  it('install from URL: disabled until typed; success toast, input cleared', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest })));
    render(<PluginSettings />);
    const btn = screen.getByRole('button', { name: 'Install from URL' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    const input = screen.getByLabelText('Plugin manifest URL') as HTMLInputElement;
    fireEvent.change(input, { target: { value: ' https://x.io/m.json ' } });
    expect(btn.disabled).toBe(false);
    await act(async () => void fireEvent.click(btn));
    await waitFor(() => expect(usePlugins.getState().plugins.map((p) => p.name)).toContain('Mine'));
    expect(input.value).toBe('');
  });
  it('install from non-https URL reports error toast', async () => {
    render(<PluginSettings />);
    fireEvent.change(screen.getByLabelText('Plugin manifest URL'), { target: { value: 'http://x.io/m' } });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Install from URL' })));
    expect(msgs()).toContain('Only https URLs can be installed');
  });
  it('file button opens picker; chosen file installs; bad JSON errors; no file ignored', async () => {
    render(<PluginSettings />);
    const input = screen.getByLabelText('Plugin manifest file') as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Install from file…' }));
    expect(click).toHaveBeenCalled();
    const file = (txt: string) => ({ text: async () => txt });
    await act(async () => void fireEvent.change(input, { target: { files: [file(JSON.stringify(manifest))] } }));
    await waitFor(() => expect(usePlugins.getState().plugins).toHaveLength(1));
    await act(async () => void fireEvent.change(input, { target: { files: [file('{nope')] } }));
    await waitFor(() => expect(msgs()).toContain('Not valid JSON'));
    const n = msgs().length;
    await act(async () => void fireEvent.change(input, { target: { files: [] } }));
    expect(msgs()).toHaveLength(n);
  });
});
