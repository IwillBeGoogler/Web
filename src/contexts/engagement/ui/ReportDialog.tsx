import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Field, inputCls, ServerError } from "@/shared/ui/form";
import { Modal } from "@/shared/ui/modal";
import { toast } from "@/shared/ui/toast";
import { useReport } from "../application/hooks";
import { type ReportInput, type ReportTarget, reasonLabels, reasons, reportSchema } from "../domain/report";

const what = { post: "story", comment: "response", user: "account", diagram: "diagram" } as const;

export function ReportDialog({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const m = useReport();
  const f = useForm<ReportInput>({ resolver: zodResolver(reportSchema), defaultValues: { reason: "spam", note: "" } });
  const reason = useWatch({ control: f.control, name: "reason" });
  const note = useWatch({ control: f.control, name: "note" }) ?? "";
  return (
    <Modal
      open={!!target}
      onOpenChange={(o) => {
        if (o) return;
        f.reset();
        m.reset();
        onClose();
      }}
      title={`Report ${target ? what[target.type] : ""}`}
      description="Moderators review every report."
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={f.handleSubmit(
          (v) =>
            target &&
            m.mutate(
              { target, ...v },
              {
                onSuccess: () => {
                  toast.ok("Thanks — we'll take a look.");
                  f.reset();
                  onClose();
                },
              },
            ),
        )}
      >
        <ServerError error={m.error} />
        <fieldset className="grid gap-2 md:grid-cols-2">
          <legend className="kicker mb-2">Reason</legend>
          {reasons.map((r, i) => (
            <label
              key={r}
              className="flex h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 text-sm has-[:checked]:border-fg has-[:checked]:bg-inverse has-[:checked]:text-on-inverse has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
            >
              <input type="radio" value={r} className="sr-only" {...f.register("reason")} />
              <span aria-hidden className="idx text-[11px] text-current opacity-70">
                {String(i + 1).padStart(2, "0")}
              </span>
              {reasonLabels[r]}
            </label>
          ))}
        </fieldset>
        <Field label={reason === "other" ? "What's wrong?" : "Details (optional)"} error={f.formState.errors.note?.message}>
          {(a) => <textarea {...a} className={cn(inputCls, "h-auto min-h-24 resize-y py-1")} maxLength={1000} {...f.register("note")} />}
        </Field>
        <div className="flex items-center justify-between border-t border-line pt-4">
          <span className="font-mono text-[11px] text-muted tabular-nums">{note.length}/1000</span>
          <Button type="submit" variant="primary" loading={m.isPending}>
            Submit report
          </Button>
        </div>
      </form>
    </Modal>
  );
}
