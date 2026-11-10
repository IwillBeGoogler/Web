import { describe, expect, it } from "vitest";
import { threadComments } from "./engagement";
import { errorDetails } from "./feedback";
import { describeNotification, notificationSchema } from "./notification";

describe("engagement domain edges", () => {
  it("orders comments with the same timestamp by id", () => {
    const c = (id: number) => ({ id, post_id: 1, parent_id: 0, user_id: 1, author: "a", text: "t", created_at: "2026-01-01T00:00:00Z", likes: 0 });
    expect(threadComments([c(5), c(2), c(9)] as never).map((n) => n.id)).toEqual([2, 5, 9]);
  });
  it("errorDetails keeps an empty stack when the Error has none", () => {
    const e = new Error("no stack");
    e.stack = undefined;
    expect(errorDetails(e)).toEqual({ message: "no stack", stack: "" });
  });
  it("describes a notification without an actor", () => {
    const n = notificationSchema.parse({ id: 1, type: "follow", actor: "", post_id: 2, created_at: "x" });
    expect(describeNotification(n)).toBe("Someone followed you");
  });
});
