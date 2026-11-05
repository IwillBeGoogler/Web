import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '../../api/client';
import { useSession, type SessionApi } from '../../api/session';
import { AuthPage } from './AuthPage';

const user = { id: 'u1', email: 'a@b.co', name: 'A', isAdmin: false };
const fake = (over: Partial<SessionApi> = {}): SessionApi => ({
  authConfig: vi.fn(), me: vi.fn(), logout: vi.fn(),
  login: vi.fn(async () => user), register: vi.fn(async () => user), ...over,
});
const fill = (label: RegExp, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });

beforeEach(() => {
  useSession.getState().reset();
  useSession.setState({ mode: 'server', allowSignup: true, oidc: null, saml: null });
  window.history.replaceState({}, '', '/login');
});

describe('login', () => {
  it('logs in and goes to the sanitized next path', async () => {
    const c = fake();
    render(<AuthPage mode="login" next="/p/abc" client={c} />);
    fill(/Email/, 'a@b.co');
    fill(/Password/, 'secret-pass');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(window.location.pathname).toBe('/p/abc'));
    expect(c.login).toHaveBeenCalledWith('a@b.co', 'secret-pass');
    expect(useSession.getState().user?.id).toBe('u1');
  });
  it('ignores an off-site next', async () => {
    render(<AuthPage mode="login" next="//evil.com" client={fake()} />);
    fill(/Email/, 'a@b.co');
    fill(/Password/, 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(window.location.pathname).toBe('/projects'));
  });
  it('shows a friendly error for bad credentials and stays put', async () => {
    const c = fake({ login: vi.fn(async () => { throw new ApiError(401, 'INVALID_CREDENTIALS', 'nope'); }) });
    render(<AuthPage mode="login" client={c} />);
    fill(/Email/, 'a@b.co');
    fill(/Password/, 'bad');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password');
    expect(window.location.pathname).toBe('/login');
  });
  it('network failure message', async () => {
    const c = fake({ login: vi.fn(async () => { throw new ApiError(0, 'NETWORK', 'x'); }) });
    render(<AuthPage mode="login" client={c} />);
    fill(/Email/, 'a@b.co');
    fill(/Password/, 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  });
  it('hides the create-account link when signup is disabled', () => {
    useSession.setState({ allowSignup: false });
    render(<AuthPage mode="login" client={fake()} />);
    expect(screen.queryByText('Create one')).toBeNull();
  });
});

describe('register', () => {
  it('registers with name and goes to the app', async () => {
    const c = fake();
    render(<AuthPage mode="register" client={c} />);
    fill(/Name/, 'Ada');
    fill(/Email/, 'a@b.co');
    fill(/Password/, 'long-enough-1');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(window.location.pathname).toBe('/projects'));
    expect(c.register).toHaveBeenCalledWith('a@b.co', 'long-enough-1', 'Ada');
  });
  it('is closed when ALLOW_SIGNUP is off', () => {
    useSession.setState({ allowSignup: false });
    render(<AuthPage mode="register" client={fake()} />);
    expect(screen.getByText('Sign-up is closed')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Password/)).toBeNull();
  });
  it('shows email-taken error', async () => {
    const c = fake({ register: vi.fn(async () => { throw new ApiError(409, 'EMAIL_TAKEN', 'dup'); }) });
    render(<AuthPage mode="register" client={c} />);
    fill(/Email/, 'a@b.co');
    fill(/Password/, 'long-enough-1');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  });
});

describe('single sign-on', () => {
  it('shows nothing when the server has no SSO', () => {
    render(<AuthPage mode="login" client={fake()} />);
    expect(screen.queryByRole('link', { name: /Continue with/ })).toBeNull();
  });
  it('offers the identity provider and keeps the next path', () => {
    useSession.setState({ oidc: { label: 'Acme SSO', loginUrl: '/api/auth/oidc/login' } });
    render(<AuthPage mode="login" next="/p/abc" client={fake()} />);
    const link = screen.getByRole('link', { name: 'Continue with Acme SSO' });
    expect(link).toHaveAttribute('href', '/api/auth/oidc/login?next=%2Fp%2Fabc');
  });
  it('offers SAML next to OIDC', () => {
    useSession.setState({ oidc: { label: 'Acme SSO', loginUrl: '/api/auth/oidc/login' }, saml: { label: 'Okta', loginUrl: '/api/auth/saml/login' } });
    render(<AuthPage mode="login" client={fake()} />);
    expect(screen.getByRole('link', { name: 'Continue with Acme SSO' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue with Okta' })).toHaveAttribute('href', '/api/auth/saml/login');
  });
  it('explains why a sign-in was refused (?sso_error=)', () => {
    useSession.setState({ oidc: { label: 'SSO', loginUrl: '/api/auth/oidc/login' } });
    window.history.replaceState({}, '', '/login?sso_error=no_account');
    render(<AuthPage mode="login" client={fake()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/no account/i);
  });
});
