import { describe, expect, it } from "vitest";
import { emptyStory, storyFormSchema, storyToForm, toDraft } from "./story";

const ok = { ...emptyStory(), title: "Hello", body: "text" };

describe("story", () => {
  it("needs a title within 200 bytes", () => {
    expect(storyFormSchema.safeParse({ ...ok, title: " " }).success).toBe(false);
    expect(storyFormSchema.safeParse({ ...ok, title: "ж".repeat(101) }).success).toBe(false);
  });
  it("needs a body to publish but not to save a draft", () => {
    expect(storyFormSchema.safeParse({ ...ok, body: "", status: "published" }).success).toBe(false);
    expect(storyFormSchema.safeParse({ ...ok, body: "", status: "draft" }).success).toBe(true);
  });
  it("limits tags to 5 and checks the cover URL", () => {
    expect(storyFormSchema.safeParse({ ...ok, tags: ["a", "b", "c", "d", "e", "f"] }).success).toBe(false);
    expect(storyFormSchema.safeParse({ ...ok, coverUrl: "javascript:x" }).success).toBe(false);
    expect(storyFormSchema.safeParse({ ...ok, coverUrl: "/api/uploads/a.png" }).success).toBe(true);
  });
  it("maps to the API draft with normalised tags", () => {
    const f = storyFormSchema.parse({ ...ok, tags: ["Go", "go", " DevOps "], status: "published" });
    expect(toDraft(f)).toEqual({
      title: "Hello",
      subtitle: "",
      body: "text",
      status: "published",
      cover_url: "",
      tags: ["go", "devops"],
      publish_at: null,
      publication_id: 0,
    });
  });
  it("maps a post back to the form", () => {
    expect(storyToForm({ title: "T", subtitle: "S", body: "B", status: "draft", cover_url: "c", tags: ["x"] })).toEqual({
      title: "T",
      subtitle: "S",
      body: "B",
      status: "draft",
      coverUrl: "c",
      tags: ["x"],
      publishAt: "",
      publicationId: 0,
    });
  });
});

describe("scheduling", () => {
  it("needs a future time and sends RFC 3339", () => {
    expect(storyFormSchema.safeParse({ ...ok, status: "scheduled", publishAt: "" }).success).toBe(false);
    expect(storyFormSchema.safeParse({ ...ok, status: "scheduled", publishAt: "2001-01-01T10:00" }).success).toBe(false);
    const f = storyFormSchema.parse({ ...ok, status: "scheduled", publishAt: "2099-05-06T07:08", publicationId: 3 });
    expect(toDraft(f).publish_at).toBe(new Date("2099-05-06T07:08").toISOString());
    expect(toDraft(f).publication_id).toBe(3);
    expect(
      storyToForm({ title: "T", subtitle: "", body: "", status: "scheduled", cover_url: "", tags: [], publish_at: new Date("2099-05-06T07:08").toISOString() })
        .publishAt,
    ).toBe("2099-05-06T07:08");
  });
});
