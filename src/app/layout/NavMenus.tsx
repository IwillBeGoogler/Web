import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, DatabaseIcon, FolderIcon, LayoutTemplateIcon, NetworkIcon, WorkflowIcon } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { NewDiagramKind } from "@/contexts/diagrams/domain/diagram";
import { useStartDiagram } from "@/contexts/diagrams/ui/WriteMenu";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { useMe } from "@/contexts/identity/application/session";
import { topicsQuery } from "@/contexts/reading/application/queries";
import { topicName } from "@/contexts/reading/domain/topic";
import { useLang, useT } from "@/shared/i18n";

const item =
  "flex h-9 cursor-pointer items-center gap-3 rounded-[var(--radius-xs)] px-2.5 text-[13px] text-fg outline-none data-[highlighted]:bg-inverse data-[highlighted]:text-on-inverse [&_svg]:size-4 [&_svg]:text-muted data-[highlighted]:[&_svg]:text-on-inverse";
const content = "menu-pop z-50 overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-card p-1 shadow-[3px_3px_0_0_var(--fg)]";
const trigger = "seg-item h-7 gap-1 data-[state=open]:bg-inverse data-[state=open]:text-on-inverse";

function Trigger({ label }: { label: string }) {
  return (
    <DropdownMenu.Trigger className={trigger}>
      {label}
      <ChevronDownIcon className="size-3" aria-hidden />
    </DropdownMenu.Trigger>
  );
}

/** "Diagrams ▾": the user's diagrams, the three starting points and the templates. Signed-out readers are asked to sign in. */
export function DiagramsMenu() {
  const t = useT();
  const nav = useNavigate();
  const { me } = useMe();
  const { start, pending } = useStartDiagram();
  const guard = (fn: () => void) => () => (me ? fn() : authDialog.open("signin"));
  const kinds: { kind: NewDiagramKind; label: string; Icon: typeof NetworkIcon }[] = [
    { kind: "sdd", label: t("nav.newSystemDesign"), Icon: NetworkIcon },
    { kind: "erd", label: t("nav.newDbDiagram"), Icon: DatabaseIcon },
    { kind: "uml", label: t("nav.newOodDiagram"), Icon: WorkflowIcon },
  ];
  return (
    <DropdownMenu.Root>
      <Trigger label={t("nav.diagrams")} />
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={8} className={`${content} w-64`}>
          <DropdownMenu.Item className={item} onSelect={guard(() => nav({ to: "/d" }))}>
            <FolderIcon aria-hidden /> {t("nav.myDiagrams")}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          {kinds.map(({ kind, label, Icon }) => (
            <DropdownMenu.Item key={kind} className={item} disabled={pending !== null} onSelect={guard(() => start(kind))}>
              <Icon aria-hidden /> {label}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={item} onSelect={() => nav({ to: "/templates" })}>
            <LayoutTemplateIcon aria-hidden /> {t("nav.templates")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** "Categories ▾": the root topics, then all topics. */
export function CategoriesMenu() {
  const t = useT();
  const lang = useLang();
  const nav = useNavigate();
  const topics = useQuery(topicsQuery());
  const top = topics.data ?? [];
  return (
    <DropdownMenu.Root>
      <Trigger label={t("nav.categories")} />
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={8} className={`${content} max-h-[70vh] w-64 overflow-y-auto`}>
          {topics.isPending ? <p className="px-2.5 py-2 text-[13px] text-muted">…</p> : null}
          {top.map((root) => (
            <DropdownMenu.Item key={root.id} className={item} onSelect={() => nav({ to: "/topics/$slug", params: { slug: root.slug } })}>
              <FolderIcon aria-hidden />
              <span className="truncate">{topicName(root, lang)}</span>
              <span className="ml-auto font-mono text-[11px] text-muted tabular-nums">{root.total}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
