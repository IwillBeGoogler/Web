import { Dashboard } from "@/contexts/diagrams/ui/Dashboard";
import { EditorHost } from "@/contexts/diagrams/ui/EditorHost";
import { ProjectTree } from "@/contexts/diagrams/ui/ProjectTree";
import { PublicViewer } from "@/contexts/diagrams/ui/PublicViewer";
import { Templates } from "@/contexts/diagrams/ui/Templates";
import { useHead } from "@/shared/head";
import { useT } from "@/shared/i18n";
import { HomeGrid } from "./HomePage";

export function DiagramsPage() {
  const t = useT();
  useHead({ title: t("dg.tab"), noindex: true });
  return (
    <main id="main">
      <HomeGrid aside={false}>
        <Dashboard />
      </HomeGrid>
    </main>
  );
}

/** The title is the project's name, set by `ProjectTree` once the tree is loaded. */
export function DiagramProjectPage({ projectId }: { projectId: string }) {
  return (
    <main id="main">
      <HomeGrid aside={false}>
        <ProjectTree projectId={projectId} />
      </HomeGrid>
    </main>
  );
}

export function DiagramFilePage({ fileId, commentId }: { fileId: string; commentId?: string | undefined }) {
  useHead({ title: "Diagram", noindex: true });
  return (
    <main id="main">
      <EditorHost fileId={fileId} {...(commentId ? { commentId } : {})} />
    </main>
  );
}

export function DiagramSharePage({ token }: { token: string }) {
  useHead({ title: "Shared diagram", noindex: true });
  return (
    <main id="main">
      <EditorHost shareToken={token} />
    </main>
  );
}

export function DiagramViewPage({ slug }: { slug: string }) {
  return <PublicViewer slug={slug} />;
}

export function TemplatesPage() {
  const t = useT();
  useHead({ title: t("dg.templates"), description: t("dg.templates.lead"), canonical: "/templates" });
  return (
    <main id="main">
      <HomeGrid aside={false}>
        <Templates />
      </HomeGrid>
    </main>
  );
}
