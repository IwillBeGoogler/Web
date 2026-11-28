import { describe, expect, it } from "vitest";
import { jpegToPdf } from "./pdf";

describe("jpegToPdf", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0, 128, 255, 0xff, 0xd9]);
  const pdf = jpegToPdf(jpeg, { width: 3200, height: 2000 }, { width: 1200, height: 750 });
  // one character per byte, so string indexes are byte offsets
  const text = Array.from(pdf, (b) => String.fromCharCode(b)).join("");

  it("writes one page with the JPEG bytes untouched", () => {
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.endsWith("%%EOF\n")).toBe(true);
    expect(text).toContain("/Count 1");
    expect(text).toContain("/MediaBox [0 0 1200 750]");
    expect(text).toContain("/Width 3200 /Height 2000");
    expect(text).toContain(`/Filter /DCTDecode /Length ${jpeg.length}`);
    const start = text.indexOf("stream\n") + "stream\n".length;
    expect(Array.from(pdf.slice(start, start + jpeg.length))).toEqual(Array.from(jpeg));
  });

  it("points the cross reference table at every object", () => {
    const xref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...text.slice(xref).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((o, i) => {
      expect(text.slice(o).startsWith(`${i + 1} 0 obj`)).toBe(true);
    });
  });
});
