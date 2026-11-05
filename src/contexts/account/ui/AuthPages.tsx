import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2Icon, MailIcon, XCircleIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useForm } from "react-hook-form";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { Button } from "@/shared/ui/button";
import { Field, inputCls, PasswordInput, ServerError } from "@/shared/ui/form";
import { Loading } from "@/shared/ui/states";
import { emailSchema, resetSchema } from "../domain/account";
import { accountSecurityRepository as repo } from "../infrastructure/accountSecurityRepository";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="main" className="mx-auto max-w-[400px] px-4 py-16 md:py-24">
      <h1 className="text-center font-display text-[30px] leading-9 font-bold tracking-tight">{title}</h1>
      <div className="mt-10">{children}</div>
    </main>
  );
}

function Result({ ok, title, body, action }: { ok: boolean; title: string; body: string; action?: ReactNode }) {
  const Icon = ok ? CheckCircle2Icon : XCircleIcon;
  return (
    <div role="status" className="text-center">
      <Icon className={`mx-auto size-10 ${ok ? "text-accent" : "text-danger"}`} aria-hidden />
      <h2 className="mt-4 text-xl font-bold">{title}</h2>
      <p className="mt-2 text-sm text-muted">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

const signInBtn = (
  <Button size="lg" onClick={() => authDialog.open("signin")}>
    Sign in
  </Button>
);

export function ForgotPasswordPage() {
  const m = useMutation({ mutationFn: (v: { email: string }) => repo.forgot(v.email) });
  const f = useForm({ resolver: zodResolver(emailSchema), defaultValues: { email: "" } });
  return (
    <Card title="Forgot your password?">
      {m.isSuccess ? (
        <Result ok title="Check your inbox" body="If an account uses that email, a reset link is on its way. It works for one hour." />
      ) : (
        <form noValidate className="space-y-4" onSubmit={f.handleSubmit((v) => m.mutate(v))}>
          <p className="text-sm text-muted">Enter the email on your account and we'll send you a link to reset your password.</p>
          <ServerError error={m.error} />
          <Field label="Email" error={f.formState.errors.email?.message}>
            {(a) => <input {...a} type="email" autoComplete="email" className={inputCls} {...f.register("email")} />}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={m.isPending}>
            <MailIcon className="size-4" aria-hidden /> Send reset link
          </Button>
        </form>
      )}
    </Card>
  );
}

export function ResetPasswordPage({ token }: { token: string }) {
  const m = useMutation({ mutationFn: (p: string) => repo.reset(token, p) });
  const f = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: "", confirm: "" } });
  if (!token)
    return (
      <Card title="Reset password">
        <Result ok={false} title="Link is incomplete" body="Open the link from the email again." />
      </Card>
    );
  return (
    <Card title="Choose a new password">
      {m.isSuccess ? (
        <Result ok title="Password changed" body="You were signed out everywhere. Sign in with your new password." action={signInBtn} />
      ) : (
        <form noValidate className="space-y-4" onSubmit={f.handleSubmit((v) => m.mutate(v.password))}>
          <ServerError error={m.error} />
          <Field label="New password" error={f.formState.errors.password?.message}>
            {(a) => <PasswordInput {...a} autoComplete="new-password" {...f.register("password")} />}
          </Field>
          <Field label="Confirm password" error={f.formState.errors.confirm?.message}>
            {(a) => <PasswordInput {...a} autoComplete="new-password" {...f.register("confirm")} />}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={m.isPending}>
            Set password
          </Button>
        </form>
      )}
    </Card>
  );
}

/** Runs a one-shot request from an emailed link as soon as the page opens. */
function useOnce(fn: () => Promise<void>, enabled: boolean) {
  const m = useMutation({ mutationFn: fn });
  const { mutate, isIdle } = m;
  useEffect(() => {
    if (enabled && isIdle) mutate();
  }, [enabled, isIdle, mutate]);
  return m;
}

export function VerifyEmailPage({ code }: { code: string }) {
  const m = useOnce(() => repo.verifyEmail(code), !!code);
  return (
    <Card title="Email verification">
      {!code || m.isError ? (
        <Result
          ok={false}
          title="This link doesn't work"
          body="It may have expired or already been used. Request a new one from Settings."
          action={
            <Link to="/me/settings" className="text-accent underline">
              Go to settings
            </Link>
          }
        />
      ) : m.isSuccess ? (
        <Result
          ok
          title="Email verified"
          body="Thanks! You can now subscribe to writers by email."
          action={
            <Link to="/" className="text-accent underline">
              Start reading
            </Link>
          }
        />
      ) : (
        <Loading>
          <p className="text-center text-muted">Verifying…</p>
        </Loading>
      )}
    </Card>
  );
}

export function UnsubscribePage({ s, a, sig }: { s: string; a: string; sig: string }) {
  const m = useOnce(() => repo.unsubscribe(s, a, sig), !!(s && a && sig));
  return (
    <Card title="Email preferences">
      {!(s && a && sig) || m.isError ? (
        <Result ok={false} title="This link doesn't work" body="Open the unsubscribe link from the email again." />
      ) : m.isSuccess ? (
        <Result ok title="You're unsubscribed" body="You won't get emails when this writer publishes." />
      ) : (
        <Loading>
          <p className="text-center text-muted">Updating…</p>
        </Loading>
      )}
    </Card>
  );
}
