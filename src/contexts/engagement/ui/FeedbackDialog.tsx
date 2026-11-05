import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useToken } from "@/contexts/identity/application/session";
import { publicConfigQuery } from "@/shared/config";
import { type MessageKey, useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Field, inputCls } from "@/shared/ui/form";
import { Lens, Modal } from "@/shared/ui/modal";
import { toast } from "@/shared/ui/toast";
import { Turnstile } from "@/shared/ui/turnstile";
import { feedbackDialog, useFeedbackDialog } from "../application/feedbackDialog";
import { useSendFeedback } from "../application/hooks";
import { FEEDBACK_MAX, type FeedbackInput, feedbackKinds, feedbackSchema, pageAddress } from "../domain/feedback";

/**
 * Bug reports and ideas, from any page, signed in or not. Opened with `feedbackDialog.open()`;
 * the text stays in the form until it has been sent.
 */
export function FeedbackDialog() {
  const t = useT();
  const req = useFeedbackDialog();
  const anonymous = !useToken();
  const siteKey = useQuery({ ...publicConfigQuery(), enabled: anonymous && !!req }).data?.captcha_site_key;
  const send = useSendFeedback();
  const f = useForm<FeedbackInput>({ resolver: zodResolver(feedbackSchema), defaultValues: { kind: "bug", message: "", email: "" } });
  const kind = useWatch({ control: f.control, name: "kind" });
  const message = useWatch({ control: f.control, name: "message" });
  const [website, setWebsite] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaMissing, setCaptchaMissing] = useState(false);
  const [widget, setWidget] = useState(0);
  const preset = req?.kind;
  useEffect(() => {
    if (preset) f.setValue("kind", preset);
  }, [preset, f]);
  const e = f.formState.errors;
  const msg = (m?: string) => (m ? t(m as MessageKey) : undefined);
  const needsCaptcha = anonymous && !!siteKey;
  const kindLabel: Record<(typeof feedbackKinds)[number], MessageKey> = { bug: "feedback.kind.bug", idea: "feedback.kind.idea", other: "feedback.kind.other" };
  return (
    <Modal
      open={!!req}
      onOpenChange={(o) => {
        if (!o) feedbackDialog.close();
      }}
      title={t("feedback.title")}
      description={t("feedback.description")}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={f.handleSubmit((v) => {
          if (needsCaptcha && !captcha) {
            setCaptchaMissing(true);
            return;
          }
          send.mutate(
            {
              kind: v.kind,
              message: v.message,
              ...(anonymous && v.email ? { contact_email: v.email } : {}),
              page_url: pageAddress(window.location.href),
              user_agent: navigator.userAgent,
              ...(req?.error ? { error_message: req.error.message, error_stack: req.error.stack } : {}),
              ...(needsCaptcha ? { captcha_token: captcha } : {}),
              website,
            },
            {
              onSuccess: () => {
                toast.ok(t("feedback.sent"));
                f.reset({ kind: "bug", message: "", email: "" });
                feedbackDialog.close();
              },
              onError: () => {
                toast.error(t("feedback.failed"));
                // a CAPTCHA token works once: ask for a fresh one
                setCaptcha("");
                setWidget((n) => n + 1);
              },
            },
          );
        })}
      >
        <Lens label={t("feedback.kind")} value={kind} onChange={(k) => f.setValue("kind", k)} items={feedbackKinds.map((k) => [k, t(kindLabel[k])])} />
        <Field label={t("feedback.message")} error={msg(e.message?.message)}>
          {(a) => (
            <textarea
              {...a}
              className={cn(inputCls, "h-auto min-h-28 resize-y py-1")}
              maxLength={FEEDBACK_MAX}
              placeholder={kind === "bug" ? t("feedback.placeholder.bug") : undefined}
              autoFocus
              {...f.register("message")}
            />
          )}
        </Field>
        {anonymous ? (
          <Field label={t("feedback.email")} error={msg(e.email?.message)} hint={t("feedback.emailHint")}>
            {(a) => <input {...a} type="email" className={inputCls} autoComplete="email" {...f.register("email")} />}
          </Field>
        ) : null}
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
        {needsCaptcha ? (
          <div className="rounded-[var(--radius-sm)] border border-line p-2">
            <Turnstile
              key={widget}
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
        <p className="font-mono text-[11px] break-all text-muted">
          {t(req?.error ? "feedback.attachedError" : "feedback.attached", { page: pageAddress(window.location.href) })}
        </p>
        <div className="flex items-center justify-between border-t border-line pt-4">
          <span className="font-mono text-[11px] text-muted tabular-nums">
            {message.length}/{FEEDBACK_MAX}
          </span>
          <Button type="submit" variant="primary" loading={send.isPending}>
            {t("feedback.send")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
