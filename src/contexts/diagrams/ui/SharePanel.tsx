import { useQuery } from "@tanstack/react-query";
import { CopyIcon, Trash2Icon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useMe } from "@/contexts/identity/application/session";
import { type MessageKey, useT } from "@/shared/i18n";
import { timeAgo } from "@/shared/lib/format";
import { Button } from "@/shared/ui/button";
import { inputBoxCls } from "@/shared/ui/form";
import { Modal } from "@/shared/ui/modal";
import { Bone } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";
import { membersQuery, sharesQuery, useSharing } from "../application/hooks";
import { type DiagramRole, iso, SHARE_ROLES, type ShareRole, shareUrl } from "../domain/diagram";
import { roleKey } from "./Dashboard";
import { ConfirmModal } from "./Modals";

const selectCls = `${inputBoxCls} h-9 w-auto px-2 text-[13px]`;
const EXPIRY: { key: MessageKey; seconds?: number }[] = [
  { key: "dg.share.never" },
  { key: "dg.share.day1", seconds: 86_400 },
  { key: "dg.share.day7", seconds: 7 * 86_400 },
  { key: "dg.share.day30", seconds: 30 * 86_400 },
];

function RoleSelect({ value, label, onChange, disabled }: { value: ShareRole; label: string; onChange: (r: ShareRole) => void; disabled?: boolean }) {
  const t = useT();
  return (
    <select className={selectCls} value={value} aria-label={label} disabled={disabled} onChange={(e) => onChange(e.target.value as ShareRole)}>
      {SHARE_ROLES.map((r) => (
        <option key={r} value={r}>
          {t(roleKey[r])}
        </option>
      ))}
    </select>
  );
}

const copy = async (text: string, done: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.ok(done);
  } catch (e) {
    toast.error(e);
  }
};

const h2 = "mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted";

/** Project sharing dialog. Owners manage members and links; everyone else sees the people and can leave. */
export function SharePanel({
  projectId,
  projectName,
  role,
  open,
  onOpenChange,
  onLeft,
}: {
  projectId: string;
  projectName: string;
  role: DiagramRole;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onLeft: () => void;
}) {
  const t = useT();
  const owner = role === "owner";
  const { me } = useMe();
  const myId = me ? String(me.id) : "";
  const sharing = useSharing(projectId);
  const members = useQuery({ ...membersQuery(projectId), enabled: open });
  const links = useQuery({ ...sharesQuery(projectId), enabled: open && owner });
  const [login, setLogin] = useState("");
  const [inviteRole, setInviteRole] = useState<ShareRole>("viewer");
  const [linkRole, setLinkRole] = useState<ShareRole>("viewer");
  const [expiry, setExpiry] = useState(0);
  // the token exists only in the create response: keep the URLs made in this dialog, keyed by link id
  const [fresh, setFresh] = useState<Record<string, string>>({});
  const [leaving, setLeaving] = useState(false);

  const invite = () => {
    const l = login.trim();
    if (!l) return;
    sharing.invite.mutate(
      { login: l, role: inviteRole },
      {
        onSuccess: () => {
          setLogin("");
          toast.ok(t("dg.share.invited"));
        },
        onError: toast.error,
      },
    );
  };
  const createLink = () =>
    sharing.createShare.mutate(
      { role: linkRole, expiresInSeconds: EXPIRY[expiry]?.seconds },
      {
        onSuccess: (r) => {
          const url = shareUrl(r.token);
          setFresh((f) => ({ ...f, [r.share.id]: url }));
          void copy(url, t("dg.share.copied"));
        },
        onError: toast.error,
      },
    );

  const section = (title: string, children: ReactNode) => (
    <section className="mt-6 first:mt-0">
      <h3 className={h2}>{title}</h3>
      {children}
    </section>
  );

  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange} title={t("dg.share.title")} className="md:w-[640px]">
        {section(
          t("dg.share.members"),
          <>
            {members.isPending ? (
              <Bone className="h-24 w-full" />
            ) : members.isError ? (
              <p className="text-sm text-danger">{t("dg.project.loadError")}</p>
            ) : (
              <ul className="divide-y divide-line border border-line">
                {members.data.map((m) => {
                  const mine = m.userId === myId;
                  const fixed = !owner || m.role === "owner";
                  return (
                    <li key={m.userId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {m.name || m.email}
                          {mine ? <span className="ml-1 font-mono text-[11px] text-muted">({t("dg.share.you")})</span> : null}
                        </span>
                        {m.name && m.email ? <span className="block truncate font-mono text-[11px] text-muted">{m.email}</span> : null}
                      </span>
                      {fixed ? (
                        <span className="font-mono text-[12px] text-muted">{t(roleKey[m.role])}</span>
                      ) : (
                        <RoleSelect
                          value={m.role as ShareRole}
                          label={t("dg.share.roleOf", { name: m.name || m.email })}
                          onChange={(r) => sharing.setRole.mutate({ userId: m.userId, role: r }, { onError: toast.error })}
                        />
                      )}
                      {owner && m.role !== "owner" ? (
                        <Button
                          variant="ghost-icon"
                          className="size-8 hover:text-danger"
                          aria-label={t("dg.share.remove", { name: m.name || m.email })}
                          onClick={() => sharing.removeMember.mutate(m.userId, { onError: toast.error })}
                        >
                          <Trash2Icon aria-hidden />
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {owner ? (
              <form
                className="mt-3 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  invite();
                }}
              >
                <input
                  className={`${inputBoxCls} h-9 min-w-0 flex-1 basis-48 text-[13px]`}
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder={t("dg.share.invite")}
                  aria-label={t("dg.share.invite")}
                  maxLength={254}
                />
                <RoleSelect value={inviteRole} label={t("dg.share.role")} onChange={setInviteRole} />
                <Button type="submit" variant="accent" size="sm" loading={sharing.invite.isPending} disabled={!login.trim()}>
                  {t("dg.share.inviteBtn")}
                </Button>
              </form>
            ) : null}
          </>,
        )}

        {owner ? (
          section(
            t("dg.share.links"),
            <>
              <div className="flex flex-wrap items-center gap-2">
                <RoleSelect value={linkRole} label={t("dg.share.role")} onChange={setLinkRole} />
                <select className={selectCls} value={expiry} aria-label={t("dg.share.expiry")} onChange={(e) => setExpiry(Number(e.target.value))}>
                  {EXPIRY.map((x, i) => (
                    <option key={x.key} value={i}>
                      {t("dg.share.expiry")}: {t(x.key)}
                    </option>
                  ))}
                </select>
                <Button variant="outline" size="sm" loading={sharing.createShare.isPending} onClick={createLink}>
                  {t("dg.share.create")}
                </Button>
              </div>
              {links.isPending ? (
                <Bone className="mt-3 h-12 w-full" />
              ) : links.data?.length ? (
                <ul className="mt-3 divide-y divide-line border border-line">
                  {links.data.map((l) => {
                    const dead = !!l.revokedAt || (!!l.expiresAt && l.expiresAt < Date.now());
                    const url = fresh[l.id];
                    return (
                      <li key={l.id} className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`min-w-0 flex-1 text-sm ${dead ? "text-muted line-through" : ""}`}>
                            {t(roleKey[l.role])}
                            <span className="ml-2 font-mono text-[11px] text-muted">
                              {l.revokedAt
                                ? t("dg.share.revoked")
                                : l.expiresAt
                                  ? t("dg.share.expires", { when: timeAgo(iso(l.expiresAt)) })
                                  : t("dg.share.never")}
                            </span>
                          </span>
                          {url && !dead ? (
                            <Button variant="ghost" size="sm" onClick={() => void copy(url, t("dg.share.copied"))}>
                              <CopyIcon className="size-3.5" aria-hidden /> {t("dg.share.copy")}
                            </Button>
                          ) : null}
                          {!l.revokedAt ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="hover:text-danger"
                              aria-label={t("dg.share.revokeNamed", { role: t(roleKey[l.role]) })}
                              onClick={() => sharing.revokeShare.mutate(l.id, { onError: toast.error })}
                            >
                              {t("dg.share.revoke")}
                            </Button>
                          ) : null}
                        </div>
                        {url && !dead ? (
                          <>
                            <input
                              readOnly
                              className={`${inputBoxCls} mt-2 h-8 text-[12px]`}
                              value={url}
                              aria-label={t("dg.share.copy")}
                              onFocus={(e) => e.target.select()}
                            />
                            <p className="mt-1 font-mono text-[11px] text-muted">{t("dg.share.tokenOnce")}</p>
                          </>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 font-mono text-[12px] text-muted">{t("dg.share.noLinks")}</p>
              )}
            </>,
          )
        ) : (
          <div className="mt-6">
            <Button variant="outline" size="sm" className="hover:text-danger" onClick={() => setLeaving(true)}>
              {t("dg.share.leave")}
            </Button>
          </div>
        )}
      </Modal>
      <ConfirmModal
        open={leaving}
        title={t("dg.share.leave")}
        body={t("dg.share.leaveBody", { name: projectName })}
        confirm={t("dg.share.leave")}
        pending={sharing.leave.isPending}
        onClose={() => setLeaving(false)}
        onConfirm={() =>
          sharing.leave.mutate(myId, {
            onSuccess: () => {
              setLeaving(false);
              onOpenChange(false);
              onLeft();
            },
            onError: toast.error,
          })
        }
      />
    </>
  );
}
