import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, XIcon } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Wordmark } from "@/app/layout/Logo";
import { track } from "@/shared/analytics";
import { publicConfigQuery } from "@/shared/config";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Field, inputCls as input, PasswordInput as Password, ServerError } from "@/shared/ui/form";
import { Lens } from "@/shared/ui/modal";
import { Turnstile } from "@/shared/ui/turnstile";
import { authDialog, useAuthDialog } from "../application/authDialog";
import { useLogin, useLoginMfa, useRegister } from "../application/session";
import { type LoginInput, loginInputSchema, mfaInputSchema, type RegisterInput, registerInputSchema } from "../domain/account";
import { markSsoStarted } from "./SsoCallback";

const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z" />
    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.7-4.9H1.3v3.1A12 12 0 0 0 12 24Z" />
    <path fill="#FBBC05" d="M5.3 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.3a12 12 0 0 0 0 11l4-3.1Z" />
    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
  </svg>
);

const GitHubLogo = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
  </svg>
);

/** "Continue with Google / GitHub" for each social login the server enables; nothing renders when there is none. */
function SocialButtons() {
  const t = useT();
  const sso = useQuery(publicConfigQuery()).data?.sso;
  const providers = [
    { id: "google", label: "Google", on: sso?.google?.enabled, Logo: GoogleLogo },
    { id: "github", label: "GitHub", on: sso?.github?.enabled, Logo: GitHubLogo },
  ].filter((p) => p.on);
  if (providers.length === 0) return null;
  return (
    <div className="space-y-2 border-t border-line pt-4">
      {providers.map(({ id, label, Logo }) => (
        <Button key={id} asChild variant="outline" size="lg" className="w-full justify-center gap-2">
          <a href={`/api/auth/oauth/${id}/login`} onClick={markSsoStarted}>
            <Logo />
            {t("auth.continueWith").replace("{label}", label)}
          </a>
        </Button>
      ))}
    </div>
  );
}

function SignIn({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [mfa, setMfa] = useState<string | null>(null);
  const login = useLogin();
  const verify = useLoginMfa();
  const f = useForm<LoginInput>({ resolver: zodResolver(loginInputSchema), defaultValues: { login: "", password: "" } });
  const m = useForm<{ code: string }>({ resolver: zodResolver(mfaInputSchema), defaultValues: { code: "" } });
  if (mfa)
    return (
      <form noValidate className="space-y-4" onSubmit={m.handleSubmit((v) => verify.mutate({ mfaToken: mfa, code: v.code }, { onSuccess: onDone }))}>
        <ServerError error={verify.error} />
        <Field label={t("auth.code")} error={m.formState.errors.code?.message} hint={t("auth.mfaHint")}>
          {(a) => (
            <input
              {...a}
              className={cn(input, "h-9 font-mono text-[20px] tracking-[0.4em] tabular-nums")}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              {...m.register("code")}
            />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full justify-between" loading={verify.isPending}>
          {t("auth.verify")}
          <ArrowRightIcon className="size-4" aria-hidden />
        </Button>
      </form>
    );
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={f.handleSubmit((v) => login.mutate(v, { onSuccess: (r) => (r.kind === "mfa" ? setMfa(r.mfaToken) : onDone()) }))}
    >
      <ServerError error={login.error} />
      <Field label={t("auth.emailOrUsername")} error={f.formState.errors.login?.message}>
        {(a) => <input {...a} className={input} autoComplete="username" autoFocus {...f.register("login")} />}
      </Field>
      <Field label={t("auth.password")} error={f.formState.errors.password?.message}>
        {(a) => <Password {...a} autoComplete="current-password" {...f.register("password")} />}
      </Field>
      <Button type="submit" size="lg" className="w-full justify-between" loading={login.isPending}>
        {t("auth.signIn")}
        <ArrowRightIcon className="size-4" aria-hidden />
      </Button>
      <Link
        to="/forgot-password"
        onClick={() => authDialog.close()}
        className="block w-fit font-mono text-[12px] text-muted underline decoration-line-strong underline-offset-4 hover:text-fg"
      >
        {t("auth.forgot")}
      </Link>
      <SocialButtons />
    </form>
  );
}

function SignUp({ onDone }: { onDone: () => void }) {
  const t = useT();
  const reg = useRegister();
  const siteKey = useQuery(publicConfigQuery()).data?.captcha_site_key ?? "";
  const [captcha, setCaptcha] = useState("");
  const [captchaMissing, setCaptchaMissing] = useState(false);
  const [website, setWebsite] = useState("");
  useEffect(() => track({ name: "signup_open" }), []);
  const f = useForm<RegisterInput>({ resolver: zodResolver(registerInputSchema), defaultValues: { username: "", email: "", password: "" } });
  const e = f.formState.errors;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={f.handleSubmit((v) => {
        if (siteKey && !captcha) {
          setCaptchaMissing(true);
          return;
        }
        reg.mutate({ ...v, captcha_token: captcha || undefined, website: website || undefined }, { onSuccess: onDone });
      })}
    >
      <ServerError error={reg.error} />
      <Field label={t("auth.username")} error={e.username?.message}>
        {(a) => <input {...a} className={input} autoComplete="username" autoFocus {...f.register("username")} />}
      </Field>
      <Field label={t("auth.email")} error={e.email?.message}>
        {(a) => <input {...a} type="email" className={input} autoComplete="email" {...f.register("email")} />}
      </Field>
      <Field label={t("auth.password")} error={e.password?.message}>
        {(a) => <Password {...a} autoComplete="new-password" {...f.register("password")} />}
      </Field>
      {/* Honeypot: hidden from people and assistive tech; bots fill it in. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute -left-[9999px] h-px w-px opacity-0"
        value={website}
        onChange={(ev) => setWebsite(ev.target.value)}
      />
      {siteKey ? (
        <div className="rounded-[var(--radius-sm)] border border-line p-2">
          <Turnstile
            siteKey={siteKey}
            onToken={(tok) => {
              setCaptcha(tok);
              if (tok) setCaptchaMissing(false);
            }}
          />
          {captchaMissing ? (
            <p role="alert" className="mt-1 font-mono text-[12px] text-danger">
              {t("auth.captchaRequired")}
            </p>
          ) : null}
        </div>
      ) : null}
      <Button type="submit" size="lg" className="w-full justify-between" loading={reg.isPending}>
        {t("auth.signUp")}
        <ArrowRightIcon className="size-4" aria-hidden />
      </Button>
      <SocialButtons />
    </form>
  );
}

function Agreement() {
  const t = useT();
  const [before, rest] = t("auth.agree").split("{terms}");
  const [middle, after] = (rest ?? "").split("{privacy}");
  const link = "underline decoration-line-strong underline-offset-4 hover:text-fg";
  return (
    <p className="mt-auto max-w-[380px] pt-8 font-mono text-[11px] leading-5 text-muted">
      {before}
      <Link to="/terms" className={link} onClick={() => authDialog.close()}>
        {t("legal.terms")}
      </Link>
      {middle}
      <Link to="/privacy" className={link} onClick={() => authDialog.close()}>
        {t("legal.privacy")}
      </Link>
      {after}
    </p>
  );
}

export function AuthDialog() {
  const t = useT();
  const mode = useAuthDialog();
  return (
    <Dialog.Root open={mode !== null} onOpenChange={(o) => !o && authDialog.close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay-fade fixed inset-0 z-50 bg-overlay" />
        <Dialog.Content className="dialog-pop fixed inset-0 z-50 grid grid-rows-[auto_1fr] overflow-y-auto bg-card md:inset-auto md:top-1/2 md:left-1/2 md:h-auto md:max-h-[calc(100dvh-2rem)] md:min-h-[600px] md:w-[960px] md:max-w-[calc(100vw-2rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:grid-cols-[320px_1fr] md:grid-rows-1 md:overflow-hidden md:rounded-[var(--radius-md)] md:border md:border-line-strong md:shadow-[6px_6px_0_0_var(--fg)]">
          <aside
            aria-hidden
            className="flex h-14 items-center gap-3 bg-inverse px-5 text-on-inverse md:h-auto md:flex-col md:items-stretch md:justify-between md:p-7"
          >
            <Wordmark className="text-[18px] [&>span:first-child]:bg-on-inverse [&>span:first-child]:text-inverse" />
            <ol className="hidden space-y-3 font-mono text-[12px] md:block">
              <li className="text-[11px] tracking-[0.12em] uppercase opacity-60">{mode === "signup" ? t("auth.specNew") : t("auth.specAccess")}</li>
              <li>
                <span className="opacity-60">01</span> {t("auth.spec1")}
              </li>
              <li>
                <span className="opacity-60">02</span> {t("auth.spec2")}
              </li>
              <li>
                <span className="opacity-60">03</span> {t("auth.spec3")}
              </li>
            </ol>
            <div className="hidden h-24 rounded-[var(--radius-sm)] opacity-20 [background:repeating-linear-gradient(-45deg,var(--on-inverse)_0_1px,transparent_1px_8px)] md:block" />
          </aside>
          <div className="relative flex flex-col px-6 py-8 md:overflow-y-auto md:px-12 md:py-10">
            <div className="flex items-center justify-between gap-3">
              <Lens
                label={t("auth.account")}
                value={mode === "signup" ? "signup" : "signin"}
                onChange={(v) => authDialog.open(v)}
                items={[
                  ["signin", t("auth.signIn")],
                  ["signup", t("auth.createOne")],
                ]}
              />
              <Dialog.Close asChild>
                <Button variant="ghost-icon" aria-label={t("auth.close")}>
                  <XIcon aria-hidden />
                </Button>
              </Dialog.Close>
            </div>
            <Dialog.Title className="mt-8 font-display text-[26px] leading-8 font-bold tracking-[-0.03em]">
              {mode === "signup" ? t("auth.join") : t("auth.welcomeBack")}
            </Dialog.Title>
            <Dialog.Description className="sr-only">{mode === "signup" ? t("auth.createAccount") : t("auth.signInToAccount")}</Dialog.Description>
            <div className="mt-6 w-full max-w-[380px]">{mode === "signup" ? <SignUp onDone={authDialog.close} /> : <SignIn onDone={authDialog.close} />}</div>
            <Agreement />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
