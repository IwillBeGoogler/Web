import { create } from 'zustand';
import type { ApiUser, AuthConfig } from './types';
import { ApiError } from './client';
import type { Route } from '../lib/router';

/** The slice of the API the session needs (a fake in tests). */
export interface SessionApi {
  authConfig: () => Promise<AuthConfig>;
  me: () => Promise<ApiUser>;
  login: (email: string, password: string) => Promise<ApiUser>;
  register: (email: string, password: string, name?: string) => Promise<ApiUser>;
  logout: () => Promise<void>;
}

export type Mode = 'checking' | 'local' | 'server';
interface SessionState {
  /** `checking` until the first `GET /auth/config` settles; `local` = backend unreachable (the app works fully offline) */
  mode: Mode;
  authMode: 'session' | 'none';
  allowSignup: boolean;
  /** the server offers live co-editing (Yjs) and audio rooms */
  collab: boolean;
  rtc: boolean;
  /** single sign-on offered by the server (OpenID Connect) */
  oidc: { label: string; loginUrl: string } | null;
  saml: { label: string; loginUrl: string } | null;
  user: ApiUser | null;
  lastCheckedAt: number | null;
  setUser: (u: ApiUser | null) => void;
  login: (api: SessionApi, email: string, password: string) => Promise<ApiUser>;
  register: (api: SessionApi, email: string, password: string, name?: string) => Promise<ApiUser>;
  logout: (api: SessionApi) => Promise<void>;
  reset: () => void;
}
const initial = { mode: 'checking' as Mode, authMode: 'session' as const, allowSignup: true, collab: false, rtc: false, oidc: null, saml: null, user: null, lastCheckedAt: null };

export const useSession = create<SessionState>((set) => ({
  ...initial,
  setUser: (user) => set({ user }),
  login: async (api, email, password) => {
    const user = await api.login(email, password);
    set({ user, mode: 'server' });
    return user;
  },
  register: async (api, email, password, name) => {
    const user = await api.register(email, password, name);
    set({ user, mode: 'server' });
    return user;
  },
  logout: async (api) => {
    try {
      await api.logout();
    } finally {
      set({ user: null });
    }
  },
  reset: () => set({ ...initial }),
}));

const isConfig = (c: unknown): c is AuthConfig => !!c && typeof c === 'object' && ((c as AuthConfig).authMode === 'session' || (c as AuthConfig).authMode === 'none');

/** Detect the backend (`GET /auth/config`). Any failure, or a non-JSON answer (SPA fallback, proxy 502), means local mode. */
export async function bootstrapSession(api: SessionApi): Promise<Mode> {
  let cfg: AuthConfig;
  try {
    const c = await api.authConfig();
    if (!isConfig(c)) throw new ApiError(0, 'NOT_A_SERVER', 'Unexpected response');
    cfg = c;
  } catch {
    useSession.setState({ mode: 'local', user: null, lastCheckedAt: Date.now() });
    return 'local';
  }
  let user: ApiUser | null = null;
  try {
    user = await api.me();
  } catch (e) {
    // 401 = anonymous. A network blip right after config succeeded keeps server mode with an unknown user.
    if (!(e instanceof ApiError)) user = null;
  }
  useSession.setState({ mode: 'server', authMode: cfg.authMode, allowSignup: cfg.allowSignup, collab: !!cfg.collab, rtc: !!cfg.rtc, oidc: cfg.oidc ?? null, saml: cfg.saml ?? null, user, lastCheckedAt: Date.now() });
  return 'server';
}

export const initials = (name: string, email = ''): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  const one = parts[0] ?? email;
  return (one[0] ?? '?').toUpperCase();
};

/** only same-origin paths ("/x", not "//host" or "https://...") */
export const safeNext = (next: string | null | undefined, fallback = '/projects'): string => (next && /^\/(?!\/)/.test(next) && !next.includes('\\') ? next : fallback);

type GuardState = Pick<SessionState, 'mode' | 'authMode' | 'user'>;
/** Where to send the visitor instead of showing `route`, or null. `pathWithSearch` is `location.pathname + location.search`. */
export function guardRedirect(route: Route, pathWithSearch: string, s: GuardState): string | null {
  if (s.mode !== 'server') return null;
  if (route.name === 'projects' || route.name === 'project' || route.name === 'file') {
    if (s.authMode === 'session' && !s.user) return `/login?next=${encodeURIComponent(pathWithSearch)}`;
    return null;
  }
  if (route.name === 'login' || route.name === 'register') {
    if (s.authMode === 'none' || s.user) return safeNext(new URLSearchParams(pathWithSearch.split('?')[1] ?? '').get('next'));
  }
  return null;
}
