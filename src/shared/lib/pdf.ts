/**
 * A one page PDF showing a JPEG over the whole page. The JPEG bytes are embedded as they are (DCTDecode);
 * it must be RGB, as canvas exports are. Image size is in pixels, page size in points.
 */
export function jpegToPdf(
  jpeg: Uint8Array,
  image: { width: number; height: number },
  page: { width: number; height: number } = image,
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (...body: (string | Uint8Array)[]) => {
    offsets.push(length);
    push(`${offsets.length} 0 obj\n`);
    for (const part of body) push(part);
    push("\nendobj\n");
  };
  const draw = `q ${page.width} 0 0 ${page.height} 0 0 cm /Im0 Do Q`;

  push("%PDF-1.4\n");
  object("<< /Type /Catalog /Pages 2 0 R >>");
  object("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  object(
    `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    jpeg,
    "\nendstream",
  );
  object(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);

  const xref = length;
  push(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
  for (const o of offsets) push(`${String(o).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
