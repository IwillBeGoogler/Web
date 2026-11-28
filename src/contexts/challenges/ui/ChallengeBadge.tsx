import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FlameIcon } from "lucide-react";
import { useT } from "@/shared/i18n";
import { postChallengeQuery } from "../application/hooks";

/** "Day N/M · Title" on a story that counts in a challenge. */
export function ChallengeBadge({ postId }: { postId: number }) {
  const t = useT();
  const p = useQuery(postChallengeQuery(postId)).data;
  if (!p) return null;
  return (
    <Link to="/challenges/$id" params={{ id: String(p.challenge.id) }} className="tag mt-4 inline-flex max-w-full items-center gap-1.5">
      <FlameIcon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {t("challenge.day", { n: p.day, of: p.of })} · {p.challenge.title}
      </span>
    </Link>
  );
}
