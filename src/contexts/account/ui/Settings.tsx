import { zodResolver } from "@hookform/resolvers/zod";
import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CircleHelpIcon, MonitorIcon, ShieldCheckIcon, SmartphoneIcon, TabletIcon, TerminalIcon } from "lucide-react";
import QRCode from "qrcode";
import { type ReactNode, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { engagementRepository } from "@/contexts/engagement/infrastructure/engagementRepository";
import { useMe, useUpdateProfile } from "@/contexts/identity/application/session";
import { displayName } from "@/contexts/identity/domain/account";
import { readingPrefs } from "@/contexts/preferences/application/store";
import { ReadingControls } from "@/contexts/preferences/ui/ReadingPanel";
import type { Page } from "@/shared/http";
import { cn } from "@/shared/lib/cn";
import { timeAgo } from "@/shared/lib/format";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Field, inputCls, PasswordInput, ServerError } from "@/shared/ui/form";
import { Tabs } from "@/shared/ui/modal";
import { Bone } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";
import {
  accountKeys,
  blocksQuery,
  devicesQuery,
  followedTagsQuery,
  hiddenQuery,
  mfaQuery,
  mutesQuery,
  useChangePassword,
  useDeleteAccount,
  useHide,
  useInvalidate,
  useRelation,
  useSignOutEverywhere,
  useToggleTag,
} from "../application/hooks";
import { codeSchema, type DeviceKind, describeDevice, deviceKind, groupSecret, passwordChangeSchema, type UserSummary } from "../domain/account";
import { accountSecurityRepository as repo } from "../infrastructure/accountSecurityRepository";

const deviceIcon: Record<DeviceKind, typeof MonitorIcon> = {
  desktop: MonitorIcon,
  mobile: SmartphoneIcon,
  tablet: TabletIcon,
  cli: TerminalIcon,
  unknown: CircleHelpIcon,
};

const Section = ({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) => (
  <section className="border-b border-line py-8">
    <h2 className="text-base font-semibold">{title}</h2>
    {desc ? <p className="mt-1 text-sm text-muted">{desc}</p> : null}
    <div className="mt-5">{children}</div>
  </section>
);

function ProfileTab() {
  const { me } = useMe();
  const save = useUpdateProfile();
  const [form, setForm] = useState({ display_name: me?.display_name ?? "", bio: me?.bio ?? "", avatar_url: me?.avatar_url ?? "" });
  const [uploading, setUploading] = useState(false);
  const resend = useMutation({ mutationFn: repo.resendVerification, onSuccess: () => toast.ok("Verification email sent"), onError: toast.error });
  if (!me) return null;
  return (
    <>
      {!me.email_verified ? (
        <div role="status" className="mt-6 flex flex-wrap items-center gap-3 rounded bg-surface-2 p-4 text-sm">
          Your email {me.email ? <strong>{me.email}</strong> : null} isn't verified yet.
          <Button variant="link" className="text-sm" loading={resend.isPending} onClick={() => resend.mutate()}>
            Resend link
          </Button>
        </div>
      ) : null}
      <form
        className="max-w-md space-y-5 py-8"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form, { onSuccess: () => toast.ok("Profile saved"), onError: toast.error });
        }}
      >
        <div className="flex items-center gap-4">
          <Avatar name={form.display_name || displayName(me)} src={form.avatar_url} size="xl" />
          <div className="space-y-2">
            <label className="inline-flex h-9 cursor-pointer items-center rounded-full border border-fg px-4 text-sm hover:bg-surface-2">
              {uploading ? "Uploading…" : "Upload photo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 5 * 1024 * 1024) return toast.error("Image must be 5 MB or smaller.");
                  setUploading(true);
                  try {
                    setForm((v) => ({ ...v, avatar_url: "" }));
                    const url = await engagementRepository.upload(f);
                    setForm((v) => ({ ...v, avatar_url: url }));
                  } catch (x) {
                    toast.error(x);
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
            {form.avatar_url ? (
              <button type="button" className="block text-sm text-danger hover:underline" onClick={() => setForm({ ...form, avatar_url: "" })}>
                Remove
              </button>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-muted">@{me.username}</p>
        <Field label="Name" hint={`${form.display_name.length}/50`}>
          {(a) => (
            <input {...a} className={inputCls} maxLength={50} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          )}
        </Field>
        <Field label="Short bio" hint={`${form.bio.length}/160`}>
          {(a) => (
            <textarea
              {...a}
              className={cn(inputCls, "h-24 py-2")}
              maxLength={160}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          )}
        </Field>
        <Button type="submit" variant="accent" loading={save.isPending}>
          Save
        </Button>
      </form>
    </>
  );
}

function PasswordForm() {
  const m = useChangePassword();
  const f = useForm({ resolver: zodResolver(passwordChangeSchema), defaultValues: { old_password: "", new_password: "", confirm: "" } });
  const e = f.formState.errors;
  return (
    <form
      noValidate
      className="max-w-md space-y-4"
      onSubmit={f.handleSubmit((v) =>
        m.mutate(v, {
          onSuccess: () => {
            f.reset();
            toast.ok("Password changed. Other devices were signed out.");
          },
        }),
      )}
    >
      <ServerError error={m.error} />
      <Field label="Current password" error={e.old_password?.message}>
        {(a) => <PasswordInput {...a} autoComplete="current-password" {...f.register("old_password")} />}
      </Field>
      <Field label="New password" error={e.new_password?.message}>
        {(a) => <PasswordInput {...a} autoComplete="new-password" {...f.register("new_password")} />}
      </Field>
      <Field label="Confirm new password" error={e.confirm?.message}>
        {(a) => <PasswordInput {...a} autoComplete="new-password" {...f.register("confirm")} />}
      </Field>
      <Button type="submit" variant="outline" loading={m.isPending}>
        Change password
      </Button>
    </form>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div className="rounded border border-line p-4">
      <p className="text-sm font-medium">Save these backup codes. Each works once and they won't be shown again.</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <Button
        variant="ghost"
        size="sm"
        className="mt-3"
        onClick={() => navigator.clipboard?.writeText(codes.join("\n")).then(() => toast.ok("Copied"), toast.error)}
      >
        Copy codes
      </Button>
    </div>
  );
}

function TwoFactor() {
  const q = useQuery(mfaQuery());
  const refresh = useInvalidate(accountKeys.mfa);
  const [setup, setSetup] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const start = useMutation({ mutationFn: repo.mfaSetup, onSuccess: setSetup, onError: toast.error });
  const enable = useMutation({
    mutationFn: repo.mfaEnable,
    onSuccess: (c) => {
      setCodes(c);
      setSetup(null);
      setCode("");
      refresh();
    },
  });
  const disable = useMutation({
    mutationFn: () => repo.mfaDisable(password, code),
    onSuccess: () => {
      setCode("");
      setPassword("");
      refresh();
      toast.ok("Two-factor authentication is off");
    },
  });
  const regen = useMutation({
    mutationFn: repo.mfaBackupCodes,
    onSuccess: (c) => {
      setCodes(c);
      setCode("");
      refresh();
    },
  });
  useEffect(() => {
    if (setup) void QRCode.toDataURL(setup.otpauth_url, { margin: 1, width: 192 }).then(setQr);
  }, [setup]);
  const codeOk = codeSchema.safeParse(code).success;
  if (q.isPending) return <Bone className="h-16 w-full" />;
  const codeInput = (label: string) => (
    <Field label={label}>
      {(a) => (
        <input
          {...a}
          className={cn(inputCls, "max-w-48")}
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      )}
    </Field>
  );
  return (
    <div className="max-w-md space-y-4">
      {codes ? <BackupCodes codes={codes} /> : null}
      {q.data?.enabled ? (
        <>
          <p className="flex items-center gap-2 text-sm">
            <ShieldCheckIcon className="size-5 text-accent" aria-hidden /> On · {q.data.backup_codes_left} backup codes left
          </p>
          <ServerError error={disable.error ?? regen.error} />
          {codeInput("Authenticator or backup code")}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm" disabled={!codeOk} loading={regen.isPending} onClick={() => regen.mutate(code)}>
              New backup codes
            </Button>
          </div>
          <Field label="Password (to turn off)">
            {(a) => <PasswordInput {...a} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <Button
            variant="outline"
            size="sm"
            className="border-danger text-danger"
            disabled={!codeOk || !password}
            loading={disable.isPending}
            onClick={() => disable.mutate()}
          >
            Turn off two-factor
          </Button>
        </>
      ) : setup ? (
        <>
          <p className="text-sm">Scan this QR code with an authenticator app (Google Authenticator, 1Password, Authy), then enter the 6-digit code.</p>
          {qr ? <img src={qr} alt="QR code for your authenticator app" className="size-48 rounded bg-white p-2" /> : <Bone className="size-48" />}
          <p className="text-sm text-muted">
            Or enter this key: <code className="font-mono text-fg">{groupSecret(setup.secret)}</code>
          </p>
          <ServerError error={enable.error} />
          {codeInput("Code from the app")}
          <Button variant="accent" size="sm" disabled={!codeOk} loading={enable.isPending} onClick={() => enable.mutate(code)}>
            Turn on
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" loading={start.isPending} onClick={() => start.mutate()}>
          Set up two-factor authentication
        </Button>
      )}
    </div>
  );
}

function Devices() {
  const q = useQuery(devicesQuery());
  const refresh = useInvalidate(accountKeys.devices);
  const revoke = useMutation({ mutationFn: repo.revokeDevice, onSuccess: refresh, onError: toast.error });
  const all = useSignOutEverywhere();
  const nav = useNavigate();
  return (
    <div className="space-y-4">
      {q.isPending ? (
        <Bone className="h-16 w-full" />
      ) : (
        <ul className="divide-y divide-line rounded border border-line">
          {q.data?.map((d) => (
            <li key={d.id} className="flex items-center gap-4 p-4">
              {(() => {
                const kind = deviceKind(d.user_agent);
                const DeviceIcon = deviceIcon[kind];
                return <DeviceIcon className="size-6 shrink-0 text-muted" data-device={kind} aria-hidden />;
              })()}
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {describeDevice(d.user_agent)}{" "}
                  {d.current ? <span className="ml-1 rounded bg-accent/15 px-2 py-0.5 text-xs text-accent">This device</span> : null}
                </p>
                <p className="text-muted">
                  {d.ip || "unknown IP"} · active {timeAgo(d.last_seen_at)}
                </p>
              </div>
              {!d.current ? (
                <Button variant="ghost" size="sm" loading={revoke.isPending && revoke.variables === d.id} onClick={() => revoke.mutate(d.id)}>
                  Sign out
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" loading={all.isPending} onClick={() => all.mutate(undefined, { onSettled: () => nav({ to: "/" }) })}>
        Sign out everywhere
      </Button>
    </div>
  );
}

function PeopleList({
  q,
  action,
  empty,
}: {
  q: { data?: InfiniteData<Page<UserSummary>> | undefined; isPending: boolean };
  action: (u: UserSummary) => ReactNode;
  empty: string;
}) {
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isPending) return <Bone className="h-12 w-full" />;
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((u) => (
        <li key={u.id} className="flex items-center gap-3">
          <Avatar name={displayName(u)} src={u.avatar_url} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{displayName(u)}</span>
          {action(u)}
        </li>
      ))}
    </ul>
  );
}

function PrivacyTab() {
  const tags = useQuery(followedTagsQuery());
  const toggleTag = useToggleTag();
  const blocks = useInfiniteQuery(blocksQuery());
  const mutes = useInfiniteQuery(mutesQuery());
  const hidden = useInfiniteQuery(hiddenQuery());
  const block = useRelation("block");
  const mute = useRelation("mute");
  const hide = useHide();
  const hiddenRows = hidden.data?.pages.flatMap((p) => p.items) ?? [];
  const label = { post: "Story", author: "Writer", tag: "Topic" } as const;
  return (
    <>
      <Section title="Topics in your feed" desc="These shape Picked for you.">
        {tags.data?.length ? (
          <ul className="flex flex-wrap gap-2">
            {tags.data.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  className="h-9 rounded-full bg-surface-2 px-4 text-sm hover:bg-line"
                  aria-label={`Unfollow ${t}`}
                  onClick={() => toggleTag.mutate({ tag: t, on: false })}
                >
                  {t} ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Add topics from any topic page.</p>
        )}
      </Section>
      <Section title="Shown less" desc="Stories, writers and topics you asked to see less of.">
        {hiddenRows.length ? (
          <ul className="space-y-2">
            {hiddenRows.map((h) => (
              <li key={`${h.kind}:${h.target}`} className="flex items-center gap-3 text-sm">
                <span className="text-muted">{label[h.kind]}</span>
                <span className="min-w-0 flex-1 truncate">{h.target}</span>
                <Button variant="ghost" size="sm" onClick={() => hide.mutate({ kind: h.kind, target: h.target, on: false })}>
                  Undo
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing hidden.</p>
        )}
      </Section>
      <Section title="Blocked" desc="Blocked people can't follow you or respond to your stories.">
        <PeopleList
          q={blocks}
          empty="You haven't blocked anyone."
          action={(u) => (
            <Button variant="outline" size="sm" onClick={() => block.mutate({ username: u.username, on: false })}>
              Unblock
            </Button>
          )}
        />
      </Section>
      <Section title="Muted" desc="You get no notifications from muted people.">
        <PeopleList
          q={mutes}
          empty="You haven't muted anyone."
          action={(u) => (
            <Button variant="outline" size="sm" onClick={() => mute.mutate({ username: u.username, on: false })}>
              Unmute
            </Button>
          )}
        />
      </Section>
    </>
  );
}

function DangerTab() {
  const del = useDeleteAccount();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [pw, setPw] = useState("");
  const [sure, setSure] = useState(false);
  return (
    <Section
      title="Delete account"
      desc="Your account is deleted after 30 days. Signing in before then restores it; afterwards your stories and responses are gone for good."
    >
      <div className="max-w-md space-y-4">
        <ServerError error={del.error} />
        <Field label="Password">{(a) => <PasswordInput {...a} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="size-4 accent-[var(--danger)]" /> I understand this signs
          me out everywhere.
        </label>
        <Button
          variant="outline"
          className="border-danger text-danger hover:bg-danger hover:text-white"
          disabled={!pw || !sure}
          loading={del.isPending}
          onClick={() =>
            del.mutate(pw, {
              onSuccess: () => {
                qc.clear();
                toast.ok("Account scheduled for deletion");
                void nav({ to: "/" });
              },
            })
          }
        >
          Delete account
        </Button>
      </div>
    </Section>
  );
}

const tabs = { profile: "Profile", reading: "Reading", security: "Security", privacy: "Privacy", account: "Account" } as const;
export type SettingsTab = keyof typeof tabs;

export function Settings({ tab, onTab }: { tab: SettingsTab; onTab: (t: SettingsTab) => void }) {
  return (
    <>
      <h1 className="font-display text-[32px] leading-tight font-bold tracking-tight md:text-[42px]">Settings</h1>
      <Tabs className="mt-8" value={tab} onChange={onTab} items={(Object.keys(tabs) as SettingsTab[]).map((t) => [t, tabs[t]])} />
      {tab === "profile" ? <ProfileTab /> : null}
      {tab === "security" ? (
        <>
          <Section title="Password">
            <PasswordForm />
          </Section>
          <Section title="Two-factor authentication" desc="Ask for a code from your phone when you sign in.">
            <TwoFactor />
          </Section>
          <Section title="Devices" desc="Where you're signed in right now.">
            <Devices />
          </Section>
        </>
      ) : null}
      {tab === "reading" ? (
        <Section title="Reading" desc="How stories look to you on this device: theme, typeface, size, line length, bold, bionic reading and focus.">
          <div className="max-w-md">
            <ReadingControls
              footer={
                <Button variant="ghost" size="sm" onClick={() => readingPrefs.reset()}>
                  Reset to defaults
                </Button>
              }
            />
          </div>
        </Section>
      ) : null}
      {tab === "privacy" ? <PrivacyTab /> : null}
      {tab === "account" ? <DangerTab /> : null}
    </>
  );
}
