import { expect, type Page, request, test } from "@playwright/test";

/**
 * Code in several languages (```lang group=name fences), against the compose stack: the server groups the fences, the reader
 * gets language tabs, and the pick is shared by every group on the page and kept across a reload. Stories are made through the
 * API as the seeded admin and removed afterwards (titles start with "e2e-code").
 */
const ADMIN = { login: process.env.E2E_LOGIN ?? "admin", password: process.env.E2E_PASSWORD ?? "admin12345" };
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const title = `e2e-code ${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;

const BODY = [
  "Sorting two ways.",
  "",
  "```go group=sort",
  "sort.Ints(xs) // GOSORT",
  "```",
  "",
  "```python group=sort",
  "xs.sort()  # PYSORT",
  "```",
  "",
  "Then reversing.",
  "",
  "```go group=rev",
  "slices.Reverse(xs) // GOREV",
  "```",
  "",
  "```python group=rev",
  "xs.reverse()  # PYREV",
  "```",
  "",
  "A lone block:",
  "",
  "```rust",
  "let x = 1; // RUSTONLY",
  "```",
].join("\n");

let token = "";
let id = 0;
let slug = "";

test.beforeAll(async () => {
  const api = await request.newContext({ baseURL });
  const login = await api.post("/api/auth/login", { data: { login: ADMIN.login, password: ADMIN.password } });
  token = (await login.json()).data.token;
  const res = await api.post("/api/posts", {
    headers: { Authorization: `Bearer ${token}` },
    data: { title, body: BODY, status: "published", tags: [], label_ids: [] },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const post = (await res.json()).data;
  id = post.id;
  slug = post.slug;
  await api.dispose();
});

test.afterAll(async () => {
  const api = await request.newContext({ baseURL });
  if (id) await api.delete(`/api/posts/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  await api.dispose();
});

const open = async (page: Page) => {
  await page.addInitScript(() => localStorage.setItem("iwillbegoogler.consent", "necessary"));
  await page.goto(`/p/${slug}`);
  await expect(page.getByRole("tablist", { name: "Code language" }).first()).toBeVisible();
};

test("code groups show language tabs, one pick opens that language everywhere and survives a reload", async ({ page }) => {
  await open(page);
  const lists = page.getByRole("tablist", { name: "Code language" });
  await expect(lists).toHaveCount(2);
  const body = page.locator(".prose-article");
  await expect(body).toContainText("GOSORT");
  await expect(body).not.toContainText("PYSORT");

  await lists.nth(1).getByRole("tab", { name: "Python" }).click();
  await expect(body).toContainText("PYSORT");
  await expect(body).toContainText("PYREV");
  await expect(body).not.toContainText("GOSORT");
  await expect(page.getByRole("tab", { name: "Python", selected: true })).toHaveCount(2);

  await page.reload();
  await expect(page.locator(".prose-article")).toContainText("PYSORT");
});

test("tabs move with the arrow keys; the lone block has a label and copy, no tabs", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("iwillbegoogler.codelang"));
  await open(page);
  const first = page.getByRole("tab", { name: "Go", selected: true }).first();
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Python", selected: true }).first()).toBeFocused();
  const lone = page.locator(".code-view", { hasText: "RUSTONLY" });
  await expect(lone.getByRole("tab")).toHaveCount(0);
  await expect(lone.getByText("Rust", { exact: true })).toBeVisible();
  await expect(lone.getByRole("button", { name: "Copy" })).toBeVisible();
});

test("code is highlighted without changing its text", async ({ page }) => {
  await open(page);
  const code = page.locator(".code-view pre code").first();
  await expect(code.locator(".tok-keyword, .tok-comment").first()).toBeVisible();
  await expect(code).toContainText("sort.Ints(xs)");
});
