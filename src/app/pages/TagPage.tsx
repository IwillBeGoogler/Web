import { useQuery } from "@tanstack/react-query";
import { followedTagsQuery, useToggleTag } from "@/contexts/account/application/hooks";
import { requireAuth } from "@/contexts/identity/application/authDialog";
import { useMe } from "@/contexts/identity/application/session";
import { Feed } from "@/contexts/reading/ui/Feed";
import { Button } from "@/shared/ui/button";
import { HomeGrid } from "./HomePage";

export function TagPage({ tag }: { tag: string }) {
  const { me } = useMe();
  const followed = useQuery({ ...followedTagsQuery(), enabled: !!me });
  const toggle = useToggleTag();
  const on = !!followed.data?.includes(tag);
  return (
    <HomeGrid>
      <header className="py-8 text-center">
        <p className="text-sm text-muted">Topic</p>
        <h1 className="mt-2 font-display text-[32px] font-bold tracking-tight capitalize md:text-[42px]">{tag}</h1>
        <Button className="mt-5" variant={on ? "outline" : "primary"} aria-pressed={on} onClick={requireAuth(() => toggle.mutate({ tag, on: !on }))}>
          {on ? "In your feed" : "Add to feed"}
        </Button>
      </header>
      <Feed source={{ kind: "tag", tag }} empty={{ title: `No stories tagged “${tag}” yet.` }} />
    </HomeGrid>
  );
}
