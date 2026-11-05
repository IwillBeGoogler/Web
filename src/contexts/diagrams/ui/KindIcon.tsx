import { DatabaseIcon, LayoutDashboardIcon, NetworkIcon, WorkflowIcon } from "lucide-react";
import type { DiagramKind } from "../domain/diagram";

const icons = { sdd: NetworkIcon, erd: DatabaseIcon, uml: WorkflowIcon, board: LayoutDashboardIcon } as const;

export function KindIcon({ kind, className }: { kind: DiagramKind; className?: string }) {
  const Icon = icons[kind];
  return <Icon className={className} aria-hidden strokeWidth={1.5} />;
}
