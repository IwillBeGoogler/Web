import { describe, expect, it } from "vitest";
import { commentSearch, describeNotification, diagramTarget, notificationSchema } from "./notification";

const n = (type: string) => notificationSchema.parse({ id: 1, type, actor: "ali", post_id: 2, created_at: "x" });

describe("notifications", () => {
  it("describes each kind", () => {
    expect(describeNotification(n("follow"))).toBe("ali followed you");
    expect(describeNotification(n("like"))).toBe("ali sparked your story");
    expect(describeNotification(n("comment"))).toBe("ali responded to your story");
    expect(describeNotification(n("reply"))).toBe("ali replied to your response");
    expect(describeNotification(n("new_post"))).toBe("ali published a new story");
    expect(describeNotification(n("mention"))).toBe("ali mentioned you");
    expect(describeNotification(n("comment_like"))).toBe("ali liked your response");
    expect(describeNotification(n("weird"))).toBe("ali interacted with you");
  });
  it("unread when read_at is missing", () => {
    expect(n("follow").unread).toBe(true);
    expect(notificationSchema.parse({ id: 1, type: "x", created_at: "x", read_at: "y" }).unread).toBe(false);
  });
  it("diagram notifications show the server's sentence, or a fallback, and link to the file and comment", () => {
    const d = (o: object) =>
      notificationSchema.parse({
        id: 2,
        type: "diagram_mention",
        actor: "ali",
        created_at: "x",
        diagram_project_id: "p1",
        diagram_file_id: "f1",
        diagram_comment_id: "9",
        ...o,
      });
    expect(describeNotification(d({ text: "ali mentioned you in Auth flow" }))).toBe("ali mentioned you in Auth flow");
    expect(describeNotification(d({}))).toBe("ali mentioned you in a diagram comment");
    expect(describeNotification(d({ type: "diagram_reply" }))).toBe("ali replied to your diagram comment");
    expect(describeNotification(d({ type: "diagram_comment" }))).toBe("ali commented on a diagram");
    expect(diagramTarget(d({}))).toEqual({ fileId: "f1", comment: "9" });
    expect(diagramTarget(d({ diagram_comment_id: "" }))).toEqual({ fileId: "f1" });
    expect(diagramTarget(d({ diagram_file_id: "" }))).toBeNull();
    expect(diagramTarget(n("mention"))).toBeNull();
    expect(n("mention").text).toBe("");
    expect(commentSearch("42")).toBe(42);
    expect(commentSearch("9007199254740993")).toBe("9007199254740993");
    expect(commentSearch("c_1")).toBe("c_1");
  });
});
