import { useNavigate } from "@tanstack/react-router";
import { Wordmark } from "@/app/layout/Logo";
import { CertificatePage } from "@/contexts/challenges/ui/CertificatePage";
import { ChallengeForm } from "@/contexts/challenges/ui/ChallengeForm";
import { ChallengePage } from "@/contexts/challenges/ui/ChallengePage";
import { ChallengesList } from "@/contexts/challenges/ui/ChallengesList";
import { useHead } from "@/shared/head";
import { useT } from "@/shared/i18n";

const Shell = ({ children }: { children: React.ReactNode }) => (
  <main id="main" className="mx-auto max-w-feed px-4 py-8 pb-24 md:px-6">
    {children}
  </main>
);

export function ChallengesRoute() {
  const t = useT();
  useHead({ title: t("challenge.heading"), description: t("challenge.lead") });
  return (
    <Shell>
      <ChallengesList />
    </Shell>
  );
}

export function NewChallengeRoute() {
  const t = useT();
  const nav = useNavigate();
  useHead({ title: t("challenge.new"), noindex: true });
  return (
    <Shell>
      <h1 className="mb-6 font-display text-[32px] font-bold tracking-tight">{t("challenge.new")}</h1>
      <ChallengeForm onDone={(c) => void nav({ to: "/challenges/$id", params: { id: String(c.id) } })} />
    </Shell>
  );
}

export function ChallengeRoute({ id }: { id: number }) {
  return (
    <Shell>
      <ChallengePage key={id} id={id} />
    </Shell>
  );
}

export function CertificateRoute({ id }: { id: string }) {
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-8 pb-24 md:px-6">
      <CertificatePage key={id} id={id} logo={<Wordmark />} />
    </main>
  );
}
