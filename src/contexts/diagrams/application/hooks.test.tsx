import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../infrastructure/diagramRepository", () => ({
  diagramRepository: {
    createProject: vi.fn(),
    setKind: vi.fn(),
    importSdd: vi.fn(),
    clapDiagram: vi.fn(),
    bookmarkDiagram: vi.fn(),
    projects: vi.fn(),
    tree: vi.fn(),
    publicDiagrams: vi.fn(),
    userDiagrams: vi.fn(),
    published: vi.fn(),
  },
  versionsRepository: {},
}));

import { diagramRepository as repo } from "../infrastructure/diagramRepository";
import { projectsQuery, publicDiagramsQuery, publishedQuery, useCreateDiagram, useDiagramBookmark, useDiagramClap, useImportSdd } from "./hooks";

const setup = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("query keys", () => {
  it("default and explicit params", () => {
    expect(projectsQuery().queryKey).toEqual(["diagrams", "projects", "", "updated"]);
    expect(projectsQuery({ q: "a", sort: "name" }).queryKey).toEqual(["diagrams", "projects", "a", "name"]);
    expect(publicDiagramsQuery().queryKey).toEqual(["diagrams", "public", "list", "", ""]);
    expect(publicDiagramsQuery({ q: "x", tag: "t" }).queryKey).toEqual(["diagrams", "public", "list", "x", "t"]);
  });
  it("published pagination", () => {
    const next = publishedQuery().getNextPageParam as (l: unknown, a: unknown[], p: number, b: unknown[]) => number | undefined;
    expect(next({ page: 1, pageSize: 0, total: 100 }, [], 1, [])).toBe(2);
    expect(next({ page: 1, pageSize: 10, total: 10 }, [], 1, [])).toBeUndefined();
  });
});

describe("useCreateDiagram", () => {
  it("creates an sdd with the default name and keeps kind", async () => {
    vi.mocked(repo.createProject).mockResolvedValue({ project: { id: "p" }, file: { id: "f", kind: "sdd" } } as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => useCreateDiagram(), { wrapper });
    let r: unknown;
    await act(async () => {
      r = await result.current.mutateAsync({ kind: "sdd" });
    });
    expect(r).toEqual({ projectId: "p", fileId: "f" });
    expect(repo.setKind).not.toHaveBeenCalled();
  });
  it("sets the kind for a db diagram and survives setKind failure", async () => {
    vi.mocked(repo.createProject).mockResolvedValue({ project: { id: "p" }, file: { id: "f", kind: "sdd" } } as never);
    vi.mocked(repo.setKind).mockRejectedValue(new Error("x"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useCreateDiagram(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ kind: "erd", name: "  Mine " });
    });
    expect(vi.mocked(repo.createProject).mock.calls[0]?.[0]).toBe("Mine");
    expect(repo.setKind).toHaveBeenCalledWith("f", "erd");
  });
});

describe("useImportSdd", () => {
  it("routes to the project or the file", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useImportSdd(), { wrapper });
    vi.mocked(repo.importSdd).mockResolvedValueOnce({ kind: "project", project: { id: "p" }, file: null, warnings: [] } as never);
    let a: { to: string } | undefined;
    await act(async () => {
      a = await result.current.mutateAsync(new File([""], "a.sdd"));
    });
    expect(a?.to).toBe("/d/p/$projectId");
    vi.mocked(repo.importSdd).mockResolvedValueOnce({ kind: "file", project: { id: "p" }, file: { id: "f" }, warnings: ["w"] } as never);
    await act(async () => {
      a = await result.current.mutateAsync(new File([""], "a.sdd"));
    });
    expect(a?.to).toBe("/d/f/$fileId");
  });
});

describe("useDiagramClap", () => {
  it("batches taps, patches caches, and refuses past the cap", async () => {
    vi.useFakeTimers();
    vi.mocked(repo.clapDiagram).mockResolvedValue({ claps: 5, my_claps: 2 } as never);
    const { qc, wrapper } = setup();
    qc.setQueryData(["diagrams", "public", "one", "s"], { slug: "s", claps: 1 });
    const { result, rerender } = renderHook(({ m }) => useDiagramClap({ slug: "s", claps: 1 }, m), { wrapper, initialProps: { m: 0 } });
    expect(result.current()).toBe(true);
    expect(result.current()).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(repo.clapDiagram).toHaveBeenCalledWith("s", 2);
    expect((qc.getQueryData(["diagrams", "viewer", "s"]) as { my_claps: number }).my_claps).toBe(2);
    rerender({ m: 50 });
    expect(result.current()).toBe(false);
  });
  it("tolerates a cold public cache", () => {
    vi.useFakeTimers();
    const { wrapper } = setup();
    const { result } = renderHook(() => useDiagramClap({ slug: "z", claps: 0 }, 0), { wrapper });
    expect(result.current()).toBe(true);
  });
});

describe("useDiagramBookmark", () => {
  it("sets and rolls back", async () => {
    vi.mocked(repo.bookmarkDiagram).mockRejectedValue(new Error("x"));
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useDiagramBookmark("s"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(true).catch(() => {});
    });
    expect((qc.getQueryData(["diagrams", "viewer", "s"]) as { bookmarked: boolean }).bookmarked).toBe(false);
  });
});
