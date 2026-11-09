import { expect, type Frame, type Page, request, test } from "@playwright/test";

/**
 * Live HTML blocks in stories (```html-live), against the compose stack: the author's script runs, but only inside an opaque-origin
 * sandboxed frame. Stories are made through the API as the seeded admin and removed afterwards (titles start with "e2e-live").
 */
const ADMIN = { login: process.env.E2E_LOGIN ?? "admin", password: process.env.E2E_PASSWORD ?? "admin12345" };
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const uniq = () => `e2e-live ${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;

// Probes everything a hostile block would try, and writes the outcome into its own DOM.
const PROBE = `<style>
  @keyframes slide { from { transform: translateX(0); } to { transform: translateX(120px); } }
  #box { width: 20px; height: 20px; background: tomato; animation: slide 1s linear infinite alternate; }
</style>
<div id="box"></div>
<pre id="out">starting</pre>
<script>
  var out = { ticks: 0 };
  var probe = function (k, f) { try { out[k] = "value:" + String(f()); } catch (e) { out[k] = "threw:" + e.name; } };
  var show = function () { document.getElementById("out").textContent = JSON.stringify(out); };
  probe("origin", function () { return window.origin; });
  probe("localStorage", function () { return localStorage.getItem("iwillbegoogler.session"); });
  probe("cookie", function () { return document.cookie; });
  probe("parentDocument", function () { return parent.document.title; });
  probe("parentStorage", function () { return parent.localStorage.getItem("iwillbegoogler.session"); });
  probe("topNavigate", function () { top.location.href = "/api/healthz"; return "assigned"; });
  probe("popup", function () { return window.open("/") === null ? "blocked" : "opened"; });
  var net = function (k, p) { p.then(function () { out[k] = "resolved"; show(); }, function (e) { out[k] = "failed:" + e.name; show(); }); };
  net("fetchApi", fetch("/api/posts?limit=1"));
  net("fetchAbsolute", fetch(location.origin + "/api/posts?limit=1"));
  net("fetchExternal", fetch("https://example.com/"));
  setInterval(function () { out.ticks++; show(); }, 50);
  show();
</script>`;

const story = (title: string, body: string) => ({ title, body, status: "published", tags: [], label_ids: [] });

const MARK = `LIVEMARK${Date.now().toString(36)}`;
let token = "";
let probe: { slug: string };
let plain: { slug: string };
const made: number[] = [];

async function create(title: string, body: string) {
  const api = await request.newContext({ baseURL });
  const res = await api.post("/api/posts", { headers: { Authorization: `Bearer ${token}` }, data: story(title, body) });
  const json = await res.json().catch(() => ({}));
  await api.dispose();
  if (res.ok()) made.push(json.data.id);
  return { res, json };
}

test.beforeAll(async () => {
  const api = await request.newContext({ baseURL });
  const login = await api.post("/api/auth/login", { data: { login: ADMIN.login, password: ADMIN.password } });
  token = (await login.json()).data.token;
  await api.dispose();
  // creating is limited to 10 a minute, so the stories the tests read are made once
  probe = (await create(uniq(), `Before the block.\n\n\`\`\`html-live height=240\n${PROBE}\n\`\`\`\n\nAfter the block.`)).json.data;
  plain = (await create(uniq(), `Intro text.\n\n\`\`\`html-live\n<script>/*${MARK}*/</script>\n\`\`\``)).json.data;
});

test.afterAll(async () => {
  const api = await request.newContext({ baseURL });
  for (const id of made) await api.delete(`/api/posts/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  await api.dispose();
});

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Email or username").fill(ADMIN.login);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByRole("dialog").getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

const consent = (page: Page) => page.addInitScript(() => localStorage.setItem("iwillbegoogler.consent", "necessary"));
const frameOf = (page: Page): Frame => {
  const f = page.frames().find((x) => x.url().endsWith("/html-frame.html"));
  if (!f) throw new Error("no live frame");
  return f;
};
const result = async (page: Page) => {
  await expect(page.frameLocator('iframe[title="Interactive content"]').locator("#out")).toContainText('"fetchExternal"');
  return JSON.parse((await frameOf(page).locator("#out").textContent()) ?? "{}") as Record<string, string>;
};

test("a live block animates in a sandbox that cannot reach the site", async ({ page }) => {
  await consent(page);
  await signIn(page); // the page now holds the bearer token in its localStorage
  expect(await page.evaluate(() => localStorage.getItem("iwillbegoogler.session"))).toContain("token");
  await page.goto(`/p/${probe.slug}`);
  const url = page.url();

  const frame = page.locator('iframe[title="Interactive content"]');
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  await expect(frame).toHaveAttribute("height", "240");
  // the source never reaches the page's own DOM
  await expect(page.locator("article script")).toHaveCount(0);
  await expect(page.getByText("Before the block.")).toBeVisible();
  await expect(page.getByText("After the block.")).toBeVisible();

  const r = await result(page);
  const f = frameOf(page);

  // the CSS animation and the JS timer both run
  const x = () => f.evaluate(() => new DOMMatrix(getComputedStyle(document.getElementById("box") as Element).transform).m41);
  const [a, ticks] = [await x(), r.ticks];
  await page.waitForTimeout(300);
  expect(await x()).not.toBe(a);
  expect(Number((await result(page)).ticks)).toBeGreaterThan(Number(ticks));

  // opaque origin: no storage, no cookies, no way into the parent
  expect(r.origin).toBe("value:null");
  expect(r.localStorage).toMatch(/^threw:/);
  expect(r.cookie).toMatch(/^(value:|threw:)/);
  expect(r.cookie).not.toContain("iwillbegoogler");
  expect(r.parentDocument).toMatch(/^threw:/);
  expect(r.parentStorage).toMatch(/^threw:/);
  expect(JSON.stringify(r)).not.toContain(probe.slug);
  // no network from scripts, even to the site's own API
  expect(r.fetchApi).toMatch(/^failed:/);
  expect(r.fetchAbsolute).toMatch(/^failed:/);
  expect(r.fetchExternal).toMatch(/^failed:/);
  // no navigation of the page, no pop-ups
  expect(r.topNavigate).toMatch(/^threw:/);
  expect(r.popup).toMatch(/^(value:blocked|threw:)/);
  expect(page.url()).toBe(url);
});

test("the frame page carries its own sandbox CSP; the site's allows framing it", async ({ page, request: api }) => {
  const frame = await api.get("/html-frame.html");
  expect(frame.status()).toBe(200);
  const csp = frame.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("sandbox allow-scripts");
  expect(csp).toContain("default-src 'none'");
  expect(csp).not.toContain("connect-src");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(frame.headers()["x-content-type-options"]).toBe("nosniff");

  const site = await api.get("/");
  const siteCsp = site.headers()["content-security-policy"] ?? "";
  expect(siteCsp).toContain("frame-src 'self' https://challenges.cloudflare.com");
  expect(siteCsp).toMatch(/script-src 'self' https:\/\/challenges\.cloudflare\.com;/);

  // opened directly it is still sandboxed: opaque origin, no storage
  await page.goto("/html-frame.html");
  expect(await page.evaluate(() => window.origin)).toBe("null");
  expect(
    await page.evaluate(() => {
      try {
        return typeof localStorage === "object" ? "reachable" : "none";
      } catch (e) {
        return (e as Error).name;
      }
    }),
  ).toBe("SecurityError");
});

test("the API refuses bad blocks with a clear error", async () => {
  const over = await create(uniq(), `\`\`\`html-live\n${"a".repeat(64 * 1024 + 1)}\n\`\`\``);
  expect(over.res.status()).toBe(400);
  expect(JSON.stringify(over.json)).toContain("html-live");
  const many = await create(uniq(), "```html-live\nx\n```\n\n".repeat(11));
  expect(many.res.status()).toBe(400);
  const inject = await create(uniq(), "```html-live height=1 onload=alert(1)\nx\n```");
  expect(inject.res.status()).toBe(400);
  expect(JSON.stringify(inject.json)).toContain("height=N");
});

test("the read-only outputs show a link, not the code", async ({ request: api }) => {
  // a crawler gets the pre-rendered page: no code, a link instead
  const bot = await api.get(`/p/${plain.slug}`, { headers: { "User-Agent": "Googlebot" } });
  const html = await bot.text();
  expect(html).not.toContain(MARK);
  expect(html).toContain("Interactive content: open on site");
  // the API serves the block as escaped text only
  const post = await (await api.get(`/api/slug/${plain.slug}`)).json();
  expect(post.data.body_html).toContain('class="language-html-live-400"');
  expect(post.data.body_html).not.toContain("<script");
});

test("reduced motion: the block waits for a click", async ({ page }) => {
  await consent(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/p/${plain.slug}`);
  await expect(page.locator('iframe[title="Interactive content"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Run interactive content" }).click();
  await expect(page.locator('iframe[title="Interactive content"]')).toHaveCount(1);
});

test("the editor preview runs the block without saving", async ({ page }) => {
  await consent(page);
  await page.addInitScript(() => localStorage.setItem("iwillbegoogler.editor.mode", "md")); // this one types Markdown
  await signIn(page);
  await page.goto("/new-story");
  await page.getByLabel("Story body (Markdown)").fill("```html-live height=200\n<p id=p>live preview</p>\n```");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.frameLocator('iframe[title="Interactive content"]').locator("#p")).toHaveText("live preview");
});

test("the editor button inserts a starter animation", async ({ page }) => {
  await consent(page);
  await signIn(page);
  await page.goto("/new-story");
  await page.getByRole("button", { name: "Animation" }).click();
  // the visual editor (default) shows the block as a source box; Markdown mode would hold the fence itself
  await expect(page.getByLabel("HTML source")).toHaveValue(/@keyframes/);
  await expect(page.getByLabel("Height (px)")).toHaveValue("240");
});
