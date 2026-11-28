import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { AwardIcon, FlameIcon } from "lucide-react";
import { useState } from "react";
import { useMe } from "@/contexts/identity/application/session";
import { postPath } from "@/contexts/reading/domain/post";
import { useHead } from "@/shared/head";
import { useT } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { Bone, EmptyState, Loading } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";
import { challengeQuery, useChallengeMutations } from "../application/hooks";
import { canClaim } from "../domain/challenges";
import { ChallengeForm } from "./ChallengeForm";
import { ChallengeQr } from "./ChallengeQr";
import { ChallengeActions, ReminderPanel } from "./ChallengeSocial";
import { Heatmap } from "./Heatmap";
import { TelegramPanel } from "./TelegramPanel";

export function ChallengePage({ id }: { id: number }) {
  const t = useT();
  const nav = useNavigate();
  const { me } = useMe();
  const q = useQuery(challengeQuery(id));
  const { remove, claim } = useChallengeMutations();
  const [editing, setEditing] = useState(false);
  useHead({ title: q.data?.title, description: q.data?.description || undefined, noindex: q.data?.visibility === "private" });
  if (q.isPending)
    return (
      <Loading>
        <Bone className="h-40 w-full" />
      </Loading>
    );
  if (q.isError) return <EmptyState icon={FlameIcon} heading="h1" title={t("challenge.notFound")} />;
  const c = q.data;
  const s = c.stats;
  const stats: [string, string | number][] = [
    [t("challenge.stat.done"), `${s.days_done}/${c.days}`],
    [t("challenge.stat.streak"), s.current_streak],
    [t("challenge.stat.best"), s.best_streak],
    [t("challenge.stat.today"), s.ended ? t("challenge.ended") : `${s.today}/${c.days}`],
  ];
  return (
    <>
      <p className="text-sm text-muted">
        <Link to="/@{$username}" params={{ username: c.author }} className="hover:underline">
          @{c.author}
        </Link>
        {" · "}
        {c.start_date} – {s.end_date}
        {c.visibility === "private" ? ` · ${t("challenge.private")}` : ""}
      </p>
      <h1 className="mt-2 font-display text-[32px] leading-tight font-bold tracking-tight md:text-[42px]">{c.title}</h1>
      {c.description ? <p className="mt-3 font-serif text-lg whitespace-pre-line text-muted">{c.description}</p> : null}
      {me?.id === c.user_id ? (
        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            {t("challenge.edit")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            loading={remove.isPending}
            onClick={() =>
              confirm(t("challenge.confirmDelete", { title: c.title })) &&
              remove.mutate(c.id, { onSuccess: () => void nav({ to: "/challenges" }), onError: toast.error })
            }
          >
            {t("challenge.delete")}
          </Button>
        </div>
      ) : null}
      {c.visibility === "public" ? <ChallengeActions challenge={c} /> : null}
      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-line md:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-card px-4 py-3">
            <dt className="kicker">{label}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {c.certificate_id ? (
        <p className="mt-6">
          <Button asChild variant="outline">
            <Link to="/certificates/$id" params={{ id: c.certificate_id }}>
              <AwardIcon className="size-4" aria-hidden />
              {t("certificate.view")}
            </Link>
          </Button>
        </p>
      ) : me?.id === c.user_id && canClaim(c) ? (
        <p className="mt-6">
          <Button
            loading={claim.isPending}
            onClick={() =>
              claim.mutate(c.id, {
                onSuccess: (cert) => void nav({ to: "/certificates/$id", params: { id: cert.id } }),
                onError: toast.error,
              })
            }
          >
            <AwardIcon className="size-4" aria-hidden />
            {t("certificate.claim")}
          </Button>
        </p>
      ) : null}
      {me?.id === c.user_id && !s.ended ? <ReminderPanel challenge={c} /> : null}
      {me?.id === c.user_id || c.is_following ? <TelegramPanel className="mt-4" /> : null}
      <section className="mt-8">
        <Heatmap challenge={c} />
        <p className="mt-2 font-mono text-[11px] text-muted">{t("challenge.rule")}</p>
      </section>
      <section className="mt-8">
        <h2 className="font-display text-xl font-bold">{t("challenge.stories")}</h2>
        {c.entries.length ? (
          <ol className="mt-3 border-t border-line">
            {c.entries.map((e) => (
              <li key={e.post_id} className="flex flex-wrap items-baseline gap-x-4 border-b border-line py-4">
                <span className="font-mono text-[12px] text-muted tabular-nums">{t("challenge.day", { n: e.n, of: c.days })}</span>
                <a href={postPath(e)} className="min-w-0 flex-1 text-lg font-bold hover:underline">
                  {e.title}
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-8 text-center text-muted">{t("challenge.noStories")}</p>
        )}
      </section>
      {c.visibility === "public" ? (
        <section className="mt-8">
          <ChallengeQr id={c.id} />
        </section>
      ) : null}
      <Modal open={editing} onOpenChange={setEditing} title={t("challenge.edit")}>
        <ChallengeForm initial={c} onDone={() => setEditing(false)} />
      </Modal>
    </>
  );
}
