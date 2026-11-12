import { describe, expect, it } from "vitest";
import { buildTree, pathTo, type Topic, topicName, topicSchema } from "./topic";

const row = (o: Partial<Topic> & { id: number }): Topic => topicSchema.parse({ slug: `s${o.id}`, name: `N${o.id}`, ...o });

describe("topicSchema", () => {
  it("fills defaults and turns null names into {}", () => {
    const t = topicSchema.parse({ id: 1, slug: "a", name: "A", names: null });
    expect(t).toEqual({ id: 1, parent_id: 0, slug: "a", name: "A", names: {}, description: "", position: 0, count: 0 });
  });
});

describe("topicName", () => {
  const t = { name: "Caching", names: { uz: "Keshlash", ru: "" } };
  it("uses the reader's language, else English", () => {
    expect(topicName(t, "en")).toBe("Caching");
    expect(topicName(t, "uz")).toBe("Keshlash");
    expect(topicName(t, "ru")).toBe("Caching");
  });
});

describe("buildTree", () => {
  const rows = [
    row({ id: 1, name: "B", position: 1, count: 1 }),
    row({ id: 2, name: "A", position: 1, count: 2 }),
    row({ id: 3, name: "Z", position: 0, count: 4 }),
    row({ id: 4, parent_id: 1, name: "Child", position: 0, count: 8 }),
    row({ id: 5, parent_id: 4, name: "Grand", position: 0, count: 16 }),
    row({ id: 6, parent_id: 99, name: "Orphan", position: 5, count: 32 }),
  ];
  const forest = buildTree(rows);
  it("orders by position, then name, orphans become roots", () => {
    expect(forest.map((n) => n.name)).toEqual(["Z", "A", "B", "Orphan"]);
  });
  it("sums subtree totals", () => {
    const b = forest.find((n) => n.id === 1);
    expect(b?.total).toBe(1 + 8 + 16);
    expect(b?.children[0]?.children[0]?.total).toBe(16);
  });
  it("finds the path to a slug", () => {
    expect(pathTo(forest, "s5").map((n) => n.id)).toEqual([1, 4, 5]);
    expect(pathTo(forest, "s3").map((n) => n.id)).toEqual([3]);
    expect(pathTo(forest, "nope")).toEqual([]);
  });
});
