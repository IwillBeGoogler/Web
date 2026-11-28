import { authDialog } from "@/contexts/identity/application/authDialog";
import { useMe } from "@/contexts/identity/application/session";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { inputBoxCls } from "@/shared/ui/form";
import { toast } from "@/shared/ui/toast";
import { useChallengeMutations } from "../application/hooks";
import type { ChallengeDetail } from "../domain/challenges";

/** Follow and cheer for a public challenge, with today's cheers. */
export function ChallengeActions({ challenge: c }: { challenge: ChallengeDetail }) {
  const t = useT();
  const { me } = useMe();
  const { follow, cheer } = useChallengeMutations();
  const own = me?.id === c.user_id;
  const signedIn = (act: () => void) => (me ? act() : authDialog.open("signin"));
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {own ? null : (
        <Button
          variant="outline"
          size="sm"
          aria-pressed={c.is_following}
          loading={follow.isPending}
          onClick={() => signedIn(() => follow.mutate({ id: c.id, on: !c.is_following }, { onError: toast.error }))}
        >
          {t(c.is_following ? "challenge.following" : "challenge.follow")}
        </Button>
      )}
      <Button
        variant="accent"
        size="sm"
        disabled={own || c.cheered_today || c.stats.ended}
        loading={cheer.isPending}
        onClick={() => signedIn(() => cheer.mutate(c.id, { onError: toast.error }))}
      >
        {t(c.cheered_today ? "challenge.cheered" : "challenge.cheer")}
      </Button>
      <p className="font-mono text-[12px] text-muted tabular-nums">
        {t("challenge.cheersToday", { n: c.cheers_today })} · {t("challenge.followers", { n: c.followers })}
      </p>
    </div>
  );
}

/** The owner's reminder switch and time. */
export function ReminderPanel({ challenge: c }: { challenge: ChallengeDetail }) {
  const t = useT();
  const { setReminders } = useChallengeMutations();
  const on = c.reminders ?? true;
  const save = (body: { reminders?: boolean; remind_at?: string }) => setReminders.mutate({ id: c.id, body }, { onError: toast.error });
  return (
    <section className="panel mt-8 flex flex-wrap items-center justify-between gap-4 p-4">
      <div>
        <h2 className="font-display text-lg font-bold">{t("challenge.reminders")}</h2>
        <p className="mt-1 font-mono text-[11px] text-muted">{t("challenge.remindersHint", { zone: c.timezone })}</p>
      </div>
      <div className="flex items-center gap-3">
        <input
          // remount when the saved time changes
          key={c.remind_at}
          type="time"
          aria-label={t("challenge.remindAt")}
          className={cn(inputBoxCls, "w-32")}
          defaultValue={c.remind_at}
          disabled={!on || setReminders.isPending}
          onBlur={(e) => {
            const at = e.currentTarget.value;
            if (at && at !== c.remind_at) save({ remind_at: at });
          }}
        />
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("challenge.reminders")}
          disabled={setReminders.isPending}
          onClick={() => save({ reminders: !on })}
          className={cn(
            "relative inline-flex h-7 w-14 rounded-full border border-line-strong transition-colors disabled:opacity-50",
            on ? "bg-accent" : "bg-surface-2",
          )}
        >
          <span aria-hidden className={cn("absolute top-0.5 size-[22px] rounded-full bg-card transition-[left]", on ? "left-[calc(100%-24px)]" : "left-0.5")} />
        </button>
      </div>
    </section>
  );
}
