import { toJpeg, toPng } from "html-to-image";
import { jpegToPdf } from "@/shared/lib/pdf";

const RATIO = 2;

const bytes = (dataUrl: string) => Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (c) => c.charCodeAt(0));

function save(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}

/** Saves `node` at its own size (any scaling on screen is on an ancestor) as a PNG or a one page PDF. */
export async function downloadCertificate(node: HTMLElement, size: { width: number; height: number }, kind: "png" | "pdf", name: string) {
  await document.fonts?.ready;
  const options = { ...size, pixelRatio: RATIO };
  if (kind === "png") {
    save(await toPng(node, options), `${name}.png`);
    return;
  }
  const jpeg = bytes(await toJpeg(node, { ...options, quality: 0.95 }));
  // 0.75pt per CSS pixel
  const pdf = jpegToPdf(jpeg, { width: size.width * RATIO, height: size.height * RATIO }, { width: size.width * 0.75, height: size.height * 0.75 });
  const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  save(url, `${name}.pdf`);
  // the click only starts the download
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
