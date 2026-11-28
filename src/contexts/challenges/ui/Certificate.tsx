import { AwardIcon } from "lucide-react";
import QRCode from "qrcode";
import { type ReactNode, type Ref, useEffect, useRef, useState } from "react";
import { useT } from "@/shared/i18n";
import type { Certificate as Cert } from "../domain/challenges";

export const CERTIFICATE_SIZE = { width: 1600, height: 1000 };

export const certificateUrl = (id: string) => `${location.origin}/certificates/${id}`;

/**
 * The certificate on a fixed 1600x1000 frame, scaled to the available width. `frameRef` is the unscaled
 * frame itself, so an export of it is full size on any screen.
 */
export function Certificate({ certificate: c, logo, frameRef }: { certificate: Cert; logo: ReactNode; frameRef?: Ref<HTMLDivElement> }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [qr, setQr] = useState("");
  const url = certificateUrl(c.id);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const rescale = () => setScale(el.clientWidth / CERTIFICATE_SIZE.width);
    rescale();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(rescale);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { margin: 1, width: 640 }).then(
      (data) => live && setQr(data),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <div ref={box} className="relative aspect-[8/5] w-full overflow-hidden rounded-[var(--radius-sm)] border border-line-strong">
      <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
        <div ref={frameRef} className="certificate flex h-[1000px] w-[1600px] overflow-hidden font-sans">
          <div className="flex min-w-0 flex-1 flex-col p-[80px]">
            <div className="flex items-center justify-between gap-8">
              <div className="origin-left scale-[1.6]">{logo}</div>
              <span className="font-mono text-[22px] text-[var(--cert-muted)]">iwillbegoogler.uz</span>
            </div>
            <div className="my-auto">
              <p className="line-clamp-2 font-display text-[76px] leading-[1.1] font-extrabold tracking-[-0.03em] break-words">{c.holder_name}</p>
              <div className="my-8 h-[6px] w-[120px] bg-[var(--cert-accent)]" />
              <p className="line-clamp-3 font-display text-[44px] leading-[1.2] font-bold break-words">{c.title}</p>
              <p className="mt-5 text-[28px] text-[var(--cert-muted)]">{t("certificate.completed", { n: c.days })}</p>
              <p className="mt-8 font-mono text-[24px]">
                {c.start_date} – {c.end_date}
              </p>
              <p className="mt-2 font-mono text-[24px]">{t("certificate.result", { done: c.days_done, days: c.days, streak: c.best_streak })}</p>
            </div>
            <div className="font-mono text-[18px] text-[var(--cert-muted)]">
              <p>{t("certificate.id", { id: c.id })}</p>
              <p className="mt-1 break-all">{url}</p>
            </div>
          </div>
          <div className="flex w-[480px] shrink-0 flex-col items-center justify-between bg-[var(--cert-panel)] p-[80px] text-[var(--cert-panel-ink)]">
            <div className="flex flex-col items-center">
              <span className="grid size-[200px] place-items-center rounded-full border-[6px] border-[var(--cert-accent)]">
                <AwardIcon className="size-[110px]" strokeWidth={1.25} aria-hidden />
              </span>
              <p className="mt-6 font-display text-[40px] font-bold">{t("challenge.nDays", { n: c.days })}</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="size-[300px] rounded-[16px] bg-[var(--cert-paper)] p-[10px]">
                {qr ? <img src={qr} alt={t("certificate.qr")} width={280} height={280} className="size-full" /> : null}
              </div>
              <p className="mt-5 text-center text-[22px]">{t("certificate.scan")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
