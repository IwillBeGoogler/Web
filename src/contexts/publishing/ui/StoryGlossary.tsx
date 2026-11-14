import { PencilIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { type MessageKey, useT } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Field, inputCls } from "@/shared/ui/form";
import { Modal } from "@/shared/ui/modal";
import { cleanEntry, entryProblem, type GlossaryEntry, type GlossaryProblem, parseAliases } from "../domain/glossary";

const problemKey: Record<GlossaryProblem, MessageKey> = {
  required: "glossary.err.required",
  termLong: "glossary.err.termLong",
  definitionLong: "glossary.err.definitionLong",
  aliases: "glossary.err.aliases",
  entries: "glossary.err.entries",
  duplicate: "glossary.err.duplicate",
};

/** `index` -1 adds a term; otherwise it edits that entry. */
export type GlossaryDraft = { index: number; term: string };

/** Add or edit one term of the story. Article scope only: site-wide terms belong to admins. */
export function GlossaryDialog({
  draft,
  terms,
  onSave,
  onClose,
}: {
  draft: GlossaryDraft | null;
  terms: GlossaryEntry[];
  onSave: (index: number, entry: GlossaryEntry) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [term, setTerm] = useState("");
  const [aliases, setAliases] = useState("");
  const [definition, setDefinition] = useState("");
  const [error, setError] = useState<GlossaryProblem | null>(null);

  const termsRef = useRef(terms);
  termsRef.current = terms;
  // load the entry being edited (or the selected text) each time the dialog opens, not on every render of the owner
  useEffect(() => {
    if (!draft) return;
    const existing = draft.index >= 0 ? termsRef.current[draft.index] : undefined;
    setTerm(existing?.term ?? draft.term);
    setAliases(existing?.aliases.join(", ") ?? "");
    setDefinition(existing?.definition ?? "");
    setError(null);
  }, [draft]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draft) return;
    const entry: GlossaryEntry = { term, aliases: parseAliases(aliases), definition };
    const problem = entryProblem(
      entry,
      terms.filter((_, i) => i !== draft.index),
    );
    if (problem) return setError(problem);
    onSave(draft.index, cleanEntry(entry));
  };

  return (
    <Modal
      open={draft !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t(draft && draft.index >= 0 ? "glossary.edit" : "glossary.add")}
      description={t("glossary.lead")}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label={t("glossary.term")} error={error ? t(problemKey[error]) : undefined}>
          {(a) => <input {...a} className={inputCls} value={term} onChange={(e) => setTerm(e.target.value)} />}
        </Field>
        <Field label={t("glossary.aliases")} hint={t("glossary.aliasesHint")}>
          {(a) => <input {...a} className={inputCls} value={aliases} onChange={(e) => setAliases(e.target.value)} />}
        </Field>
        <Field label={t("glossary.definition")}>
          {(a) => (
            <textarea
              {...a}
              rows={4}
              className="w-full resize-y bg-transparent text-[15px] outline-none"
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="accent">
          {t("glossary.save")}
        </Button>
      </form>
    </Modal>
  );
}

/** The story's own terms with edit and remove. */
export function GlossaryPanel({ terms, onEdit, onRemove }: { terms: GlossaryEntry[]; onEdit: (i: number) => void; onRemove: (i: number) => void }) {
  const t = useT();
  return (
    <section aria-label={t("glossary.title")} className="focus-hide mt-10 border-t border-line pt-4">
      <h2 className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">{t("glossary.title")}</h2>
      {terms.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t("glossary.empty")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {terms.map((g, i) => (
            <li key={g.term} className="flex items-start gap-2 py-2">
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-bold">{g.term}</span>
                {g.aliases.length ? <span className="text-muted"> ({g.aliases.join(", ")})</span> : null}
                <p className="text-muted">{g.definition}</p>
              </div>
              <Button variant="ghost-icon" aria-label={`${t("glossary.edit")}: ${g.term}`} onClick={() => onEdit(i)}>
                <PencilIcon aria-hidden />
              </Button>
              <Button variant="ghost-icon" aria-label={`${t("glossary.remove")}: ${g.term}`} onClick={() => onRemove(i)}>
                <Trash2Icon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
