import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, DatabaseIcon, LayoutTemplateIcon, NetworkIcon, PenLineIcon, WorkflowIcon } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { useT } from "@/shared/i18n";
import { toast } from "@/shared/ui/toast";
import { useCreateDiagram } from "../application/hooks";
import type { NewDiagramKind } from "../domain/diagram";

const item =
  "flex h-9 cursor-pointer items-center gap-3 rounded-[var(--radius-xs)] px-2.5 text-[13px] text-fg outline-none data-[highlighted]:bg-inverse data-[highlighted]:text-on-inverse [&_svg]:size-4 [&_svg]:text-muted data-[highlighted]:[&_svg]:text-on-inverse";

/** Creates a project with its first file, then opens it in the editor. */
export function useStartDiagram() {
  const nav = useNavigate();
  const create = useCreateDiagram();
  return {
    /** the kind being created, so only its button spins (and the others wait) */
    pending: create.isPending ? (create.variables?.kind ?? null) : null,
    start: (kind: NewDiagramKind) =>
      create.mutate(
        { kind },
        {
          onSuccess: ({ fileId }) => void nav({ to: "/d/f/$fileId", params: { fileId } }),
          onError: (e) => {
            // an expired session reaches here once the editor's own 401 handling is not involved yet
            if ((e as { status?: number }).status === 401) authDialog.open("signin");
            else toast.error(e);
          },
        },
      ),
  };
}

/**
 * The chevron next to "Write": the same menu, with the diagram editor's three starting points under "New story".
 * The Write button itself is untouched.
 */
export function WriteMenu() {
  const t = useT();
  const nav = useNavigate();
  const { start, pending } = useStartDiagram();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={t("nav.writeMenu")}
        disabled={pending !== null}
        className="hidden size-8 items-center justify-center rounded-[var(--radius-sm)] border border-line-strong text-muted hover:border-fg hover:text-fg disabled:opacity-40 data-[state=open]:border-fg data-[state=open]:text-fg md:inline-flex"
      >
        <ChevronDownIcon className="size-3.5" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="menu-pop z-50 w-60 overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-card p-1 shadow-[3px_3px_0_0_var(--fg)]"
        >
          <DropdownMenu.Item className={item} onSelect={() => nav({ to: "/new-story" })}>
            <PenLineIcon aria-hidden /> {t("nav.newStory")}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={item} onSelect={() => start("sdd")}>
            <NetworkIcon aria-hidden /> {t("nav.newSystemDesign")}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => start("erd")}>
            <DatabaseIcon aria-hidden /> {t("nav.newDbDiagram")}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => start("uml")}>
            <WorkflowIcon aria-hidden /> {t("nav.newOodDiagram")}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={item} onSelect={() => nav({ to: "/templates" })}>
            <LayoutTemplateIcon aria-hidden /> {t("nav.templates")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
