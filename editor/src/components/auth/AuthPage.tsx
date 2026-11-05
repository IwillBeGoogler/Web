import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { api } from '../../api/api';
import { safeNext, useSession, type SessionApi } from '../../api/session';
import { navigate } from '../../lib/router';
import { HomeLink } from '../ui/HomeLink';
import { ThemeToggle } from '../ThemeToggle';
import { t } from '../../i18n';

const message = (e: unknown): string => {
  if (e instanceof ApiError) {
    if (e.isNetwork) return t('Cannot reach the server. Check your connection and try again.');
    if (e.code === 'INVALID_CREDENTIALS' || e.status === 401) return t('Wrong email or password.');
    if (e.code === 'EMAIL_TAKEN' || e.status === 409) return t('An account with this email already exists. Log in instead.');
    if (e.status === 429) return t('Too many attempts. Try again in {n} seconds.', { n: e.retryAfter ?? 60 });
    if (e.code === 'SIGNUP_DISABLED' || e.status === 403) return t('Sign-up is disabled on this server.');
    return e.message;
  }
  return t('Something went wrong. Try again.');
};

const SSO_ERRORS: Record<string, string> = {
  no_account: 'There is no account for your single sign-on address. Ask an administrator to invite you.',
  unverified: 'Your identity provider has not verified your e-mail address.',
  domain: 'Your e-mail domain may not sign in here.',
  failed: 'Single sign-on did not work. Try again, or use your password.',
};

/** /login and /register. `next` (query) is the path to return to; only same-origin paths are honoured. */
export function AuthPage({ mode, next, client = api }: { mode: 'login' | 'register'; next?: string | null; client?: SessionApi }) {
  const allowSignup = useSession((s) => s.allowSignup);
  const oidc = useSession((s) => s.oidc);
  const saml = useSession((s) => s.saml);
  const sso = [oidc, saml].filter((x): x is { label: string; loginUrl: string } => !!x);
  const ssoError = mode === 'login' ? new URLSearchParams(window.location.search).get('sso_error') : null;
  const login = useSession((s) => s.login);
  const register = useSession((s) => s.register);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(ssoError ? t(SSO_ERRORS[ssoError] ?? SSO_ERRORS.failed) : null);
  const isLogin = mode === 'login';
  const q = next ? `?next=${encodeURIComponent(next)}` : '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (isLogin) await login(client, email.trim(), password);
      else await register(client, email.trim(), password, name.trim() || undefined);
      navigate(safeNext(next), { replace: true });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  if (!isLogin && !allowSignup) {
    return (
      <main className="auth">
        <div className="auth-card">
          <HomeLink size={26} wordmark />
          <h1>{t('Sign-up is closed')}</h1>
          <p className="muted">{t('This server does not accept new accounts. Ask an administrator for an invite.')}</p>
          <a href={`/login${q}`} onClick={(e) => { e.preventDefault(); navigate(`/login${q}`); }}>{t('Back to log in')}</a>
        </div>
      </main>
    );
  }
  return (
    <main className="auth">
      <div className="auth-theme"><ThemeToggle /></div>
      <form className="auth-card" onSubmit={(e) => void submit(e)} aria-labelledby="auth-h">
        <HomeLink size={26} wordmark />
        <h1 id="auth-h">{isLogin ? t('Log in') : t('Create your account')}</h1>
        {!isLogin && (
          <label className="dialog-field">
            <span>{t('Name')}</span>
            <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <label className="dialog-field">
          <span>{t('Email')}</span>
          <input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="dialog-field">
          <span>{t('Password')}</span>
          <input type="password" required minLength={isLogin ? 1 : 10} autoComplete={isLogin ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {!isLogin && <p className="muted auth-hint">{t('At least 10 characters.')}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>{busy ? t('Please wait…') : isLogin ? t('Log in') : t('Create account')}</button>
        {sso.map((p) => <a key={p.loginUrl} className="btn auth-sso" href={`${p.loginUrl}${q}`}>{t('Continue with {label}', { label: p.label })}</a>)}
        {isLogin ? (
          allowSignup && <p className="muted">{t('No account?')} <a href={`/register${q}`} onClick={(e) => { e.preventDefault(); navigate(`/register${q}`); }}>{t('Create one')}</a></p>
        ) : (
          <p className="muted">{t('Already have an account?')} <a href={`/login${q}`} onClick={(e) => { e.preventDefault(); navigate(`/login${q}`); }}>{t('Log in')}</a></p>
        )}
      </form>
    </main>
  );
}
