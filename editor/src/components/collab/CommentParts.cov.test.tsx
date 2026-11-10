import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Member } from '../../api/types';
import { formatMention } from '../../comments/logic';
import { CommentAvatar, CommentBody, Composer, timeAgo } from './CommentParts';

const members: Member[] = [
  { userId: 'u_ann', email: 'ann@x.y', name: 'Ann Lee', role: 'editor' },
  { userId: 'u_bob', email: 'bob@x.y', name: 'Bob Stone', role: 'viewer' },
];
const mount = (props: Partial<React.ComponentProps<typeof Composer>> = {}) => {
  const onSubmit = vi.fn(async () => undefined);
  render(<Composer placeholder="Say" submitLabel="Send" members={members} meId="me" onSubmit={onSubmit} {...props} />);
  return { onSubmit, ta: screen.getByLabelText('Say') as HTMLTextAreaElement };
};
const type = (ta: HTMLTextAreaElement, value: string) => fireEvent.change(ta, { target: { value, selectionStart: value.length } });

describe('CommentBody / avatar / timeAgo', () => {
  it('renders text and mention chips; chip is highlighted only for me', () => {
    render(<CommentBody meId="u_ann" body={`hi ${formatMention('Ann Lee', 'u_ann')} and ${formatMention('Bob', 'u_bob')}`} />);
    const chips = document.querySelectorAll('.mention-chip');
    expect(chips[0].classList.contains('me')).toBe(true);
    expect(chips[1].classList.contains('me')).toBe(false);
    expect(chips[1].getAttribute('data-user')).toBe('u_bob');
    expect(document.querySelector('.comment-text')!.textContent).toBe('hi @Ann Lee and @Bob');
  });
  it('avatar shows initials', () => {
    render(<CommentAvatar id="u1" name="Ann Lee" />);
    expect(document.body.textContent).toContain('AL');
  });
  it('timeAgo formats', () => { expect(typeof timeAgo(Date.now())).toBe('string'); });
});

describe('Composer keyboard + state', () => {
  it('ArrowUp / ArrowDown clamp, Tab picks, mention list closes when the text changes to no match', () => {
    const { ta } = mount();
    type(ta, '@');
    fireEvent.keyDown(ta, { key: 'ArrowDown' });
    fireEvent.keyDown(ta, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(ta, { key: 'ArrowUp' });
    fireEvent.keyDown(ta, { key: 'ArrowUp' });
    expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(ta, { key: 'Tab' });
    expect(ta.value).toContain('(user:u_ann)');
    type(ta, 'zz @qq');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
  it('select event moves the caret (null selectionStart falls back to 0)', () => {
    const { ta } = mount();
    type(ta, 'hi @a');
    fireEvent.select(ta, { target: { selectionStart: 0 } });
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.select(ta, { target: { selectionStart: 5 } });
    expect(screen.queryByRole('listbox')).not.toBeNull();
  });
  it('Esc closes the list first; second Esc cancels; Ctrl+Enter sends; plain Enter does nothing', async () => {
    const onCancel = vi.fn();
    const { ta, onSubmit } = mount({ onCancel });
    type(ta, '@');
    fireEvent.keyDown(ta, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.keyDown(ta, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    type(ta, 'plain');
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('plain'));
    await waitFor(() => expect(ta.value).toBe(''));
  });
  it('Esc without onCancel is a no-op; empty / whitespace text never sends', () => {
    const { ta, onSubmit } = mount();
    type(ta, '   ');
    fireEvent.keyDown(ta, { key: 'Escape' });
    fireEvent.keyDown(ta, { key: 'Enter', metaKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
  it('a second send while busy is ignored; non-Error rejection shows generic message; error clears on retry', async () => {
    let release!: () => void;
    const onSubmit = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((r) => { release = r; }))
      .mockRejectedValueOnce('nope')
      .mockResolvedValueOnce(undefined);
    const { ta } = mount({ onSubmit });
    type(ta, 'one');
    fireEvent.keyDown(ta, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(ta, { key: 'Enter', metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(ta.value).toBe(''));
    type(ta, 'two');
    fireEvent.keyDown(ta, { key: 'Enter', metaKey: true });
    expect((await screen.findByRole('alert')).textContent).toBe('Could not send');
    fireEvent.keyDown(ta, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
  it('initial text prefills; autoFocus marks the field', () => {
    const { ta } = mount({ initial: 'prefilled', autoFocus: true });
    expect(ta.value).toBe('prefilled');
    expect(ta.getAttribute('data-autofocus')).toBe('true');
  });
  it('browsers reporting a null selectionStart fall back to end-of-text / 0', () => {
    const { ta } = mount();
    Object.defineProperty(ta, 'selectionStart', { configurable: true, get: () => null });
    fireEvent.change(ta, { target: { value: 'hey @b' } });
    expect(screen.queryByRole('listbox')).not.toBeNull();
    fireEvent.select(ta);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
  it('mouse pick does nothing harmful when no query is active', () => {
    const { ta } = mount();
    type(ta, '@b');
    fireEvent.mouseDown(screen.getAllByRole('option')[0]);
    expect(ta.value).toContain('(user:u_bob)');
  });
});
