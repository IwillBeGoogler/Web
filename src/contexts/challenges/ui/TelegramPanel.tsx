import { useQuery } from "@tanstack/react-query";
import { useMe } from "@/contexts/identity/application/session";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { toast } from "@/shared/ui/toast";
import { telegramQuery, useTelegramMutations } from "../application/hooks";

/** Connect or disconnect the Telegram bot; nothing while the bot is off. */
export function TelegramPanel({ className }: { className?: string }) {
  const { me } = useMe();
  return me ? <Panel userId={me.id} className={className} /> : null;
}

function Panel({ userId, className }: { userId: number; className?: string | undefined }) {
  const t = useT();
  const q = useQuery(telegramQuery(userId));
  const { link, unlink } = useTelegramMutations();
  if (!q.data?.enabled) return null;
  const { linked } = q.data;
  const connect = () => {
    // opened inside the click, or the browser blocks it once the link arrives
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    link.mutate(undefined, {
      onSuccess: (url) => tab?.location.replace(url),
      onError: (e) => {
        tab?.close();
        toast.error(e);
      },
    });
  };
  return (
    <section className={cn("panel flex flex-wrap items-center justify-between gap-4 p-4", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-lg font-bold">Telegram</h2>
        <p role="status" className="mt-1 font-mono text-[11px] text-muted">
          {t(linked ? "telegram.linked" : "telegram.hint")}
        </p>
        {!linked && link.data ? (
          <a href={link.data} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-accent underline">
            {t("telegram.open")}
          </a>
        ) : null}
      </div>
      {linked ? (
        <Button
          variant="outline"
          size="sm"
          loading={unlink.isPending}
          onClick={() => {
            link.reset();
            unlink.mutate(undefined, { onError: toast.error });
          }}
        >
          {t("telegram.disconnect")}
        </Button>
      ) : (
        <Button variant="accent" size="sm" loading={link.isPending} onClick={connect}>
          {t("telegram.connect")}
        </Button>
      )}
    </section>
  );
}
