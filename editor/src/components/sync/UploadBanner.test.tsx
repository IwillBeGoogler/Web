import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSession } from '../../api/session';
import { createWsProject } from '../../workspace/storage';
import { UploadBanner } from './UploadBanner';

beforeEach(() => {
  localStorage.clear();
  useSession.getState().reset();
  useSession.setState({ mode: 'server', authMode: 'session', user: { id: 'u', email: 'a@b.c', name: 'A', isAdmin: false } });
});

describe('UploadBanner', () => {
  it('hidden in local mode, when logged out, or with nothing local', () => {
    createWsProject(localStorage, 'A');
    useSession.setState({ mode: 'local' });
    const r = render(<UploadBanner upload={vi.fn()} />);
    expect(r.container).toBeEmptyDOMElement();
    useSession.setState({ mode: 'server', user: null });
    r.rerender(<UploadBanner upload={vi.fn()} />);
    expect(r.container).toBeEmptyDOMElement();
  });
  it('counts local-only projects and uploads all of them', async () => {
    const a = createWsProject(localStorage, 'A').project;
    const b = createWsProject(localStorage, 'B').project;
    const upload = vi.fn(async (_id: string) => undefined);
    const done = vi.fn();
    render(<UploadBanner upload={upload} onDone={done} />);
    expect(screen.getByText(/2 projects/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upload to server' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(upload.mock.calls.map((c) => c[0]).sort()).toEqual([a.id, b.id].sort());
  });
  it('Not now hides it until another local project appears', () => {
    createWsProject(localStorage, 'A');
    const r = render(<UploadBanner upload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(r.container).toBeEmptyDOMElement();
    r.unmount();
    render(<UploadBanner upload={vi.fn()} />);
    expect(screen.queryByRole('region')).toBeNull(); // remembered
    createWsProject(localStorage, 'B');
    r.unmount();
    render(<UploadBanner upload={vi.fn()} />);
    expect(screen.getByText(/2 projects/)).toBeInTheDocument();
  });
});
