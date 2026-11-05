import { describe, expect, it } from "vitest";
import { imageFiles, imageMarkdown, imageProblem, MAX_IMAGE_BYTES, placeholder, settlePlaceholder, shiftCaret, uploadImages } from "./uploadImages";

const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });

describe("imageProblem", () => {
  it("accepts the avatar types up to 5 MB", () => {
    expect(imageProblem(file("a.png", "image/png"))).toBeNull();
    expect(imageProblem(file("a.png", "image/png", MAX_IMAGE_BYTES))).toBeNull();
    expect(imageProblem(file("a.png", "image/png", MAX_IMAGE_BYTES + 1))).toBe("size");
    expect(imageProblem(file("a.svg", "image/svg+xml"))).toBe("type");
    expect(imageProblem(file("a.pdf", "application/pdf"))).toBe("type");
  });
});

describe("imageFiles", () => {
  it("keeps only images", () => {
    expect(imageFiles([file("a.png", "image/png"), file("b.txt", "text/plain")]).map((f) => f.name)).toEqual(["a.png"]);
    expect(imageFiles(null)).toEqual([]);
  });
});

describe("settlePlaceholder", () => {
  const ph = placeholder("x1");
  it("replaces in place", () => {
    expect(settlePlaceholder(`a\n\n${ph}\n\nb`, "x1", "![c](/u/c.png)")).toBe("a\n\n![c](/u/c.png)\n\nb");
  });
  it("removes the line on failure, without leaving a gap", () => {
    expect(settlePlaceholder(`a\n\n${ph}\n\nb`, "x1", null)).toBe("a\n\nb");
    expect(settlePlaceholder(ph, "x1", null)).toBe("");
  });
  it("leaves text alone when the placeholder was edited away", () => {
    expect(settlePlaceholder("gone", "x1", "![c](/u)")).toBe("gone");
  });
  it("a replacement containing $& is literal", () => {
    expect(settlePlaceholder(ph, "x1", "![$&](/u)")).toBe("![$&](/u)");
  });
});

describe("imageMarkdown", () => {
  it("makes a safe alt from the file name", () => {
    expect(imageMarkdown("/api/uploads/a.png", "my [cool] (pic).png")).toBe("![my cool pic](/api/uploads/a.png)");
  });
});

describe("uploadImages", () => {
  it("places, uploads and settles each valid file; reports the rest", async () => {
    const placed: string[] = [];
    const settled: Record<string, string | null> = {};
    const res = await uploadImages(
      [file("ok.png", "image/png"), file("big.png", "image/png", MAX_IMAGE_BYTES + 1), file("bad.png", "image/png"), file("x.pdf", "application/pdf")],
      async (f) => {
        if (f.name === "bad.png") throw new Error("boom");
        return `/api/uploads/${f.name}`;
      },
      {
        place: (id) => placed.push(id),
        settle: (id, md) => {
          settled[id] = md;
        },
      },
    );
    expect(res.map((r) => r.problem)).toEqual([undefined, "size", "failed", "type"]);
    expect(placed).toHaveLength(2);
    expect(Object.values(settled).sort()).toEqual([null, "![ok](/api/uploads/ok.png)"].sort());
  });
});

describe("shiftCaret", () => {
  it("keeps a caret before the change, moves one after it, and puts one inside at the end", () => {
    expect(shiftCaret(2, 10, 5, 20)).toBe(2);
    expect(shiftCaret(30, 10, 5, 20)).toBe(45);
    expect(shiftCaret(12, 10, 5, 20)).toBe(30);
    expect(shiftCaret(15, 10, 5, 0)).toBe(10);
  });
});
