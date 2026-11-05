import { type APIRequestContext, type Browser, expect, type Page, request, test } from "@playwright/test";

/**
 * Integrated diagram flows against the compose stack (Go API + EMQX behind the web container).
 * Setup goes through the API where that is faster; the flow under test goes through the UI.
 */
const PASSWORD = "Zq7-lantern-ember-42"; // the API rejects common passwords
let n = 0;
const uniq = () => `e2e${Date.now().toString(36)}${n++}${Math.floor(Math.random() * 1e3)}`;

type Account = { username: string; email: string; password: string; token: string };

async function apiBase(baseURL: string, token?: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL, extraHTTPHeaders: token ? { Authorization: `Bearer ${token}` } : {} });
}

async function registerViaApi(baseURL: string): Promise<Account> {
  const u = uniq();
  const anon = await apiBase(baseURL);
  const r = await anon.post("/api/auth/register", { data: { username: u, email: `${u}@e2e.test`, password: PASSWORD } });
  expect(r.status(), await r.text()).toBe(201);
  const token = (await r.json()).data.token as string;
  await anon.dispose();
  return { username: u, email: `${u}@e2e.test`, password: PASSWORD, token };
}

/** A project with its first file; returns ids. */
async function createFile(api: APIRequestContext, name: string) {
  const r = await api.post("/api/diagrams/projects", { data: { name, file: { name } } });
  expect(r.status(), await r.text()).toBe(201);
  const j = await r.json();
  return { projectId: j.project.id as string, fileId: j.file.id as string };
}

const consent = (page: Page) => page.addInitScript(() => localStorage.setItem("iblog.consent", "necessary"));

async function signInUi(page: Page, a: Pick<Account, "email" | "password">) {
  await consent(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email or username").fill(a.email);
  await dialog.getByLabel("Password", { exact: true }).fill(a.password);
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expect(dialog).toBeHidden();
}

async function newContext(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return { ctx, page: await ctx.newPage() };
}

const canvas = (p: Page) => p.locator(".react-flow");
const nodes = (p: Page) => p.locator(".react-flow__node");

/** Adds a node through the editor's command palette (Ctrl/Cmd+K), then commits its label editor. */
async function addNode(page: Page, component: string) {
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Command" }).fill(component);
  await page.locator(`#cmdk-add-${component.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`).click();
  const label = page.getByRole("textbox", { name: "Node label" });
  if (await label.isVisible().catch(() => false)) await label.press("Enter");
}

test("sign up, Write menu -> DB diagram creates project + file and opens the editor", async ({ page, baseURL }) => {
  const u = uniq();
  await consent(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Create one" }).click();
  await dialog.getByLabel("Username").fill(u);
  await dialog.getByLabel("Email").fill(`${u}@e2e.test`);
  await dialog.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await dialog.getByRole("button", { name: "Sign up" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "More ways to write" }).click();
  await page.getByRole("menuitem", { name: "DB diagram" }).click();
  await expect(page).toHaveURL(/\/d\/f\/fil_[0-9a-f]+/);
  await expect(canvas(page)).toBeVisible();
  // the starter document: one table (users)
  await expect(page.locator(".react-flow__node").filter({ hasText: "users" })).toBeVisible();

  // project + file exist on the server (the dashboard lists the new project)
  await page.goto("/d");
  await expect(page.getByRole("link", { name: /^DB diagram/ }).first()).toBeVisible();
  void baseURL;
});

test("co-edit: an edit in one browser context shows up in the other (MQTT)", async ({ browser, baseURL }) => {
  const acct = await registerViaApi(baseURL!);
  const api = await apiBase(baseURL!, acct.token);
  const { fileId } = await createFile(api, "coedit");

  const a = await newContext(browser);
  const b = await newContext(browser);
  try {
    for (const c of [a, b]) {
      await signInUi(c.page, acct);
      await c.page.goto(`/d/f/${fileId}`);
      await expect(canvas(c.page)).toBeVisible();
    }
    const before = await nodes(b.page).count();
    await addNode(a.page, "Database");
    await expect(nodes(a.page)).toHaveCount(before + 1);
    await expect(nodes(b.page)).toHaveCount(before + 1, { timeout: 30_000 });
  } finally {
    await a.ctx.close();
    await b.ctx.close();
    await api.dispose();
  }
});

test("share link opens at /d/s/{token} without a session and is read-only", async ({ browser, baseURL }) => {
  const acct = await registerViaApi(baseURL!);
  const api = await apiBase(baseURL!, acct.token);
  const { projectId, fileId } = await createFile(api, "shared");
  // give it a node so there is something to look at
  const got = await (await api.get(`/api/diagrams/files/${fileId}`)).json();
  const doc = got.file.data;
  doc.pages[0].nodes = [{ id: "n1", type: "component", position: { x: 80, y: 80 }, data: { label: "SharedBox", kind: "database" } }];
  const put = await api.put(`/api/diagrams/files/${fileId}`, { data: { data: doc }, headers: { "If-Match": `"${got.file.version}"` } });
  expect(put.ok(), await put.text()).toBeTruthy();
  const share = await api.post(`/api/diagrams/projects/${projectId}/shares`, { data: { role: "viewer" } });
  expect(share.status()).toBe(201);
  const { token } = await share.json();

  const anon = await newContext(browser); // no session at all
  try {
    await anon.page.goto(`/d/s/${token}`);
    await expect(anon.page).toHaveURL(new RegExp(`/d/s/${token}$`));
    await expect(canvas(anon.page)).toBeVisible();
    await expect(nodes(anon.page).first()).toBeVisible();
    // read-only: the command palette cannot add a node, and the server refuses a viewer write
    const count = await nodes(anon.page).count();
    await anon.page.keyboard.press("ControlOrMeta+k");
    const cmd = anon.page.getByRole("combobox", { name: "Command" });
    if (await cmd.isVisible().catch(() => false)) {
      await cmd.fill("Database");
      await expect(anon.page.locator("#cmdk-add-database")).toHaveCount(0);
    }
    await anon.page.keyboard.press("Escape");
    await expect(nodes(anon.page)).toHaveCount(count);
    const anonApi = await apiBase(baseURL!);
    const w = await anonApi.put(`/api/diagrams/share/${token}`, { data: { name: "x" }, headers: { "If-Match": `"1"` } });
    expect(w.status()).toBe(403);
    await anonApi.dispose();
  } finally {
    await anon.ctx.close();
    await api.dispose();
  }
});

test("publish from the editor, then /d/v/{slug} opens logged out", async ({ browser, baseURL }) => {
  const acct = await registerViaApi(baseURL!);
  const api = await apiBase(baseURL!, acct.token);
  const { fileId } = await createFile(api, "published");

  const owner = await newContext(browser);
  const anon = await newContext(browser);
  try {
    await signInUi(owner.page, acct);
    await owner.page.goto(`/d/f/${fileId}`);
    await expect(canvas(owner.page)).toBeVisible();
    await owner.page.getByRole("button", { name: "Publish", exact: true }).click();
    const dlg = owner.page.getByRole("dialog");
    await dlg.getByLabel("Title").fill("E2E published diagram");
    await dlg.getByRole("button", { name: "Publish", exact: true }).click();
    const link = dlg.getByRole("textbox", { name: /link/i });
    await expect(link).toBeVisible();
    const url = new URL(await link.inputValue());
    expect(url.pathname).toMatch(/^\/d\/v\/[^/]+$/);

    await consent(anon.page);
    await anon.page.goto(url.pathname);
    await expect(anon.page).toHaveURL(new RegExp(`${url.pathname}$`));
    await expect(canvas(anon.page)).toBeVisible();
    await expect(anon.page.getByText("E2E published diagram").first()).toBeVisible();
  } finally {
    await owner.ctx.close();
    await anon.ctx.close();
    await api.dispose();
  }
});

test("Import .sdd on /d uploads an exported file and opens it", async ({ page, baseURL }, testInfo) => {
  const a = await registerViaApi(baseURL!);
  const api = await apiBase(baseURL!, a.token);
  const { fileId } = await createFile(api, "Exported");
  const exp = await api.get(`/api/diagrams/files/${fileId}/export`);
  expect(exp.status(), await exp.text()).toBe(200);
  const path = testInfo.outputPath("exported.sdd");
  await (await import("node:fs/promises")).writeFile(path, await exp.body());
  await api.dispose();

  await signInUi(page, a);
  await page.goto("/d");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import .sdd" }).click();
  await (await chooser).setFiles(path);
  await expect(page).toHaveURL(/\/d\/f\/[^/]+$/);
  expect(page.url()).not.toContain(fileId);
  await expect(canvas(page)).toBeVisible();
});

test("sign-up with a common password is a 400 WEAK_PASSWORD, not a 500", async ({ baseURL }) => {
  const u = uniq();
  const anon = await apiBase(baseURL!);
  const r = await anon.post("/api/auth/register", { data: { username: u, email: `${u}@e2e.test`, password: "password123" } });
  expect(r.status(), await r.text()).toBe(400);
  expect((await r.json()).code).toBe("WEAK_PASSWORD");
  await anon.dispose();
});
