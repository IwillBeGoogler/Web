import { toast as sonner } from "sonner";
import { explainError } from "@/shared/http/explain";
import { i18n } from "@/shared/i18n";

let reporter: ((detail: string) => void) | null = null;

/** The feedback dialog registers here, so a toast can offer "Report" without the UI layer knowing about it. */
export const setErrorReporter = (fn: ((detail: string) => void) | null) => {
  reporter = fn;
};

export const toast = {
  ok: (m: string) => sonner(m),
  /**
   * A string is shown as it is (our own copy, no report action). Any other failure is explained
   * in the user's language, with a reference code and a "Report" action when it is ours to fix.
   */
  error: (e: unknown) => {
    if (typeof e === "string") return sonner.error(e, { duration: 6000 });
    const x = explainError(e, i18n.t);
    const report = reporter;
    sonner.error(x.text, {
      duration: 6000,
      ...(x.ref ? { description: i18n.t("err.ref", { id: x.ref }) } : {}),
      ...(x.reportable && report ? { action: { label: i18n.t("err.report"), onClick: () => report(x.detail) } } : {}),
    });
  },
};
