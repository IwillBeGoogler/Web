import { describe, expect, it } from "vitest";
import { diffStats, revisionDetailSchema } from "./revision";

const rev = { id: 1, post_id: 2, version: 3, title: "T", created_at: "x" };

describe("revision", () => {
  it("counts added and removed ops", () => {
    expect(
      diffStats([
        { op: "+", text: "a" },
        { op: "+", text: "b" },
        { op: "-", text: "c" },
        { op: "=", text: "d" },
      ]),
    ).toEqual({ added: 2, removed: 1 });
    expect(diffStats([])).toEqual({ added: 0, removed: 0 });
  });
  it("detail defaults null or missing diff lists to empty", () => {
    const d = revisionDetailSchema.parse({ ...rev, diff: { title: null, body: [{ op: "+", text: "x" }] } });
    expect(d.diff).toEqual({ title: [], subtitle: [], body: [{ op: "+", text: "x" }], added: 0, removed: 0 });
    expect(d.subtitle).toBe("");
  });
});
