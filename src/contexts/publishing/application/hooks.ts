import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type StoryForm, toDraft } from "../domain/story";
import { storyRepository } from "../infrastructure/storyRepository";

/** `id` may be a getter, so a save that starts right after a create sees the new id without waiting for a render. */
export function useSaveStory(id: number | undefined | (() => number | undefined)) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (f: StoryForm) => {
      const current = typeof id === "function" ? id() : id;
      return current ? storyRepository.update(current, toDraft(f)) : storyRepository.create(toDraft(f));
    },
    onSuccess: (p) => {
      // the write response has no body_html, so refetch the rendered story
      void qc.invalidateQueries({ queryKey: ["post", p.slug] });
      void qc.invalidateQueries({ queryKey: ["feed"] });
      void qc.invalidateQueries({ queryKey: ["feed-preview"] });
      void qc.invalidateQueries({ queryKey: ["post-id", p.id] });
    },
  });
}

export function useDeleteStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: storyRepository.remove,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["feed"] });
      void qc.invalidateQueries({ queryKey: ["feed-preview"] });
    },
  });
}
