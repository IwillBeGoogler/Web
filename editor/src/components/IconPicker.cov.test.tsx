import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { IconPicker } from './IconPicker';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useToastStore } from '../store/toastStore';
import { setAssetUploader, setAllowedIconMimes } from '../lib/sdd/assets';
import { ALL_ITEMS } from '../data/catalog';
import type { DiagramNode } from '../types';

const nd = (id: string, type: string): DiagramNode => ({ id, type, position: { x: 0, y: 0 }, width: 100, height: 80, data: { label: id } }) as DiagramNode;
const node = (id: string) => useDiagramStore.getState().nodes.find((n) => n.id === id)!;

beforeEach(() => {
  setAssetUploader(null);
  setAllowedIconMimes(null);
  useDiagramStore.getState().reset();
  useUiStore.getState().resetUi();
  useToastStore.getState().clear();
  act(() => useDiagramStore.getState().placeNodes([nd('n1', 'icon'), nd('g1', 'group')]));
});

describe('IconPicker', () => {
  it('is closed without a target', () => {
    render(<IconPicker />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('shows up to 120 icons and picking sets iconId and closes', () => {
    act(() => useUiStore.getState().setIconPicker('n1'));
    render(<IconPicker />);
    expect(document.querySelectorAll('.picker-grid .palette-item').length).toBe(120);
    const first = document.querySelector('.picker-grid .palette-item') as HTMLElement;
    const icon = ALL_ITEMS.find((i) => i.kind === 'icon')!;
    expect(first).toHaveAttribute('title', icon.label);
    fireEvent.click(first);
    expect(node('n1').data.iconId).toBe(icon.iconId);
    expect(useUiStore.getState().iconPickerFor).toBeNull();
  });
  it('group target writes groupIcon', () => {
    act(() => useUiStore.getState().setIconPicker('g1'));
    render(<IconPicker />);
    const icon = ALL_ITEMS.find((i) => i.kind === 'icon')!;
    fireEvent.click(document.querySelector('.picker-grid .palette-item')!);
    expect(node('g1').data.groupIcon).toBe(icon.iconId);
    expect(node('g1').data.iconId).toBeUndefined();
  });
  it('search filters by score; no match gives empty grid', () => {
    act(() => useUiStore.getState().setIconPicker('n1'));
    render(<IconPicker />);
    const target = ALL_ITEMS.find((i) => i.kind === 'icon')!;
    const input = screen.getByLabelText('Search icons');
    fireEvent.change(input, { target: { value: target.label } });
    const labels = Array.from(document.querySelectorAll('.picker-grid .palette-item')).map((b) => b.getAttribute('title'));
    expect(labels).toContain(target.label);
    expect(labels.length).toBeLessThan(120);
    fireEvent.change(input, { target: { value: 'zzqqxxnomatch' } });
    expect(document.querySelectorAll('.picker-grid .palette-item').length).toBe(0);
    fireEvent.change(input, { target: { value: '   ' } });
    expect(document.querySelectorAll('.picker-grid .palette-item').length).toBe(120);
  });
  it('uploads an image as an asset icon', async () => {
    act(() => useUiStore.getState().setIconPicker('n1'));
    render(<IconPicker />);
    const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], 'a.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Upload icon image'), { target: { files: [file] } });
    await waitFor(() => expect(useUiStore.getState().iconPickerFor).toBeNull());
    expect(String(node('n1').data.iconId)).toMatch(/^asset:/);
    expect(Object.keys(useDiagramStore.getState().assets).length).toBe(1);
  });
  it('upload with no file is ignored; bad mime toasts the error', async () => {
    act(() => useUiStore.getState().setIconPicker('n1'));
    render(<IconPicker />);
    const input = screen.getByLabelText('Upload icon image');
    fireEvent.change(input, { target: { files: [] } });
    expect(useUiStore.getState().iconPickerFor).toBe('n1');
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } });
    await waitFor(() => expect(useToastStore.getState().toasts.length).toBe(1));
    expect(useToastStore.getState().toasts[0].kind).toBe('error');
    expect(useUiStore.getState().iconPickerFor).toBe('n1');
  });
});
