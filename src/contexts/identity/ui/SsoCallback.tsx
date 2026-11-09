import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { tokens } from "@/shared/api";
import { useT } from "@/shared/i18n";
import { Loading } from "@/shared/ui/states";

/** What /api/auth/oidc/callback put in the URL fragment (never the query, so it is not sent to any server or logged). */
export function parseSsoFragment(hash: string): { token: string; expiresAt: string } | { error: string } {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const token = p.get("token");
  if (token) return { token, expiresAt: p.get("expires_at") ?? "" };
  return { error: p.get("error") ?? "failed" };
}

const SSO_PENDING = "iwillbegoogler.sso.pending";
const SSO_MAX_AGE_MS = 10 * 60 * 1000;

/** Remember (this tab only) that the user started a social login, so the callback accepts only a token it asked for. */
export function markSsoStarted() {
  try {
    sessionStorage.setItem(SSO_PENDING, String(Date.now()));
  } catch {
    /* storage blocked: the callback will refuse, the user can sign in with a password */
  }
}

/** True once per started login: a crafted #token link (login CSRF) opened in a tab that never started SSO is refused. */
export function takeSsoStarted(now = Date.now()): boolean {
  try {
    const at = Number(sessionStorage.getItem(SSO_PENDING));
    sessionStorage.removeItem(SSO_PENDING);
    return at > 0 && now - at < SSO_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/** Landing page of a single sign-on: store the token like a normal login, scrub it from the address bar, go home. */
export function SsoCallbackPage() {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [result] = useState(() => {
    const r = parseSsoFragment(window.location.hash);
    return "token" in r && !takeSsoStarted() ? { error: "failed" } : r;
  });
  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
    if (!("token" in result)) return;
    tokens.set({ token: result.token, expiresAt: result.expiresAt });
    void qc.invalidateQueries();
    void navigate({ to: "/", replace: true });
  }, [result, qc, navigate]);
  if ("token" in result) return <Loading>{null}</Loading>;
  const known = result.error === "unverified" ? "unverified" : "failed";
  return (
    <main id="main" className="mx-auto max-w-[400px] px-4 py-16 text-center md:py-24">
      <h1 className="font-display text-[26px] leading-8 font-bold tracking-tight">{t("auth.ssoFailedTitle")}</h1>
      <p role="alert" className="mt-4 text-sm text-muted">
        {t(`auth.sso.${known}` as "auth.sso.failed")}
      </p>
      <Link to="/" className="mt-6 inline-block underline decoration-line-strong underline-offset-4 hover:text-fg">
        {t("page.backHome")}
      </Link>
    </main>
  );
}
