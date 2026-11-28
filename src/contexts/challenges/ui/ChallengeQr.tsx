import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useT } from "@/shared/i18n";

/** QR code of the challenge's address, for sharing offline. */
export function ChallengeQr({ id }: { id: number }) {
  const t = useT();
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(`${location.origin}/challenges/${id}`, { margin: 1, width: 192 }).then(
      (url) => live && setSrc(url),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [id]);
  if (!src) return null;
  return (
    <figure className="w-fit">
      <img src={src} alt={t("challenge.qr")} width={192} height={192} className="rounded-[var(--radius-sm)] border border-line-strong" />
      <figcaption className="mt-2 font-mono text-[11px] text-muted">{t("challenge.qrHint")}</figcaption>
    </figure>
  );
}
