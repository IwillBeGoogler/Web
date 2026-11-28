import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { type MessageKey, useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Field, inputCls, ServerError } from "@/shared/ui/form";
import { useChallengeMutations } from "../application/hooks";
import { type Challenge, challengeInputSchema, LENGTHS, localTimezone, MAX_DAYS, MIN_DAYS } from "../domain/challenges";

function Pills<T extends string>({ label, value, onChange, items }: { label: string; value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {items.map(([id, text]) => (
          <Button key={id} variant={value === id ? "primary" : "outline"} size="sm" aria-pressed={value === id} onClick={() => onChange(id)}>
            {text}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

/** Creates a challenge, or edits one: length and time zone are fixed once it starts. */
export function ChallengeForm({ initial, onDone }: { initial?: Challenge; onDone: (c: Challenge) => void }) {
  const t = useT();
  const m = useChallengeMutations();
  const f = useForm({
    resolver: zodResolver(challengeInputSchema),
    defaultValues: {
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      days: initial?.days ?? 100,
      visibility: initial?.visibility ?? ("public" as const),
    },
  });
  const days = useWatch({ control: f.control, name: "days" });
  const visibility = useWatch({ control: f.control, name: "visibility" });
  const [custom, setCustom] = useState(false);
  const err = (k: string | undefined) => (k ? t(k as MessageKey) : undefined);
  const mut = initial ? m.update : m.create;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={f.handleSubmit(({ days, ...v }) =>
        initial
          ? m.update.mutate({ id: initial.id, body: v }, { onSuccess: onDone })
          : m.create.mutate({ ...v, days, timezone: localTimezone() }, { onSuccess: onDone }),
      )}
    >
      <ServerError error={mut.error} />
      <Field label={t("challenge.title")} error={err(f.formState.errors.title?.message)}>
        {(a) => <input {...a} className={inputCls} {...f.register("title")} />}
      </Field>
      <Field label={t("challenge.description")} error={err(f.formState.errors.description?.message)}>
        {(a) => <textarea {...a} className={cn(inputCls, "h-20 py-2")} {...f.register("description")} />}
      </Field>
      {initial ? null : (
        <>
          <Pills
            label={t("challenge.length")}
            value={custom ? "custom" : String(days)}
            onChange={(v) => {
              setCustom(v === "custom");
              if (v !== "custom") f.setValue("days", Number(v), { shouldValidate: f.formState.isSubmitted });
            }}
            items={[...LENGTHS.map((n): [string, string] => [String(n), t("challenge.nDays", { n })]), ["custom", t("challenge.custom")]]}
          />
          {custom ? (
            <Field label={t("challenge.customDays")} error={err(f.formState.errors.days?.message)}>
              {(a) => <input {...a} type="number" min={MIN_DAYS} max={MAX_DAYS} className={inputCls} {...f.register("days", { valueAsNumber: true })} />}
            </Field>
          ) : null}
          <p className="font-mono text-[11px] text-muted">{t("challenge.startsToday", { zone: localTimezone() })}</p>
        </>
      )}
      <Pills
        label={t("challenge.visibility")}
        value={visibility}
        onChange={(v) => f.setValue("visibility", v, { shouldDirty: true })}
        items={[
          ["public", t("challenge.public")],
          ["private", t("challenge.private")],
        ]}
      />
      <p className="font-mono text-[11px] text-muted">{t("challenge.visibilityHint")}</p>
      <Button type="submit" variant="accent" loading={mut.isPending}>
        {initial ? t("challenge.save") : t("challenge.start")}
      </Button>
    </form>
  );
}
