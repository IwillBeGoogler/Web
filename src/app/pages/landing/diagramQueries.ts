import { queryOptions } from "@tanstack/react-query";
import { diagramRepository } from "@/contexts/diagrams/infrastructure/diagramRepository";

/** Landing teasers: published templates (all, trimmed by the view) and the newest public diagrams. */
export const landingTemplatesQuery = () =>
  queryOptions({ queryKey: ["landing", "templates"], queryFn: ({ signal }) => diagramRepository.templates(signal), staleTime: 5 * 60_000, retry: false });

export const landingRecentQuery = () =>
  queryOptions({
    queryKey: ["landing", "recent-diagrams"],
    queryFn: async ({ signal }) => (await diagramRepository.publicDiagrams({}, { limit: 6 }, signal)).items,
    staleTime: 5 * 60_000,
    retry: false,
  });
