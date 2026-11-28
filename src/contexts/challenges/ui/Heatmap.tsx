import { postPath } from "@/contexts/reading/domain/post";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { type ChallengeDetail, cells } from "../domain/challenges";

const box = "block size-4 rounded-[var(--radius-xs)] border";
const look = {
  done: "border-accent bg-accent hover:bg-accent-hover",
  today: "border-2 border-fg",
  missed: "border-line bg-surface-2",
  future: "border-dashed border-line",
};

/** One square per day; a done day links to its story. */
export function Heatmap({ challenge }: { challenge: ChallengeDetail }) {
  const t = useT();
  return (
    <ol aria-label={t("challenge.heatmap")} className="flex flex-wrap gap-1">
      {cells(challenge).map((c) => {
        const label = [
          t("challenge.cell", { n: c.n, date: c.date }),
          c.entry ? c.entry.title : t(`challenge.state.${c.state as "today" | "missed" | "future"}`),
        ].join(": ");
        return (
          <li key={c.n}>
            {c.entry ? (
              // biome-ignore lint/a11y/useAnchorContent: a heatmap square; aria-label names it
              <a href={postPath(c.entry)} aria-label={label} title={label} className={cn(box, look.done)} />
            ) : (
              <span role="img" aria-label={label} title={label} className={cn(box, look[c.state])} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
