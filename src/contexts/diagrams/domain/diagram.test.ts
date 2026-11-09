import { describe, expect, it } from "vitest";
import { buildTree, type DiagramFile, type DiagramFolder } from "./diagram";

const file = (id: string, name: string, folderId: string | null, position = 0): DiagramFile => ({
  id,
  projectId: "p",
  folderId,
  name,
  kind: "sdd",
  position,
  version: 1,
  pageCount: 1,
  createdAt: 0,
  updatedAt: 0,
});
const folder = (id: string, name: string, parentId: string | null, position = 0): DiagramFolder => ({ id, projectId: "p", parentId, name, position });

describe("buildTree", () => {
  it("lists folders before files, ordered by position then name, and nests children", () => {
    const tree = buildTree({
      folders: [folder("f2", "Zeta", null, 1), folder("f1", "Alpha", null, 1), folder("sub", "Inner", "f1")],
      files: [file("b", "b", null, 2), file("a", "a", null, 2), file("in", "in", "sub"), file("top", "top", null, 0)],
    });
    expect(tree.map((n) => (n.kind === "folder" ? `d:${n.folder.name}` : `f:${n.file.name}`))).toEqual(["d:Alpha", "d:Zeta", "f:top", "f:a", "f:b"]);
    const alpha = tree[0];
    expect(alpha?.kind === "folder" && alpha.children.map((c) => (c.kind === "folder" ? c.folder.name : c.file.name))).toEqual(["Inner"]);
  });
  it("puts an entry whose folder is unknown at the top instead of dropping it", () => {
    const tree = buildTree({ folders: [], files: [file("x", "x", "gone")] });
    expect(tree).toHaveLength(1);
  });
});

describe("publishing helpers", () => {
  it("builds the embed line and reads a slug from a link or the bare slug", async () => {
    const { diagramEmbedLine, slugFromInput } = await import("./diagram");
    expect(diagramEmbedLine("checkout-1a2b3c4d")).toBe("::diagram{slug=checkout-1a2b3c4d}");
    expect(slugFromInput("https://iwillbegoogler.dev/d/v/checkout-1a2b3c4d?x=1")).toBe("checkout-1a2b3c4d");
    expect(slugFromInput("  checkout-1a2b3c4d ")).toBe("checkout-1a2b3c4d");
    expect(slugFromInput("/d/v/abc")).toBeNull();
    expect(slugFromInput("not a link!")).toBeNull();
  });
  it("normalizes tags like the blog: lower case, no #, unique, at most 10", async () => {
    const { normalizeTags } = await import("./diagram");
    expect(normalizeTags("#Kafka, system design,kafka,, ")).toEqual(["kafka", "system-design"]);
    expect(normalizeTags(Array.from({ length: 14 }, (_, i) => `t${i}`).join(","))).toHaveLength(10);
  });
});
