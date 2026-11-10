import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '../../api/client';
import { api } from '../../api/api';
import type { Member, ShareLink, VersionMeta } from '../../api/types';
import { useDialogStore } from '../../lib/dialogs';
import { usePresence } from '../../sync/status';
import { useDiffStore } from '../../versions/diffStore';
import { useToastStore } from '../../store/toastStore';
import { DialogHost } from '../ui/DialogHost';
import { conflictDialog, shareDialog, ShareForm, versionsDialog, VersionsForm } from './syncDialogs';

beforeEach(() => {
  useDialogStore.getState().clear();
  usePresence.getState().set([]);
  useDiffStore.getState().clear();
});

const link = (o: Partial<ShareLink> = {}): ShareLink => ({ id: 'sh1', role: 'viewer', fileId: null, expiresAt: null, revokedAt: null, createdAt: Date.now(), createdBy: 'u1', ...o });
const member = (o: Partial<Member>): Member => ({ userId: 'u1', email: 'o@x.io', name: 'Owner', role: 'owner', isOriginalOwner: true, ...o });
const shareClient = (over = {}) => ({
  listShares: vi.fn(async () => [link()]),
  createShare: vi.fn(async () => ({ share: link({ id: 'sh2' }), token: 'tok123', url: 'x' })),
  revokeShare: vi.fn(async () => undefined),
  listMembers: vi.fn(async () => [member({}), member({ userId: 'u2', email: 'g@x.io', name: 'Grace', role: 'editor', isOriginalOwner: false })]),
  addMember: vi.fn(async () => member({})),
  setMemberRole: vi.fn(async () => undefined),
  removeMember: vi.fn(async () => undefined),
  ...over,
});
const noop = () => undefined;

describe('conflictDialog without author id and with unlabeled nodes', () => {
  it('falls back to the node id when a node has no label', async () => {
    render(<DialogHost />);
    const doc = (ids: string[]) => ({ version: 2, id: 'f', name: 'X', createdAt: 1, updatedAt: 1, activePageId: 'p', pages: [{ id: 'p', name: 'P', nodes: ids.map((id) => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: {} })), edges: [] }] }) as never;
    void conflictDialog({ name: 'X', mine: { updatedAt: 1, by: 'Me', doc: doc(['n-mine']) }, theirs: { updatedAt: Date.now(), by: 'Ann', version: 1, name: 'X', doc: doc(['n-theirs']) } });
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'View differences' }));
    expect(within(dialog).getByText(/\+ n-mine/)).toBeInTheDocument();
    expect(within(dialog).getByText(/− n-theirs/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hide differences' }));
    expect(dialog.querySelector('.conflict-diff')).toBeNull();
  });
  it('no diff link when a document is missing', async () => {
    render(<DialogHost />);
    void conflictDialog({ name: 'X', mine: { updatedAt: 1, by: 'Me' }, theirs: { updatedAt: Date.now(), by: 'Ann', byId: 'u9', version: 1, name: 'X' } });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'View differences' })).toBeNull();
  });
});

describe('ShareForm error and display branches', () => {
  it('a failing load shows a generic message for non-API errors and the message for API errors', async () => {
    const c = shareClient({ listShares: vi.fn(async () => { throw new Error('x'); }) });
    const { unmount } = render(<ShareForm projectId="p1" role="owner" client={c as never} done={noop} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    unmount();
    const c2 = shareClient({ listMembers: vi.fn(async () => { throw new ApiError(403, 'FORBIDDEN', 'Nope'); }) });
    render(<ShareForm projectId="p1" role="owner" client={c2 as never} done={noop} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Nope');
  });

  it('create failure shows the error; copy before a link exists is not possible', async () => {
    const c = shareClient({ createShare: vi.fn(async () => { throw new ApiError(500, 'BOOM', 'Server down'); }) });
    render(<ShareForm projectId="p1" role="owner" client={c as never} done={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Server down');
    expect(screen.queryByLabelText('Share link URL')).toBeNull();
  });

  it('copy writes to the clipboard and flips to Copied; a clipboard failure toasts', async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    useToastStore.setState({ toasts: [] } as never);
    render(<ShareForm projectId="p1" role="owner" client={shareClient() as never} done={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    const copyBtn = await screen.findByRole('button', { name: 'Copy' });
    fireEvent.click(copyBtn);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/s/tok123`);
    // create again resets the Copied state, then fail
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(JSON.stringify(useToastStore.getState())).toContain('Copy failed'));
  });

  it('a file link option without a file name shows just This file', () => {
    render(<ShareForm projectId="p1" fileId="f1" role="owner" client={shareClient() as never} done={noop} />);
    expect(screen.getByRole('option', { name: 'This file' })).toBeInTheDocument();
  });

  it('focusing the URL selects it', async () => {
    render(<ShareForm projectId="p1" role="owner" client={shareClient() as never} done={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    const input = (await screen.findByLabelText('Share link URL')) as HTMLInputElement;
    const sel = vi.spyOn(input, 'select');
    fireEvent.focus(input);
    expect(sel).toHaveBeenCalled();
  });

  it('describes file / project links, roles and expiry; revoke failure shows an error', async () => {
    const c = shareClient({
      listShares: vi.fn(async () => [
        link({ id: 'a', fileId: 'f1', role: 'editor', expiresAt: Date.now() + 86400000 }),
        link({ id: 'b', role: 'commenter' }),
        link({ id: 'c', role: 'viewer' }),
        link({ id: 'd', revokedAt: 5 }),
      ]),
      revokeShare: vi.fn(async () => { throw new ApiError(500, 'X', 'cannot revoke'); }),
    });
    render(<ShareForm projectId="p1" role="owner" client={c as never} done={noop} />);
    const list = await screen.findByRole('list', { name: 'Active links' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(3));
    const [a, b, cc] = within(list).getAllByRole('listitem');
    expect(a).toHaveTextContent(/File link · Can edit .*expires/);
    expect(b).toHaveTextContent('Project link · Can comment');
    expect(b).not.toHaveTextContent('expires');
    expect(cc).toHaveTextContent('Project link · Can view');
    fireEvent.click(within(a).getByRole('button', { name: /Revoke editor link/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot revoke');
  });

  it('presence: counts people by user or client id, falls back to Guest', async () => {
    usePresence.getState().set([{ clientId: 'c1', name: '', role: 'viewer' }, { clientId: 'c2', userId: 'u2', name: 'Grace', role: 'editor' }, { clientId: 'c3', userId: 'u2', name: 'Grace', role: 'editor' }] as never);
    render(<ShareForm projectId="p1" role="owner" client={shareClient() as never} done={noop} />);
    expect(await screen.findByLabelText('Online now', { selector: 'p' })).toHaveTextContent('2 people are in this file now: Guest, Grace');
  });

  it('empty email submit does nothing; a generic add failure shows the generic error; Add is disabled', async () => {
    const c = shareClient({ addMember: vi.fn(async () => { throw new Error('x'); }) });
    render(<ShareForm projectId="p1" role="owner" client={c as never} done={noop} />);
    const email = screen.getByLabelText('Invite by email');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    fireEvent.submit(email.closest('form')!);
    expect(c.addMember).not.toHaveBeenCalled();
    fireEvent.change(email, { target: { value: ' a@b.c ' } });
    fireEvent.submit(email.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(c.addMember).toHaveBeenCalledWith('p1', 'a@b.c', 'editor');
    // ApiError with another code uses its message
    c.addMember.mockRejectedValueOnce(new ApiError(409, 'DUP', 'Already a member'));
    fireEvent.submit(email.closest('form')!);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Already a member'));
  });

  it('role change and remove failures surface; original owner / non-owner see a badge', async () => {
    const c = shareClient({
      setMemberRole: vi.fn(async () => { throw new ApiError(400, 'X', 'role refused'); }),
      removeMember: vi.fn(async () => { throw new ApiError(400, 'X', 'remove refused'); }),
    });
    render(<ShareForm projectId="p1" role="owner" client={c as never} done={noop} />);
    fireEvent.change(await screen.findByLabelText('Role of g@x.io'), { target: { value: 'commenter' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('role refused');
    fireEvent.click(screen.getByRole('button', { name: 'Remove g@x.io' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('remove refused'));
    expect(screen.getAllByText('owner').length).toBeGreaterThan(0);
  });

  it('done button and the shareDialog wrapper', async () => {
    const done = vi.fn();
    const { unmount } = render(<ShareForm projectId="p1" role="viewer" client={shareClient() as never} done={done} />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(done).toHaveBeenCalled();
    unmount();
    expect(shareDialog).toBeTypeOf('function');
  });
});

const ver = (version: number, over: Partial<VersionMeta> = {}): VersionMeta => ({ version, name: 'P', label: null, createdBy: 'u1', createdAt: Date.now() - version * 60000, ...over });
const doc = (labels: string[], name = 'P', edges: { id: string; source: string; target: string }[] = []) =>
  ({ version: 2, id: 'f1', name, createdAt: 1, updatedAt: 1, activePageId: 'p', pages: [{ id: 'p', name: 'P', nodes: labels.map((l, i) => ({ id: l, type: 'icon', position: { x: i * 100, y: 0 }, data: { label: l } })), edges }] }) as never;

describe('VersionsForm error and edge branches', () => {
  it('a failing initial load shows the error and no loading text', async () => {
    const client = { listVersions: vi.fn(async () => { throw new ApiError(500, 'X', 'history down'); }), restoreVersion: vi.fn() };
    render(<VersionsForm fileId="f1" role="owner" currentVersion={1} client={client as never} restore={vi.fn()} done={noop} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('history down');
    expect(screen.queryByText('Loading history…')).toBeNull();
  });

  it('empty history, and a non-API error is generic', async () => {
    const client = { listVersions: vi.fn(async () => []), restoreVersion: vi.fn() };
    const { unmount } = render(<VersionsForm fileId="f1" role="owner" currentVersion={1} client={client as never} restore={vi.fn()} done={noop} />);
    expect(await screen.findByText('No earlier versions yet.')).toBeInTheDocument();
    unmount();
    const bad = { listVersions: vi.fn(async () => { throw new Error('x'); }), restoreVersion: vi.fn() };
    render(<VersionsForm fileId="f1" role="owner" currentVersion={1} client={bad as never} restore={vi.fn()} done={noop} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('unmounting before the list arrives does not update state', async () => {
    let resolve!: (v: VersionMeta[]) => void;
    const client = { listVersions: vi.fn(() => new Promise<VersionMeta[]>((r) => (resolve = r))), restoreVersion: vi.fn() };
    const err = vi.spyOn(console, 'error').mockImplementation(noop);
    const { unmount } = render(<VersionsForm fileId="f1" role="owner" currentVersion={1} client={client as never} restore={vi.fn()} done={noop} />);
    unmount();
    await act(async () => resolve([ver(1)]));
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('restore failure shows the error and re-enables buttons', async () => {
    const client = { listVersions: vi.fn(async () => [ver(1), ver(2)]), restoreVersion: vi.fn(async () => { throw new ApiError(500, 'X', 'restore broke'); }) };
    const done = vi.fn();
    render(<><VersionsForm fileId="f1" role="owner" currentVersion={2} client={client as never} restore={vi.fn()} done={done} /><DialogHost /></>);
    fireEvent.click(await screen.findByRole('button', { name: 'Restore version 1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('restore broke');
    expect(done).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Restore version 1' })).toBeEnabled();
  });

  const mk = (over: Record<string, unknown> = {}, getCurrent: (() => never) | null = () => doc(['A']) as never) => {
    const client = {
      listVersions: vi.fn(async () => [ver(1), ver(2, { label: 'named', named: true }), ver(3)]),
      restoreVersion: vi.fn(),
      saveNamedVersion: vi.fn(async (_id: string, name: string) => ({ ...ver(4), label: null as string | null, named: true, name })),
      getVersion: vi.fn(async (_id: string, v: number) => ({ ...ver(v), data: v === 1 ? doc(['A'], 'Old', [{ id: 'e1', source: 'A', target: 'A' }]) : doc(['A', 'B'], 'New') })),
      ...over,
    };
    const done = vi.fn();
    const onTimeline = vi.fn();
    render(<VersionsForm fileId="f1" role="owner" currentVersion={3} client={client as never} restore={vi.fn()} getCurrent={getCurrent ?? undefined} onTimeline={onTimeline} done={done} />);
    return { client, done, onTimeline };
  };

  it('saving with a blank name through the form does nothing; save falls back to the typed name; failure shows error', async () => {
    const { client } = mk();
    await screen.findByRole('list', { name: 'Versions' });
    const input = screen.getByLabelText('Version name');
    fireEvent.submit(input.closest('form')!);
    expect(client.saveNamedVersion).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '  Beta  ' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(client.saveNamedVersion).toHaveBeenCalledWith('f1', 'Beta'));
    client.saveNamedVersion.mockRejectedValueOnce(new ApiError(500, 'X', 'save failed'));
    fireEvent.change(input, { target: { value: 'Gamma' } });
    fireEvent.submit(input.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('save failed');
  });

  it('comparing against current without getCurrent reports it', async () => {
    mk({}, null);
    fireEvent.click(await screen.findByRole('button', { name: 'Compare version 1 with current' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.queryByRole('list', { name: 'Differences' })).toBeNull();
  });

  it('a failing getVersion clears the diff and reports the API error', async () => {
    const { client } = mk();
    fireEvent.click(await screen.findByRole('button', { name: 'Compare version 1 with current' }));
    await screen.findByRole('list', { name: 'Differences' });
    client.getVersion.mockRejectedValueOnce(new ApiError(404, 'X', 'version gone'));
    fireEvent.click(screen.getByRole('button', { name: 'Compare version 2 with current' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('version gone');
    expect(screen.queryByRole('list', { name: 'Differences' })).toBeNull();
  });

  it('diff lists a rename and edge changes; named versions show their label in the pickers', async () => {
    mk();
    await screen.findByRole('list', { name: 'Versions' });
    fireEvent.change(screen.getByLabelText('Compare from'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Compare to'), { target: { value: '2' } });
    expect(within(screen.getByLabelText('Compare to')).getByRole('option', { name: 'Version 2 · named' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Compare' }).at(-1)!);
    const list = await screen.findByRole('list', { name: 'Differences' });
    expect(list).toHaveTextContent('Renamed “Old” → “New”');
    expect(list).toHaveTextContent('Connections: 0 added, 1 removed, 0 changed');
    expect(list).toHaveTextContent('+ B');
  });

  it('Compare button stays disabled for from === to and Open timeline is offered', async () => {
    const { onTimeline } = mk();
    await screen.findByRole('list', { name: 'Versions' });
    fireEvent.change(screen.getByLabelText('Compare from'), { target: { value: 'current' } });
    expect(screen.getAllByRole('button', { name: 'Compare' }).at(-1)).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Open timeline' }));
    expect(onTimeline).toHaveBeenCalled();
  });
});

describe('versionsDialog wrapper', () => {
  it('opens the history dialog; the timeline button closes it and calls back', async () => {
    render(<DialogHost />);
    const onTimeline = vi.fn();
    vi.spyOn(api, 'listVersions').mockResolvedValue([ver(1)]);
    const p = versionsDialog('f1', 'owner', 1, vi.fn(), undefined, onTimeline);
    const dialog = await screen.findByRole('dialog', { name: 'Version history' });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Open timeline' }));
    await expect(p).resolves.toBe(true);
    expect(onTimeline).toHaveBeenCalled();
  });
  it('plain dialog without timeline callback hides the timeline button', async () => {
    render(<DialogHost />);
    vi.spyOn(api, 'listVersions').mockResolvedValue([]);
    void versionsDialog('f1', 'viewer', 1, vi.fn());
    const dialog = await screen.findByRole('dialog', { name: 'Version history' });
    expect(within(dialog).queryByRole('button', { name: 'Open timeline' })).toBeNull();
  });
});
