import { useQuery } from "@tanstack/react-query";
import { BookmarkKey, ClapKey } from "@/contexts/engagement/ui/actions";
import { useMe } from "@/contexts/identity/application/session";
import { useT } from "@/shared/i18n";
import { toast } from "@/shared/ui/toast";
import { diagramViewerQuery, useDiagramBookmark, useDiagramClap } from "../application/hooks";
import type { PublicDiagram } from "../domain/diagram";

/** The story page's clap and save keys on a published diagram. */
export function DiagramEngagement({ d }: { d: Pick<PublicDiagram, "slug" | "claps" | "author"> }) {
  const t = useT();
  const { me } = useMe();
  const viewer = useQuery(diagramViewerQuery(d.slug, me !== null)).data;
  const mine = viewer?.my_claps ?? 0;
  const clap = useDiagramClap(d, mine);
  const bookmark = useDiagramBookmark(d.slug);
  const on = viewer?.bookmarked ?? false;
  return (
    <>
      <ClapKey
        claps={d.claps}
        myClaps={mine}
        own={me?.username === d.author.username}
        onClap={clap}
        labels={{ name: t("dg.clap"), own: t("dg.clap.own"), aria: (n, my) => t(my ? "dg.clap.ariaMine" : "dg.clap.aria", { n, my }) }}
      />
      <BookmarkKey
        on={on}
        onToggle={() => bookmark.mutate(!on, { onError: toast.error })}
        labels={{ on: t("dg.unsave"), off: t("dg.save"), saved: t("dg.saved"), save: t("dg.saveShort") }}
      />
    </>
  );
}
