import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChoice, useConfirm, useCustomDialog, usePrompt } from './useDialogs';
import { dialogs, useDialogStore } from '../lib/dialogs';

describe('useDialogs', () => {
  it('hooks return the matching dialog openers', () => {
    expect(renderHook(() => useConfirm()).result.current).toBe(dialogs.confirm);
    expect(renderHook(() => usePrompt()).result.current).toBe(dialogs.prompt);
    expect(renderHook(() => useChoice()).result.current).toBe(dialogs.choose);
    expect(renderHook(() => useCustomDialog()).result.current).toBe(dialogs.custom);
  });
  it('choice / custom enqueue a dialog and resolve with the chosen / cancel value', async () => {
    const choose = renderHook(() => useChoice()).result.current;
    const p = choose({ title: 'Pick', choices: [{ value: 1, label: 'One' }] });
    expect(useDialogStore.getState().stack[0].kind).toBe('choice');
    useDialogStore.getState().close(useDialogStore.getState().stack[0].id, 1);
    expect(await p).toBe(1);
    useDialogStore.getState().clear();
    const custom = renderHook(() => useCustomDialog()).result.current;
    const q = custom({ title: 'X', render: () => null } as never);
    expect(useDialogStore.getState().stack[0].kind).toBe('custom');
    useDialogStore.getState().clear();
    expect(await q).toBeNull();
  });
});
