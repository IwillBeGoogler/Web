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

/** Landing page of a single sign-on: store the token like a normal login, scrub it from the address bar, go home. */
export function SsoCallbackPage() {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [result] = useState(() => parseSsoFragment(window.location.hash));
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
