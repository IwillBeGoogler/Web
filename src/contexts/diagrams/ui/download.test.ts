import { afterEach, describe, expect, it, vi } from "vitest";
import { saveSdd } from "./download";

describe("saveSdd", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const run = async (name: string) => {
    const created = vi.fn(() => "blob:x");
    const revoked = vi.fn();
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked });
    let download = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      download = this.download;
      expect(this.isConnected).toBe(true);
      expect(this.href).toBe("blob:x");
    });
    await saveSdd(async () => new Blob(["x"]), name);
    return { download, created, revoked };
  };

  it("downloads under a sanitized name, removes the link and revokes the url later", async () => {
    vi.useFakeTimers();
    const { download, created, revoked } = await run("My/diagram: v2 (final)");
    expect(download).toBe("My_diagram_ v2 (final).sdd");
    expect(created).toHaveBeenCalled();
    expect(document.querySelector("a[download]")).toBeNull();
    expect(revoked).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoked).toHaveBeenCalledWith("blob:x");
  });

  it("falls back to 'diagram' and caps the length", async () => {
    vi.useFakeTimers();
    expect((await run("   ")).download).toBe("diagram.sdd");
    expect((await run("a".repeat(300))).download).toBe(`${"a".repeat(100)}.sdd`);
  });
});
