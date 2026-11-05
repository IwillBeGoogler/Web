import { describe, expect, it } from "vitest";
import { diffDocuments, firstPage } from "./versionDiff";

const n = (id: string, label: string, type = "service", extra: object = {}) => ({ id, type, position: { x: 0, y: 0 }, data: { label, ...extra } });
const e = (id: string, source: string, target: string, data: object = {}) => ({ id, source, target, data });

describe("diffDocuments", () => {
  it("reads the first page, or the top level of a v1 document", () => {
    expect(firstPage({ pages: [{ nodes: [n("a", "A")], edges: [] }, { nodes: [n("z", "Z")] }] }).nodes).toHaveLength(1);
    expect(firstPage({ nodes: [n("a", "A")], edges: [e("x", "a", "a")] }).edges).toHaveLength(1);
    expect(firstPage(null)).toEqual({ nodes: [], edges: [] });
  });
  it("finds added, removed and changed nodes by id", () => {
    const from = { pages: [{ nodes: [n("a", "API"), n("b", "DB"), n("c", "Cache")], edges: [] }] };
    const to = { pages: [{ nodes: [n("a", "Gateway"), n("c", "Cache", "queue"), n("d", "Worker")], edges: [] }] };
    const d = diffDocuments(from, to);
    expect(d.nodes.added).toEqual([{ id: "d", label: "Worker" }]);
    expect(d.nodes.removed).toEqual([{ id: "b", label: "DB" }]);
    expect(d.nodes.changed.map((x) => x.id)).toEqual(["a", "c"]);
    expect(d.empty).toBe(false);
  });
  it("tracks edges and ignores key order and moves", () => {
    const from = { nodes: [{ ...n("a", "A"), position: { x: 1, y: 1 } }], edges: [e("e1", "a", "b", { x: 1, y: 2 }), e("e2", "a", "b")] };
    const to = { nodes: [n("a", "A")], edges: [e("e1", "a", "b", { y: 2, x: 1 }), e("e3", "b", "a")] };
    const d = diffDocuments(from, to);
    expect(d.nodes.changed).toEqual([]);
    expect(d.edges.added.map((x) => x.id)).toEqual(["e3"]);
    expect(d.edges.removed.map((x) => x.id)).toEqual(["e2"]);
    expect(d.edges.changed).toEqual([]);
  });
  it("is empty for equal documents and survives junk", () => {
    const doc = { pages: [{ nodes: [n("a", "A")], edges: [] }] };
    expect(diffDocuments(doc, structuredClone(doc)).empty).toBe(true);
    expect(diffDocuments("x", undefined).empty).toBe(true);
  });
});
