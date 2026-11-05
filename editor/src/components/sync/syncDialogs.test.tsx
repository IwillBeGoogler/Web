import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '../../api/client';
import type { Member, ShareLink, VersionMeta } from '../../api/types';
import { useDialogStore } from '../../lib/dialogs';
import { usePresence } from '../../sync/status';
import { useDiffStore } from '../../versions/diffStore';
import { DialogHost } from '../ui/DialogHost';
import { conflictDialog, shareUrl, ShareForm, VersionsForm } from './syncDialogs';

beforeEach(() => useDialogStore.getState().clear());

describe('conflictDialog', () => {
  const info = { name: 'Payments', mine: { updatedAt: 1, by: 'You' }, theirs: { updatedAt: Date.now() - 60000, by: 'Grace', version: 7, name: 'Payments' } };
  it.each([['Keep mine', 'mine'], ['Take theirs', 'theirs'], ['Save as copy', 'copy']] as const)('choosing "%s" then Apply resolves %s', async (label, value) => {
    render(<DialogHost />);
    const p = conflictDialog(info);
    expect(await screen.findByText(/Grace/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: label }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await expect(p).resolves.toBe(value);
  });
  it('"Decide later" resolves null; Keep mine is preselected', async () => {
    render(<DialogHost />);
    const p = conflictDialog(info);
    await screen.findByRole('button', { name: 'Keep mine' });
    expect(screen.getByRole('button', { name: 'Keep mine' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Decide later' }));
    await expect(p).resolves.toBeNull();
  });
  it('layout: the text comes first, then the option rows (each with an explanation), the footer sits OUTSIDE the scroll area; nothing overlaps', async () => {
    render(<DialogHost />);
    void conflictDialog(info);
    const dialog = await screen.findByRole('dialog', { name: 'This file changed on the server' });
    const scroll = dialog.querySelector('.choice-scroll')!;
    const foot = dialog.querySelector('.choice-foot')!;
    const msg = dialog.querySelector('.dialog-msg')!;
    const rows = dialog.querySelector('.choice-rows')!;
    expect(scroll.contains(msg) && scroll.contains(rows)).toBe(true);
    expect(msg.compareDocumentPosition(rows) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // body first
    expect(scroll.contains(foot)).toBe(false); // footer is not part of the scrolling body
    expect(scroll.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(foot.firstElementChild).toHaveTextContent('Decide later'); // ghost on the left
    expect(foot.lastElementChild).toHaveTextContent('Apply'); // primary on the right
    expect(within(dialog).getByText('Overwrite the server version with yours')).toBeInTheDocument();
    expect(within(dialog).getByText('Replace your changes with their version')).toBeInTheDocument();
    expect(within(dialog).getByText('Keep yours as a new file and load theirs here')).toBeInTheDocument();
    expect(dialog.querySelectorAll('.choice-icon')).toHaveLength(3);
    expect(dialog.querySelectorAll('.choice-row')).toHaveLength(3);
  });
  it('shows who changed it (avatar) and when, and "View differences" lists what differs', async () => {
    render(<DialogHost />);
    const doc = (labels: string[]) => ({ version: 2, id: 'f', name: 'Payments', createdAt: 1, updatedAt: 1, activePageId: 'p', pages: [{ id: 'p', name: 'P', nodes: labels.map((l) => ({ id: l, type: 'icon', position: { x: 0, y: 0 }, data: { label: l } })), edges: [] }] }) as never;
    void conflictDialog({ ...info, mine: { ...info.mine, doc: doc(['A', 'Mine']) }, theirs: { ...info.theirs, doc: doc(['A', 'Theirs']) } });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Grace')).toBeInTheDocument();
    expect(dialog.querySelector('.conflict-who .avatar')).toHaveTextContent('G');
    expect(dialog.querySelector('time')).toBeInTheDocument();
    expect(dialog.querySelector('.conflict-diff')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'View differences' }));
    const list = within(dialog).getByRole('list', { name: /Differences/ });
    expect(list).toHaveTextContent('1 added, 1 removed');
    expect(list).toHaveTextContent('Mine');
    expect(list).toHaveTextContent('Theirs');
  });
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

describe('ShareForm', () => {
  it('a file can be shared on its own or as the whole project', async () => {
    const c = shareClient();
    render(<ShareForm projectId="p1" fileId="f1" fileName="Billing" role="owner" client={c as never} done={() => undefined} />);
    expect(screen.getByRole('option', { name: 'This file: Billing' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(c.createShare).toHaveBeenCalledWith('p1', 'viewer', { expiresInSeconds: undefined, fileId: 'f1' }));
    fireEvent.change(screen.getByLabelText('Link scope'), { target: { value: 'project' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(c.createShare).toHaveBeenLastCalledWith('p1', 'viewer', { expiresInSeconds: undefined, fileId: undefined }));
  });
  it('shareUrl uses the SPA route', () => expect(shareUrl('abc', 'https://h.io')).toBe('https://h.io/s/abc'));
  it('creates a link with the chosen access and expiry and shows the URL', async () => {
    const c = shareClient();
    render(<ShareForm projectId="p1" role="owner" client={c as never} done={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Link access'), { target: { value: 'editor' } });
    fireEvent.change(screen.getByLabelText('Link expiry'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    const input = (await screen.findByLabelText('Share link URL')) as HTMLInputElement;
    expect(input.value).toBe(`${window.location.origin}/s/tok123`);
    expect(c.createShare).toHaveBeenCalledWith('p1', 'editor', { expiresInSeconds: 7 * 86400, fileId: undefined });
  });
  it('lists and revokes active links', async () => {
    const c = shareClient();
    render(<ShareForm projectId="p1" role="owner" client={c as never} done={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: /Revoke viewer link/ }));
    await waitFor(() => expect(c.revokeShare).toHaveBeenCalledWith('p1', 'sh1'));
    expect(await screen.findByText('No active links.')).toBeInTheDocument();
  });
  it('lists members, adds one, and explains an unknown email', async () => {
    const c = shareClient({ addMember: vi.fn(async () => { throw new ApiError(404, 'USER_NOT_FOUND', 'x'); }) });
    render(<ShareForm projectId="p1" role="owner" client={c as never} done={() => undefined} />);
    expect(await screen.findByText('Grace')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Invite by email'), { target: { value: 'new@x.io' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No account with that email');
    expect(c.addMember).toHaveBeenCalledWith('p1', 'new@x.io', 'editor');
  });
  it('changes a role and removes a member', async () => {
    const c = shareClient();
    render(<ShareForm projectId="p1" role="owner" client={c as never} done={() => undefined} />);
    fireEvent.change(await screen.findByLabelText('Role of g@x.io'), { target: { value: 'viewer' } });
    await waitFor(() => expect(c.setMemberRole).toHaveBeenCalledWith('p1', 'u2', 'viewer'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove g@x.io' }));
    await waitFor(() => expect(c.removeMember).toHaveBeenCalledWith('p1', 'u2'));
  });
  it('non-owners can only look', async () => {
    const c = shareClient();
    render(<ShareForm projectId="p1" role="editor" client={c as never} done={() => undefined} />);
    expect(await screen.findByText('Grace')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create link' })).toBeNull();
    expect(screen.queryByLabelText('Invite by email')).toBeNull();
    expect(c.listShares).not.toHaveBeenCalled();
  });
});

const ver = (version: number): VersionMeta => ({ version, name: 'P', label: version === 2 ? 'before refactor' : null, named: version === 2, createdBy: 'u1', createdAt: Date.now() - version * 60000 });
describe('VersionsForm', () => {
  const mk = (role: 'owner' | 'viewer' = 'owner') => {
    const client = { listVersions: vi.fn(async () => [ver(1), ver(2), ver(3)]), restoreVersion: vi.fn(async (_id: string, v: number) => ({ file: { id: 'f1' } as never, version: v + 10 })) };
    const restore = vi.fn();
    const done = vi.fn();
    render(<><VersionsForm fileId="f1" role={role} currentVersion={3} client={client as never} restore={restore} done={done} /><DialogHost /></>);
    return { client, restore, done };
  };
  it('lists newest first, marks the current one and restores after confirming', async () => {
    const { client, restore, done } = mk();
    const rows = await screen.findAllByText(/Version \d/);
    expect(rows.map((r) => r.textContent)).toEqual(['Version 3', 'Version 2', 'Version 1']);
    expect(screen.getByText(/current/)).toBeInTheDocument();
    expect(screen.getByText(/before refactor/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore version 3' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore version 2' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(client.restoreVersion).toHaveBeenCalledWith('f1', 2));
    await waitFor(() => expect(restore).toHaveBeenCalledWith({ file: { id: 'f1' }, version: 12 }));
    expect(done).toHaveBeenCalled();
  });
  it('cancelling the confirmation restores nothing', async () => {
    const { client } = mk();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore version 1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await Promise.resolve();
    expect(client.restoreVersion).not.toHaveBeenCalled();
  });
  it('offers the timeline when asked to, and closes the list for it', async () => {
    const client = { listVersions: vi.fn(async () => [ver(1)]), restoreVersion: vi.fn(), getVersion: vi.fn() };
    const onTimeline = vi.fn();
    render(<VersionsForm fileId="f1" role="owner" currentVersion={1} client={client as never} restore={vi.fn()} onTimeline={onTimeline} done={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open timeline' }));
    expect(onTimeline).toHaveBeenCalled();
  });
  it('viewers cannot restore', async () => {
    mk('viewer');
    await screen.findByText('Version 2');
    expect(screen.queryByRole('button', { name: /Restore version/ })).toBeNull();
  });
});


describe('VersionsForm: named versions and comparison', () => {
  const doc = (labels: string[]) => ({ version: 2, id: 'f1', name: 'P', createdAt: 1, updatedAt: 1, activePageId: 'p', pages: [{ id: 'p', name: 'P', nodes: labels.map((l, i) => ({ id: l, type: 'icon', position: { x: i * 100, y: 0 }, data: { label: l } })), edges: [] }] }) as never;
  const mk = (role: 'owner' | 'viewer' = 'owner') => {
    const client = {
      listVersions: vi.fn(async () => [ver(1), ver(2), ver(3)]),
      restoreVersion: vi.fn(),
      saveNamedVersion: vi.fn(async (_id: string, name: string) => ({ ...ver(4), label: name, named: true })),
      getVersion: vi.fn(async (_id: string, v: number) => ({ ...ver(v), data: v === 1 ? doc(['A']) : doc(['A', 'B']) })),
    };
    const done = vi.fn();
    render(<VersionsForm fileId="f1" role={role} currentVersion={3} client={client as never} restore={vi.fn()} getCurrent={() => doc(['A', 'B', 'C'])} done={done} />);
    return { client, done };
  };
  beforeEach(() => useDiffStore.getState().clear());

  it('"Save version" names the current state, clears the field and reloads the list; named versions carry a star', async () => {
    const { client } = mk();
    await screen.findByRole('list', { name: 'Versions' });
    await screen.findByRole('button', { name: 'Compare version 3 with current' });
    expect(screen.getAllByLabelText('Named version')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Version name'), { target: { value: 'Release 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save version' }));
    await waitFor(() => expect(client.saveNamedVersion).toHaveBeenCalledWith('f1', 'Release 1'));
    await waitFor(() => expect(client.listVersions).toHaveBeenCalledTimes(2));
    expect((screen.getByLabelText('Version name') as HTMLInputElement).value).toBe('');
  });
  it('an empty name cannot be saved; viewers cannot save at all', async () => {
    mk();
    expect(screen.getByRole('button', { name: 'Save version' })).toBeDisabled();
  });
  it('viewers see no save form', async () => {
    mk('viewer');
    await screen.findByRole('list', { name: 'Versions' });
    expect(screen.queryByLabelText('Version name')).toBeNull();
  });
  it('Compare (version vs current) lists added / removed / changed and can show it on the canvas', async () => {
    const { done } = mk();
    fireEvent.click(await screen.findByRole('button', { name: 'Compare version 1 with current' }));
    const list = await screen.findByRole('list', { name: 'Differences' });
    expect(list).toHaveTextContent('v1 → Current: 2 added');
    expect(list).toHaveTextContent('+ B');
    expect(list).toHaveTextContent('+ C');
    fireEvent.click(screen.getByRole('button', { name: 'Show on canvas' }));
    expect(useDiffStore.getState().diff?.nodes.added.map((n) => n.id)).toEqual(['B', 'C']);
    expect(useDiffStore.getState().from).toBe('v1');
    expect(useDiffStore.getState().to).toBe('Current');
    expect(done).toHaveBeenCalled();
  });
  it('compare any two versions with the pickers', async () => {
    mk();
    await screen.findByRole('list', { name: 'Versions' });
    await screen.findByRole('button', { name: 'Compare version 3 with current' });
    fireEvent.change(screen.getByLabelText('Compare from'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Compare to'), { target: { value: '1' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Compare' }).at(-1)!);
    const list = await screen.findByRole('list', { name: 'Differences' });
    expect(list).toHaveTextContent('v2 → v1: 1 removed');
    expect(list).toHaveTextContent('− B');
  });
  it('identical versions: "No differences", nothing to show', async () => {
    mk();
    await screen.findByRole('list', { name: 'Versions' });
    await screen.findByRole('button', { name: 'Compare version 3 with current' });
    fireEvent.change(screen.getByLabelText('Compare from'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Compare to'), { target: { value: '3' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Compare' }).at(-1)!);
    expect(await screen.findByText(/No differences/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show on canvas' })).toBeNull();
  });
});

describe('ShareForm: who is online, commenter role', () => {
  it('marks members who are in the file now and summarises who is here', async () => {
    usePresence.getState().set([{ clientId: 'c1', userId: 'u2', name: 'Grace', role: 'editor' }, { clientId: 'c2', userId: 'u2', name: 'Grace', role: 'editor' }]);
    render(<ShareForm projectId="p1" role="owner" client={shareClient() as never} done={() => undefined} />);
    expect(await screen.findByText(/here now/)).toBeInTheDocument();
    const members = screen.getByRole('list', { name: 'Members' });
    expect(within(members).getAllByRole('img', { name: 'Online now' })).toHaveLength(1);
    expect(screen.getByLabelText('Online now', { selector: 'p' })).toHaveTextContent('1 person is in this file now: Grace');
    usePresence.getState().set([]);
  });
  it('links and members can be given the "comment" role', async () => {
    const c = shareClient();
    render(<ShareForm projectId="p1" role="owner" client={c as never} done={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Link access'), { target: { value: 'commenter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(c.createShare).toHaveBeenCalledWith('p1', 'commenter', expect.anything()));
    fireEvent.change(screen.getByLabelText('Member role'), { target: { value: 'commenter' } });
    fireEvent.change(screen.getByLabelText('Invite by email'), { target: { value: 'x@y.z' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(c.addMember).toHaveBeenCalledWith('p1', 'x@y.z', 'commenter'));
  });
});
