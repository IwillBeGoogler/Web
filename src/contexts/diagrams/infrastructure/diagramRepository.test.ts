import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { api, server } from "@/test/server";
import { diagramRepository as repo, SddInvalidError, versionsRepository } from "./diagramRepository";

const project = { id: "p1", name: "P", role: "owner", createdAt: 1, updatedAt: 2 };
const file = { id: "f1", projectId: "p1", folderId: null, name: "F", kind: "sdd", createdAt: 1, updatedAt: 2 };
const folder = { id: "d1", projectId: "p1", parentId: null, name: "D" };
const share = { id: "s1", role: "viewer" };
const pub = { fileId: "f1", visibility: "public", slug: "abcdef" };
const pubDiagram = { file_id: "f1", slug: "abcdef", title: "T", published_at: "x", updated_at: "x", author: { id: 1, username: "a" } };
const ver = { version: 2, createdAt: 1 };
const ok = () => new HttpResponse(null, { status: 204 });
const json = (v: unknown) => () => HttpResponse.json(v as never);

describe("diagramRepository", () => {
  it("projects and files", async () => {
    let body: unknown;
    server.use(
      http.get(api("/diagrams/projects"), json({ items: [project], total: 1, page: 1, pageSize: 100 })),
      http.get(api("/diagrams/projects/p%201"), json({ project })),
      http.get(api("/diagrams/projects/p1/tree"), json({ project, folders: [folder], files: [file] })),
      http.post(api("/diagrams/projects"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ project, file });
      }),
      http.patch(api("/diagrams/projects/p1"), ok),
      http.delete(api("/diagrams/projects/p1"), ok),
      http.post(api("/diagrams/projects/p1/files"), json({ file })),
      http.patch(api("/diagrams/files/f1"), ok),
      http.delete(api("/diagrams/files/f1"), ok),
      http.post(api("/diagrams/files/f1/duplicate"), ok),
    );
    expect((await repo.projects({ q: "x" })).items).toHaveLength(1);
    expect((await repo.projects()).total).toBe(1);
    expect((await repo.project("p 1")).id).toBe("p1");
    expect((await repo.tree("p1")).files).toHaveLength(1);
    await repo.createProject("N");
    expect(body).toEqual({ name: "N", file: { name: "N" } });
    await repo.createProject("N", "F", { a: 1 });
    expect(body).toEqual({ name: "N", file: { name: "F", data: { a: 1 } } });
    await repo.renameProject("p1", "x");
    await repo.deleteProject("p1");
    expect((await repo.createFile("p1", { name: "F" })).id).toBe("f1");
    await repo.setKind("f1", "erd");
    await repo.renameFile("f1", "n");
    await repo.moveFile("f1", null);
    await repo.deleteFile("f1");
    await repo.duplicateFile("f1");
  });

  it("folders, members and shares", async () => {
    server.use(
      http.post(api("/diagrams/projects/p1/folders"), json({ folder })),
      http.patch(api("/diagrams/folders/d1"), ok),
      http.delete(api("/diagrams/folders/d1"), ok),
      http.get(api("/diagrams/projects/p1/members"), json({ items: [{ userId: "u" }] })),
      http.post(api("/diagrams/projects/p1/members"), ok),
      http.patch(api("/diagrams/projects/p1/members/u"), ok),
      http.delete(api("/diagrams/projects/p1/members/u"), ok),
      http.get(api("/diagrams/projects/p1/shares"), json({ items: [share] })),
      http.post(api("/diagrams/projects/p1/shares"), json({ share, token: "tk" })),
      http.delete(api("/diagrams/projects/p1/shares/s1"), ok),
    );
    expect((await repo.createFolder("p1", "D")).id).toBe("d1");
    await repo.renameFolder("d1", "x");
    await repo.deleteFolder("d1");
    expect((await repo.members("p1"))[0]?.userId).toBe("u");
    await repo.addMember("p1", "a@b.c", "editor");
    await repo.setMemberRole("p1", "u", "viewer");
    await repo.removeMember("p1", "u");
    expect(await repo.shares("p1")).toHaveLength(1);
    expect((await repo.createShare("p1", { role: "viewer" })).token).toBe("tk");
    await repo.revokeShare("p1", "s1");
  });

  it("publishing and public reads", async () => {
    const methods: string[] = [];
    server.use(
      http.get(api("/diagrams/files/f1/publish"), json(pub)),
      http.post(api("/diagrams/files/f1/publish"), json(pub)),
      http.delete(api("/diagrams/files/f1/publish"), ok),
      http.get(api("/diagrams/public/abcdef"), json({ data: pubDiagram })),
      http.get(api("/diagrams/public/abcdef/me"), json({ data: {} })),
      http.post(api("/diagrams/public/abcdef/clap"), json({ data: { claps: 3, my_claps: 1 } })),
      http.all(api("/diagrams/public/abcdef/bookmark"), ({ request }) => {
        methods.push(request.method);
        return ok();
      }),
      http.get(api("/me/diagram-bookmarks"), json({ data: [pubDiagram], meta: {} })),
      http.get(api("/diagrams/public"), json({ data: [pubDiagram], meta: {} })),
      http.get(api("/diagrams/published"), json({ items: null })),
      http.get(api("/users/a%20b/diagrams"), json({ data: [pubDiagram], meta: {} })),
    );
    expect((await repo.publication("f1")).slug).toBe("abcdef");
    expect((await repo.publish("f1", { visibility: "public", title: "T", description: "", tags: [] })).slug).toBe("abcdef");
    await repo.unpublish("f1");
    expect((await repo.publicDiagram("abcdef")).title).toBe("T");
    expect((await repo.diagramViewer("abcdef")).my_claps).toBe(0);
    expect((await repo.clapDiagram("abcdef", 1)).claps).toBe(3);
    await repo.bookmarkDiagram("abcdef", true);
    await repo.bookmarkDiagram("abcdef", false);
    expect(methods).toEqual(["POST", "DELETE"]);
    expect((await repo.bookmarkedDiagrams()).items).toHaveLength(1);
    expect((await repo.bookmarkedDiagrams({ page: 2, limit: 5 })).items).toHaveLength(1);
    expect((await repo.publicDiagrams()).items).toHaveLength(1);
    expect((await repo.publicDiagrams({ q: "a", tag: "b" }, { page: 1 })).items).toHaveLength(1);
    expect((await repo.published(1, 10)).items).toEqual([]);
    expect((await repo.userDiagrams("a b")).items).toHaveLength(1);
    expect((await repo.userDiagrams("a b", { page: 1, limit: 2 })).items).toHaveLength(1);
  });

  it("templates, fork, export", async () => {
    server.use(
      http.get(api("/diagrams/templates"), json({ data: null })),
      http.post(api("/diagrams/templates/t1/fork"), json({ project, file })),
      http.get(api("/diagrams/files/f1/export"), () => new HttpResponse("x")),
      http.get(api("/diagrams/projects/p1/export"), () => new HttpResponse("y")),
    );
    expect(await repo.templates()).toEqual([]);
    expect((await repo.forkTemplate("t1")).file.id).toBe("f1");
    expect(await (await repo.exportFile("f1")).text()).toBe("x");
    expect(await (await repo.exportProject("p1")).text()).toBe("y");
  });

  describe("importSdd", () => {
    const f = new File(["x"], "a.sdd");
    it("returns warnings default", async () => {
      server.use(http.post(api("/diagrams/import"), json({ kind: "sdd", project })));
      expect((await repo.importSdd(f)).warnings).toEqual([]);
    });
    it("maps SDD_INVALID with reason, message, and fallback", async () => {
      const err = (error: unknown) => http.post(api("/diagrams/import"), () => HttpResponse.json({ status: 422, error }, { status: 422 }));
      server.use(err({ code: "SDD_INVALID", message: "m", details: { reason: "r" } }));
      await expect(repo.importSdd(f)).rejects.toThrow(SddInvalidError);
      await expect(repo.importSdd(f)).rejects.toThrow("r");
      server.use(err({ code: "SDD_INVALID", message: "m" }));
      await expect(repo.importSdd(f)).rejects.toThrow("m");
      server.use(err({ code: "SDD_INVALID" }));
      await expect(repo.importSdd(f)).rejects.toThrow("Invalid .sdd file");
    });
    it("rethrows other 422 and other errors", async () => {
      server.use(http.post(api("/diagrams/import"), () => HttpResponse.json({ status: 422, error: { code: "OTHER" } }, { status: 422 })));
      await expect(repo.importSdd(f)).rejects.not.toBeInstanceOf(SddInvalidError);
      server.use(http.post(api("/diagrams/import"), () => HttpResponse.json({ status: 500 }, { status: 500 })));
      await expect(repo.importSdd(f)).rejects.toBeDefined();
    });
  });
});

describe("versionsRepository", () => {
  it("list/get/saveNamed/restore/role", async () => {
    server.use(
      http.get(api("/diagrams/files/f1/versions"), json({ items: null })),
      http.get(api("/diagrams/files/f1/versions/2"), json({ version: ver })),
      http.post(api("/diagrams/files/f1/versions"), json({ version: ver })),
      http.post(api("/diagrams/files/f1/versions/2/restore"), ok),
      http.get(api("/diagrams/files/f1"), json({ file: { role: "bogus" } })),
    );
    expect(await versionsRepository.list("f1")).toEqual([]);
    expect((await versionsRepository.get("f1", 2)).version).toBe(2);
    expect((await versionsRepository.saveNamed("f1", "n")).version).toBe(2);
    await versionsRepository.restore("f1", 2);
    expect(await versionsRepository.role("f1")).toBe("viewer");
  });
});
