import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AwardIcon, BadgeCheckIcon, DownloadIcon, OctagonXIcon } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useHead } from "@/shared/head";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Bone, EmptyState, Loading } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";
import { certificateQuery } from "../application/hooks";
import { downloadCertificate } from "../infrastructure/exportCertificate";
import { CERTIFICATE_SIZE, Certificate } from "./Certificate";

/** The public verify page behind a certificate's QR code. */
export function CertificatePage({ id, logo }: { id: string; logo: ReactNode }) {
  const t = useT();
  const q = useQuery(certificateQuery(id));
  const frame = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"png" | "pdf">();
  useHead({ title: q.data ? `${q.data.title} · ${q.data.holder_name}` : undefined, noindex: true });
  if (q.isPending)
    return (
      <Loading>
        <Bone className="aspect-[8/5] w-full" />
      </Loading>
    );
  if (q.isError) return <EmptyState icon={AwardIcon} heading="h1" title={t("certificate.notFound")} />;
  const c = q.data;
  const revoked = !!c.revoked_at;
  const Icon = revoked ? OctagonXIcon : BadgeCheckIcon;
  const download = async (kind: "png" | "pdf") => {
    if (!frame.current) return;
    setBusy(kind);
    try {
      await downloadCertificate(frame.current, CERTIFICATE_SIZE, kind, `certificate-${c.id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <>
      <div
        role="status"
        className={cn("mb-6 flex gap-3 rounded-[var(--radius-md)] border bg-card p-4", revoked ? "border-danger text-danger" : "border-accent")}
      >
        <Icon className="mt-0.5 size-6 shrink-0" aria-hidden />
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold">{t(revoked ? "certificate.revoked" : "certificate.verified")}</h1>
          <p className="text-sm text-muted">
            {revoked ? t("certificate.revokedOn", { date: c.revoked_at?.slice(0, 10) ?? "" }) : t("certificate.issuedOn", { date: c.issued_at.slice(0, 10) })}
          </p>
          {revoked && c.revoke_reason ? <p className="mt-1 text-sm break-words text-fg">{c.revoke_reason}</p> : null}
        </div>
      </div>
      <Certificate certificate={c} logo={logo} frameRef={frame} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {revoked ? null : (
          <>
            <Button size="sm" loading={busy === "png"} disabled={!!busy} onClick={() => void download("png")}>
              <DownloadIcon className="size-4" aria-hidden />
              PNG
            </Button>
            <Button size="sm" variant="outline" loading={busy === "pdf"} disabled={!!busy} onClick={() => void download("pdf")}>
              <DownloadIcon className="size-4" aria-hidden />
              PDF
            </Button>
          </>
        )}
        {c.challenge_id ? (
          <Link to="/challenges/$id" params={{ id: String(c.challenge_id) }} className="ml-auto text-sm underline underline-offset-4">
            {t("certificate.challenge")}
          </Link>
        ) : null}
      </div>
    </>
  );
}
