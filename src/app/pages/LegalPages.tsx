import { Bio } from "@/contexts/preferences/ui/BionicText";
import { useHead } from "@/shared/head";
import { useLang, useT } from "@/shared/i18n";
import { LEGAL_UPDATED, type LegalDoc, privacy, terms } from "./legal/content";

function LegalPage({ doc }: { doc: LegalDoc }) {
  const t = useT();
  useHead({ title: doc.title, description: doc.intro.slice(0, 160) });
  return (
    <main id="main" className="mx-auto max-w-[680px] px-6 py-12">
      <h1 className="font-display text-4xl leading-tight font-bold">{doc.title}</h1>
      <p className="mt-2 text-sm text-muted">{t("legal.updated", { date: LEGAL_UPDATED })}</p>
      <p role="note" className="mt-6 rounded border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
        {t("legal.draftNotice")}
      </p>
      <p className="mt-8 font-serif text-lg leading-8">
        <Bio>{doc.intro}</Bio>
      </p>
      {doc.sections.map((s) => (
        <section key={s.h} className="mt-10">
          <h2 className="text-xl font-bold">{s.h}</h2>
          {s.p.map((p) => (
            <p key={p.slice(0, 40)} className="mt-3 font-serif text-lg leading-8">
              <Bio>{p}</Bio>
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}

export function PrivacyPage() {
  return <LegalPage doc={privacy[useLang()]} />;
}

export function TermsPage() {
  return <LegalPage doc={terms[useLang()]} />;
}
