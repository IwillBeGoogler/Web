import { useSyncExternalStore } from "react";
import { setErrorReporter } from "@/shared/ui/toast";
import type { ErrorDetails, FeedbackKind } from "../domain/feedback";

/** What opens the feedback dialog: an optional preset kind and the error being reported. */
export interface FeedbackRequest {
  kind?: FeedbackKind;
  error?: ErrorDetails;
}

let req: FeedbackRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export const feedbackDialog = {
  open: (r: FeedbackRequest = {}) => {
    req = r;
    emit();
  },
  close: () => {
    req = null;
    emit();
  },
  get: () => req,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export const useFeedbackDialog = () => useSyncExternalStore(feedbackDialog.subscribe, feedbackDialog.get, feedbackDialog.get);

setErrorReporter((message) => feedbackDialog.open({ kind: "bug", error: { message, stack: "" } }));
