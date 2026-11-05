import { EyeOffIcon, FlagIcon, HashIcon, MoreHorizontalIcon, UserXIcon } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { useHide } from "@/contexts/account/application/hooks";
import { requireAuth } from "@/contexts/identity/application/authDialog";
import { useMe } from "@/contexts/identity/application/session";
import type { Post } from "@/contexts/reading/domain/post";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { toast } from "@/shared/ui/toast";
import type { ReportTarget } from "../domain/report";
import { ReportDialog } from "./ReportDialog";

const item =
  "flex h-9 cursor-pointer items-center gap-3 rounded-[var(--radius-xs)] px-2.5 text-[13px] text-fg outline-none data-[highlighted]:bg-inverse data-[highlighted]:text-on-inverse [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted data-[highlighted]:[&_svg]:text-on-inverse";

/** "…" on a story: show less like this (story, writer, topic) and report. */
export function PostMenu({ post }: { post: Pick<Post, "id" | "author" | "user_id" | "tags" | "title"> }) {
  const { me } = useMe();
  const hide = useHide();
  const [report, setReport] = useState<ReportTarget | null>(null);
  if (me && me.id === post.user_id) return null;
  const less = (kind: "post" | "author" | "tag", target: string, msg: string) =>
    requireAuth(() => hide.mutate({ kind, target, on: true }, { onSuccess: () => toast.ok(msg), onError: toast.error }))();
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost-icon" className="size-9" aria-label={`More options for ${post.title}`}>
            <MoreHorizontalIcon aria-hidden />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="menu-pop z-50 w-64 overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-card shadow-[3px_3px_0_0_var(--fg)]"
          >
            <DropdownMenu.Label className="tile-head rounded-none">Tune feed</DropdownMenu.Label>
            <div className="p-1">
              <DropdownMenu.Item className={item} onSelect={() => less("post", String(post.id), "You'll see fewer stories like this.")}>
                <EyeOffIcon aria-hidden />
                <span className="min-w-0 truncate">Show less like this</span>
              </DropdownMenu.Item>
              {post.author && post.user_id ? (
                <DropdownMenu.Item className={item} onSelect={() => less("author", post.author, `Hidden stories by ${post.author}.`)}>
                  <UserXIcon aria-hidden />
                  <span className="min-w-0 truncate">Hide stories by {post.author}</span>
                </DropdownMenu.Item>
              ) : null}
              {post.tags[0] ? (
                <DropdownMenu.Item className={item} onSelect={() => less("tag", post.tags[0] as string, `Showing less about ${post.tags[0]}.`)}>
                  <HashIcon aria-hidden />
                  <span className="min-w-0 truncate">Show less about {post.tags[0]}</span>
                </DropdownMenu.Item>
              ) : null}
            </div>
            <DropdownMenu.Separator className="h-px bg-line" />
            <div className="p-1">
              <DropdownMenu.Item
                className={cn(item, "text-danger data-[highlighted]:bg-danger data-[highlighted]:text-surface [&_svg]:text-danger")}
                onSelect={requireAuth(() => setReport({ type: "post", id: post.id }))}
              >
                <FlagIcon aria-hidden />
                Report story…
              </DropdownMenu.Item>
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ReportDialog target={report} onClose={() => setReport(null)} />
    </>
  );
}
