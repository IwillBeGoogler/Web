import { describe, expect, it } from "vitest";
import { decodeCopy, encodeCopy, localDraft, localKey, shouldOfferRestore } from "./localDraft";
import { emptyStory, type StoryForm } from "./story";

const form = (o: Partial<StoryForm> = {}): StoryForm => ({ ...emptyStory(), title: "T", body: "server", ...o });
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe("shouldOfferRestore", () => {
  const server = { form: form(), updatedAt: 1000 };
  it("offers a newer, different copy", () => {
    expect(shouldOfferRestore(decodeCopy(encodeCopy(form({ body: "typed" }), 2000)), server)).toBe(true);
  });
  it("does not offer an older copy, an identical one, or none", () => {
    expect(shouldOfferRestore(decodeCopy(encodeCopy(form({ body: "typed" }), 500)), server)).toBe(false);
    expect(shouldOfferRestore(decodeCopy(encodeCopy(form(), 2000)), server)).toBe(false);
    expect(shouldOfferRestore(null, server)).toBe(false);
  });
  it("for a story not on the server, offers any text but not an empty form", () => {
    expect(shouldOfferRestore(decodeCopy(encodeCopy(form(), 1)), null)).toBe(true);
    expect(shouldOfferRestore(decodeCopy(encodeCopy(emptyStory(), 1)), null)).toBe(false);
  });
});

describe("local copy storage", () => {
  it("round-trips, keyed by id or new, and clears", () => {
    const s = mem();
    expect(localKey(undefined)).toMatch(/new$/);
    expect(localDraft.write(7, form(), 5, s)).toBe(true);
    expect(localDraft.read(7, s)?.form.body).toBe("server");
    expect(localDraft.read(undefined, s)).toBeNull();
    localDraft.clear(7, s);
    expect(localDraft.read(7, s)).toBeNull();
  });
  it("survives broken storage and corrupt data", () => {
    const boom = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(localDraft.write(1, form(), 1, boom)).toBe(false);
    expect(localDraft.read(1, boom)).toBeNull();
    expect(() => localDraft.clear(1, boom)).not.toThrow();
    expect(decodeCopy("{nope")).toBeNull();
    expect(decodeCopy('{"v":1}')).toBeNull();
    expect(localDraft.write(1, form(), 1, null)).toBe(false);
  });
});
