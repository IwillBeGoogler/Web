import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Mod = typeof import("./splash");

const mount = (withRoot = true) => {
  document.body.innerHTML = withRoot ? '<div id="root"></div>' : "";
};
const makeSplash = () => {
  const s = document.createElement("div");
  s.id = "splash";
  s.className = "gl out brand";
  s.textContent = "hi";
  return s;
};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("splash", () => {
  let m: Mod;
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    mount();
    m = await import("./splash");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
    Reflect.deleteProperty(window, "__splashReplay");
  });

  it("does nothing before a splash was kept", () => {
    m.playSplash();
    expect(document.getElementById("splash")).toBeNull();
  });

  it("does nothing while a splash is on screen or under reduced motion", () => {
    m.keepSplash(makeSplash());
    document.body.append(makeSplash());
    m.playSplash();
    expect(document.querySelectorAll("#splash")).toHaveLength(1);
    document.body.innerHTML = '<div id="root"></div>';
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    m.playSplash();
    expect(document.getElementById("splash")).toBeNull();
  });

  it("mounts a clean copy, runs splash.js, then hides after the scene is ready", async () => {
    m.keepSplash(makeSplash());
    m.playSplash(500);
    const el = document.getElementById("splash") as HTMLElement;
    expect(el.classList.contains("gl")).toBe(false);
    expect(el.classList.contains("out")).toBe(false);
    expect(el.classList.contains("brand")).toBe(true);
    const root = document.getElementById("root") as HTMLElement;
    expect(root.hasAttribute("inert")).toBe(true);
    expect((window as unknown as { __splashReplay?: boolean }).__splashReplay).toBe(true);
    const script = document.querySelector("script[src='/splash.js']") as HTMLScriptElement;
    expect(script).not.toBeNull();
    script.onload?.(new Event("load"));
    expect(document.querySelector("script[src='/splash.js']")).toBeNull();
    expect((window as unknown as { __splashReplay?: boolean }).__splashReplay).toBeUndefined();

    el.classList.add("other"); // not ready yet
    await flush();
    vi.advanceTimersByTime(600);
    expect(el.classList.contains("out")).toBe(false);
    el.classList.add("gl");
    await flush();
    vi.advanceTimersByTime(499);
    expect(el.classList.contains("out")).toBe(false);
    vi.advanceTimersByTime(1);
    expect(el.classList.contains("out")).toBe(true);
    expect(root.hasAttribute("inert")).toBe(false);
    vi.advanceTimersByTime(600);
    expect(el.isConnected).toBe(false);
    vi.advanceTimersByTime(5000); // cap was cleared: no second hide
  });

  it("caps the wait at 4s when the scene never reports ready", () => {
    m.keepSplash(makeSplash());
    m.playSplash();
    const el = document.getElementById("splash") as HTMLElement;
    vi.advanceTimersByTime(3999);
    expect(el.classList.contains("out")).toBe(false);
    vi.advanceTimersByTime(1);
    expect(el.classList.contains("out")).toBe(true);
  });

  it("popstate cancels, and a late ready timer does not hide twice", async () => {
    m.keepSplash(makeSplash());
    m.playSplash(100);
    const el = document.getElementById("splash") as HTMLElement;
    el.classList.add("gl");
    await flush();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(el.classList.contains("out")).toBe(true);
    const remove = vi.spyOn(el, "remove");
    vi.advanceTimersByTime(100); // pending hide(): already done
    expect(remove).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("script error also clears the replay flag; works without #root", () => {
    mount(false);
    m.keepSplash(makeSplash());
    m.playSplash();
    const script = document.querySelector("script[src='/splash.js']") as HTMLScriptElement;
    script.onerror?.(new Event("error"));
    expect((window as unknown as { __splashReplay?: boolean }).__splashReplay).toBeUndefined();
    vi.advanceTimersByTime(4000);
    expect(document.getElementById("splash")?.classList.contains("out")).toBe(true);
  });
});
