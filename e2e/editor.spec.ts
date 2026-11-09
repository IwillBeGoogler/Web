import { devices, expect, type Page, request, test } from "@playwright/test";

/**
 * The story editor against the compose stack: autosave of drafts, the local copy and restore banner, published stories that stay
 * untouched until "Update", the real preview, and image paste. Stories are removed afterwards (titles start with "e2e-editor").
 */
const ADMIN = { login: process.env.E2E_LOGIN ?? "admin", password: process.env.E2E_PASSWORD ?? "admin12345" };
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const uniq = () => `e2e-editor ${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let token = "";
const made = new Set<number>();
const auth = () => ({ Authorization: `Bearer ${token}` });

async function api<T = { data: Record<string, unknown> }>(method: "get" | "post" | "put", path: string, data?: unknown): Promise<T> {
  const ctx = await request.newContext({ baseURL });
  const res = await ctx[method](path, { headers: auth(), ...(data ? { data } : {}) });
  const json = (await res.json().catch(() => ({}))) as T;
  await ctx.dispose();
  if (!res.ok()) throw new Error(`${method} ${path} -> ${res.status()} ${JSON.stringify(json)}`);
  return json;
}
const create = async (status: "draft" | "published", body: string) => {
  const r = await api<{ data: { id: number; slug: string } }>("post", "/api/posts", { title: uniq(), body, status, tags: [], label_ids: [] });
  made.add(r.data.id);
  return r.data;
};
const serverBody = async (id: number) => (await api<{ data: { body: string } }>("get", `/api/posts/${id}`)).data.body;
const idOf = (url: string) => Number(/\/p\/(\d+)\/edit/.exec(url)?.[1]);

test.beforeAll(async () => {
  const ctx = await request.newContext({ baseURL });
  token = (await (await ctx.post("/api/auth/login", { data: { login: ADMIN.login, password: ADMIN.password } })).json()).data.token;
  await ctx.dispose();
});

test.afterAll(async () => {
  const ctx = await request.newContext({ baseURL });
  for (const id of made) await ctx.delete(`/api/posts/${id}`, { headers: auth() });
  await ctx.dispose();
});

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Email or username").fill(ADMIN.login);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByRole("dialog").getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

// Tests titled "rich: ..." run in the visual editor (the default). The older ones below type into the Markdown textarea, so they open in Markdown mode.
test.beforeEach(async ({ page }, info) => {
  const rich = info.title.startsWith("rich:");
  await page.addInitScript(
    ([md]) => {
      localStorage.setItem("iwillbegoogler.consent", "necessary");
      if (md) localStorage.setItem("iwillbegoogler.editor.mode", "md");
    },
    [!rich],
  );
  // stories the page itself creates (autosave, publish) are removed afterwards too
  page.on("response", async (r) => {
    if (r.request().method() === "POST" && new URL(r.url()).pathname === "/api/posts" && r.ok()) {
      const id = (await r.json().catch(() => null))?.data?.id;
      if (typeof id === "number") made.add(id);
    }
  });
  await signIn(page);
});

const bodyBox = (page: Page) => page.getByLabel("Story body (Markdown)");
const chip = (page: Page) => page.locator("header [aria-live=polite]");

test("a new draft autosaves once it has content, keeps the caret, and survives a reload", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/posts" && posts.push(r.url()));
  await page.goto("/new-story");
  await page.waitForTimeout(4000);
  expect(posts, "opening the page creates no empty draft").toHaveLength(0);

  const title = uniq();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await bodyBox(page).click();
  await page.keyboard.type("First line of the draft.");
  await expect.poll(() => page.url(), { timeout: 15_000 }).toMatch(/\/p\/\d+\/edit$/);
  const id = idOf(page.url());
  made.add(id);
  expect(posts).toHaveLength(1);
  // the same editor kept going: focus and caret are where they were, and typing continues in place
  await expect(bodyBox(page)).toBeFocused();
  await page.keyboard.type(" And more.");
  await expect(bodyBox(page)).toHaveValue("First line of the draft. And more.");
  await expect(chip(page)).toContainText(/Saved \d/, { timeout: 15_000 });
  await expect.poll(() => serverBody(id)).toBe("First line of the draft. And more.");

  // Cmd/Ctrl+S saves now, as a draft
  await page.keyboard.type(" Third.");
  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(() => serverBody(id), { timeout: 2500 }).toBe("First line of the draft. And more. Third.");
  expect((await api<{ data: { status: string } }>("get", `/api/posts/${id}`)).data.status).toBe("draft");

  await page.reload();
  await expect(bodyBox(page)).toHaveValue("First line of the draft. And more. Third.");
  await expect(page.getByText("Restore unsaved text?")).toBeHidden();
  expect(posts).toHaveLength(1);
});

test("editing a published story never reaches the public page until Update", async ({ page }) => {
  const s = await create("published", "Original published text.");
  await page.goto(`/p/${s.id}/edit`);
  await expect(bodyBox(page)).toHaveValue("Original published text.");
  await bodyBox(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" EDITED-LOCALLY");
  await page.waitForTimeout(36_000); // past both autosave timers
  await expect(chip(page)).toContainText("Saved on this device");
  await page.keyboard.press("ControlOrMeta+s");
  await page.waitForTimeout(500);
  expect(await serverBody(s.id)).toBe("Original published text.");
  await page.goto(`/p/${s.slug}`, { waitUntil: "domcontentloaded" }).catch(() => {});

  // back in the editor the unsaved edit is offered, not applied
  await page.goto(`/p/${s.id}/edit`);
  await expect(page.getByText("Restore unsaved text?")).toBeVisible();
  await expect(bodyBox(page)).toHaveValue("Original published text.");
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(bodyBox(page)).toHaveValue("Original published text. EDITED-LOCALLY");
  expect(await serverBody(s.id)).toBe("Original published text.");

  await page.getByRole("button", { name: "Update live story" }).click();
  await page.getByRole("button", { name: "Ship now" }).click();
  await expect.poll(() => serverBody(s.id)).toBe("Original published text. EDITED-LOCALLY");
  await expect(page.getByText("EDITED-LOCALLY")).toBeVisible();
});

test("restore banner: restore applies, discard drops, nothing happens silently", async ({ page }) => {
  const d = await create("draft", "Server draft text.");
  const copy = (body: string) =>
    JSON.stringify({
      v: 1,
      at: Date.now() + 60_000,
      form: { title: "T", subtitle: "", body, status: "draft", publishAt: "", publicationId: 0, coverUrl: "", tags: [] },
    });
  await page.goto("/");
  await page.evaluate(([k, v]) => localStorage.setItem(k as string, v as string), [`iwillbegoogler.story.${d.id}`, copy("Newer text from this device.")]);
  await page.goto(`/p/${d.id}/edit`);
  await expect(page.getByText("Restore unsaved text?")).toBeVisible();
  await expect(bodyBox(page)).toHaveValue("Server draft text."); // not overwritten
  await page.waitForTimeout(4000);
  expect(await serverBody(d.id), "no autosave while the choice is open").toBe("Server draft text.");
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByText("Restore unsaved text?")).toBeHidden();
  expect(await page.evaluate((k) => localStorage.getItem(k), `iwillbegoogler.story.${d.id}`)).toBeNull();

  await page.goto("/"); // leaving a clean editor clears its copy; this one is written after
  await page.evaluate(([k, v]) => localStorage.setItem(k as string, v as string), [`iwillbegoogler.story.${d.id}`, copy("Restored words.")]);
  await page.goto(`/p/${d.id}/edit`);
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(bodyBox(page)).toHaveValue("Restored words.");
  await expect.poll(() => serverBody(d.id), { timeout: 15_000 }).toBe("Restored words."); // a draft, so it then autosaves
});

test("text typed while an autosave is in flight is not lost", async ({ page }) => {
  const d = await create("draft", "start");
  const puts: string[] = [];
  let hold: (() => void) | null = null;
  await page.route(new RegExp(`/api/posts/${d.id}$`), async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    puts.push(JSON.parse(route.request().postData() ?? "{}").body);
    if (puts.length === 1) await new Promise<void>((r) => (hold = r)); // keep the first save open
    return route.fallback();
  });
  await page.goto(`/p/${d.id}/edit`);
  await bodyBox(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" one");
  await expect.poll(() => puts.length, { timeout: 10_000 }).toBe(1);
  await page.keyboard.type(" two three");
  await page.waitForTimeout(4000);
  expect(puts, "no overlapping save").toHaveLength(1);
  expect(hold).not.toBeNull();
  (hold as unknown as () => void)();
  await expect(bodyBox(page)).toHaveValue("start one two three");
  await expect(bodyBox(page)).toBeFocused();
  await expect.poll(() => puts.length, { timeout: 10_000 }).toBe(2);
  expect(puts[1]).toBe("start one two three");
  await expect.poll(() => serverBody(d.id)).toBe("start one two three");
  await expect(chip(page)).toContainText(/Saved \d/);
});

test("pasting an image uploads it and puts the link at the caret; bad files are explained", async ({ page }) => {
  const d = await create("draft", "Before after.");
  await page.goto(`/p/${d.id}/edit`);
  await bodyBox(page).click();
  await page.keyboard.press("ControlOrMeta+Home");
  const paste = (name: string, type: string, size?: number) =>
    page.evaluate(
      ([b64, n, t, sz]) => {
        const bytes = sz ? new Uint8Array(sz as number) : Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], n as string, { type: t as string }));
        document
          .querySelector("textarea[aria-label='Story body (Markdown)']")
          ?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      },
      [PNG, name, type, size ?? 0],
    );
  await paste("pixel.png", "image/png");
  await expect(bodyBox(page)).toHaveValue(/!\[pixel\]\(\/api\/uploads\/[^)]+\)/, { timeout: 15_000 });
  await expect(bodyBox(page)).not.toHaveValue(/Uploading/);
  await expect(bodyBox(page)).toHaveValue(/Before after\./);

  await paste("huge.png", "image/png", 6 * 1024 * 1024);
  await expect(page.getByText("Images must be 5 MB or smaller: huge.png")).toBeVisible();
  await paste("doc.svg", "image/svg+xml");
  await expect(page.getByText(/Only PNG, JPG, WebP or GIF images can be added: doc\.svg/)).toBeVisible();
  await expect(bodyBox(page)).not.toHaveValue(/huge|doc\.svg/);
});

test("preview renders Markdown like the published page, with sandboxed html-live", async ({ page }) => {
  const d = await create(
    "draft",
    "# Real heading\n\nSome **bold** and a [link](https://example.com).\n\n```html-live height=200\n<b id=x>live</b><script>1</script>\n```\n\n<script>window.__pwned = 1</script>\n",
  );
  await page.goto(`/p/${d.id}/edit`);
  await expect(bodyBox(page)).toHaveValue(/Real heading/);
  await page.getByRole("button", { name: "Preview" }).click();
  const pane = page.getByRole("region", { name: "Preview" });
  await expect(pane.getByRole("heading", { name: "Real heading" })).toBeVisible();
  await expect(pane.locator("strong")).toHaveText("bold");
  await expect(pane.getByRole("link", { name: "link" })).toHaveAttribute("href", "https://example.com");
  await expect(pane.locator("pre", { hasText: "## " })).toHaveCount(0);
  const frame = pane.locator('iframe[title="Interactive content"]');
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  await expect(pane.locator("script")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(bodyBox(page)).toBeVisible();
});

// ---------------------------------------------------------------------------------------------------------------------------------
// The visual (rich text) editor. The body is still Markdown on the server; these check what the author sees and what readers get.
// ---------------------------------------------------------------------------------------------------------------------------------
const rich = (page: Page) => page.getByRole("textbox", { name: "Story body", exact: true });
const bar = (page: Page) => page.getByRole("toolbar", { name: "Formatting" }).first();
const tb = (page: Page, name: string) => bar(page).getByRole("button", { name, exact: true });
const pasteInto = (page: Page, payload: { html?: string; file?: { name: string; type: string } }) =>
  page.evaluate(
    ([pl, b64]) => {
      const p = pl as { html?: string; file?: { name: string; type: string } };
      const dt = new DataTransfer();
      if (p.html) dt.setData("text/html", p.html);
      if (p.file) dt.items.add(new File([Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0))], p.file.name, { type: p.file.type }));
      document.querySelector(".ProseMirror")?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    [payload, PNG],
  );

test("rich: toolbar formatting, published, reads correctly on the article", async ({ page }) => {
  await page.goto("/new-story");
  const title = uniq();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await rich(page).click();
  await tb(page, "Heading").click();
  await page.keyboard.type("Second level");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Plain then ");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("bold");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type(" and ");
  await tb(page, "Italic").click();
  await page.keyboard.type("italic");
  await tb(page, "Italic").click();
  await page.keyboard.type(" with a ");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByLabel("Link address").fill("https://example.com/page");
  await page.keyboard.press("Enter");
  await page.keyboard.type("site");
  await page.keyboard.press("Enter");
  await tb(page, "Bulleted list").click();
  await page.keyboard.type("first item");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second item");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await tb(page, "Quote").click();
  await page.keyboard.type("A wise quote");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await tb(page, "Code block").click();
  await page.getByLabel("Code language").selectOption("javascript");
  await rich(page).locator("pre").click();
  await page.keyboard.type("const a = 1;");
  await expect(rich(page).locator("h2")).toHaveText("Second level");
  await expect(rich(page).locator("strong")).toHaveText("bold");
  await expect(rich(page).locator("em")).toHaveText("italic");
  await expect(rich(page).locator("a")).toHaveAttribute("href", "https://example.com/page");

  await page.getByRole("button", { name: "Ship it" }).click();
  await page.getByRole("button", { name: "Ship now" }).click();
  await expect(page.locator(".prose-article h2")).toHaveText("Second level", { timeout: 15_000 });
  const art = page.locator(".prose-article");
  await expect(art.locator("strong")).toHaveText("bold");
  await expect(art.locator("em")).toHaveText("italic");
  await expect(art.locator('a[href="https://example.com/page"]')).toBeVisible();
  await expect(art.locator("ul li")).toHaveText(["first item", "second item"]);
  await expect(art.locator("blockquote")).toContainText("A wise quote");
  await expect(art.locator("pre code.language-javascript")).toContainText("const a = 1;");
});

test("rich: Cmd/Ctrl+Z undoes and Shift redoes", async ({ page }) => {
  await page.goto("/new-story");
  await rich(page).click();
  await page.keyboard.type("keep this");
  await page.waitForTimeout(700); // a pause starts a new undo step
  await page.keyboard.type(" but lose this");
  await expect(rich(page)).toContainText("but lose this");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(rich(page)).toContainText("keep this");
  await expect(rich(page)).not.toContainText("lose this");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(rich(page)).toContainText("but lose this");
  await page.keyboard.press("ControlOrMeta+z");
  await tb(page, "Redo").click();
  await expect(rich(page)).toContainText("but lose this");
});

test("rich: slash menu inserts blocks, is keyboard driven and closes with Esc", async ({ page }) => {
  await page.goto("/new-story");
  await rich(page).click();
  await page.keyboard.type("/");
  const menu = page.getByRole("listbox", { name: "Insert a block" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("option")).toHaveCount(10);
  await page.keyboard.type("quo");
  await expect(menu.getByRole("option")).toHaveText(["Quote"]);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(rich(page)).toContainText("/quo"); // Esc leaves the text alone
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace"); // back to an empty block
  await page.keyboard.type("/");
  await expect(menu).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("option", { name: "Subheading" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await page.keyboard.type("Sub");
  await expect(rich(page).locator("h3")).toHaveText("Sub");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/hr");
  await page.keyboard.press("Enter");
  await expect(rich(page).locator("hr")).toHaveCount(1);
  await page.keyboard.type("/");
  await menu.getByRole("option", { name: "Divider" }).click();
  await expect(rich(page).locator("hr")).toHaveCount(2);
});

test("rich: pasted web HTML keeps only supported nodes (no scripts, handlers or styles)", async ({ page }) => {
  await page.goto("/new-story");
  await rich(page).click();
  await pasteInto(page, {
    html: '<meta charset="utf-8"><h1 style="color:red">Big</h1><p onclick="window.__z=1" style="font-size:40px">ok <b onmouseover="window.__w=1">bold</b> <a href="javascript:window.__a=1">bad</a> <a href="https://example.com/x">good</a></p><script>window.__x=1</script><style>p{display:none}</style><img src="https://example.com/p.png" onerror="window.__y=1"><table><tr><td>cell</td></tr></table><iframe src="https://evil.example"></iframe>',
  });
  await expect(rich(page)).toContainText("ok bold");
  await expect(rich(page).locator("script, style, iframe, table")).toHaveCount(0);
  const html = await rich(page).evaluate((el) => el.innerHTML);
  expect(html).not.toMatch(/onclick|onerror|onmouseover|style=|javascript:|<script|evil\.example/i);
  await expect(rich(page).locator('a[href="https://example.com/x"]')).toHaveText("good");
  expect(await page.evaluate(() => Object.keys(window).filter((k) => /^__[a-z]$/.test(k)))).toEqual([]);
  expect(html).not.toContain("display:none");
  // it can only be written as Markdown the editor itself can read back
  await page.keyboard.press("ControlOrMeta+s");
});

test("rich: a pasted image shows a placeholder, then uploads and renders on the published page", async ({ page }) => {
  await page.goto("/new-story");
  await page.getByLabel("Title", { exact: true }).fill(uniq());
  await rich(page).click();
  await page.keyboard.type("Look at this:");
  const sent: string[] = [];
  page.on(
    "request",
    (r) => ["POST", "PUT"].includes(r.method()) && new URL(r.url()).pathname.startsWith("/api/posts") && sent.push(JSON.parse(r.postData() ?? "{}").body ?? ""),
  );
  let release: (() => void) | null = null;
  await page.route("**/api/uploads", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await new Promise<void>((r) => (release = r));
    return route.fallback();
  });
  await pasteInto(page, { file: { name: "pixel.png", type: "image/png" } });
  await expect(rich(page).locator(".rich-upload")).toBeVisible();
  await page.waitForTimeout(12_000); // long enough for an autosave to have gone out with the placeholder in the document
  expect(
    sent.filter((b) => /upload|Uploading/i.test(b)),
    "the placeholder is never written into the body",
  ).toEqual([]);
  (release as unknown as () => void)();
  await expect(rich(page).locator('img[src*="/api/uploads/"]')).toHaveCount(1, { timeout: 15_000 });
  await expect(rich(page).locator(".rich-upload")).toHaveCount(0);
  await page.getByRole("button", { name: "Ship it" }).click();
  await page.getByRole("button", { name: "Ship now" }).click();
  const img = page.locator(".prose-article img[src*='/api/uploads/']");
  await expect(img).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const html = await page.locator(".prose-article").innerHTML();
  expect(html).not.toContain("Uploading");
});

test("rich: an image that cannot be uploaded is explained and leaves nothing behind", async ({ page }) => {
  await page.goto("/new-story");
  await rich(page).click();
  await page.route("**/api/uploads", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 500, body: "{}" }) : route.fallback()));
  await pasteInto(page, { file: { name: "pixel.png", type: "image/png" } });
  await expect(page.getByText("Couldn't upload: pixel.png")).toBeVisible();
  await expect(rich(page).locator("img:not(.ProseMirror-separator), .rich-upload")).toHaveCount(0);
  await pasteInto(page, { file: { name: "doc.svg", type: "image/svg+xml" } });
  await expect(page.getByText(/Only PNG, JPG, WebP or GIF images can be added: doc\.svg/)).toBeVisible();
});

test("rich: html-live block edits with its source intact, previews in the sandbox, and publishes", async ({ page }) => {
  const code = [
    "<style>",
    "\tbody { margin: 0 }  ",
    "</style>",
    '<b id="x">live</b>',
    "<script>document.getElementById('x').textContent = 'ran'</script>",
    "",
  ].join("\n");
  const d = await create("draft", `Intro.\n\n\`\`\`html-live height=200\n${code}\n\`\`\`\n\nOutro.`);
  await page.goto(`/p/${d.id}/edit`);
  const src = page.getByLabel("HTML source");
  await expect(src).toHaveValue(code);
  const frame = rich(page).locator('iframe[title="Interactive content"]');
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  await expect(page.frameLocator('iframe[title="Interactive content"]').locator("#x")).toHaveText("ran", { timeout: 15_000 });
  await page.getByLabel("Height (px)").fill("320");
  await src.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
  await page.keyboard.type("<!-- tail -->");
  await expect.poll(() => serverBody(d.id), { timeout: 20_000 }).toBe(`Intro.\n\n\`\`\`html-live height=320\n${code}<!-- tail -->\n\`\`\`\n\nOutro.`);
  await page.getByRole("button", { name: "Ship it" }).click();
  await page.getByRole("button", { name: "Ship now" }).click();
  const live = page.locator('.prose-article iframe[title="Interactive content"]');
  await expect(live).toHaveAttribute("sandbox", "allow-scripts", { timeout: 15_000 });
  await expect(page.frameLocator('.prose-article iframe[title="Interactive content"]').locator("#x")).toHaveText("ran", { timeout: 15_000 });
});

test("rich: the Animation button inserts a live block", async ({ page }) => {
  await page.goto("/new-story");
  await rich(page).click();
  await page.getByRole("button", { name: "Animation" }).click();
  await expect(page.getByLabel("HTML source")).toHaveValue(/class="dot"/);
  await expect(rich(page).locator('iframe[title="Interactive content"]')).toHaveAttribute("sandbox", "allow-scripts");
});

test("rich: text typed while an autosave is in flight is not lost and the caret stays", async ({ page }) => {
  const d = await create("draft", "start");
  const puts: string[] = [];
  let hold: (() => void) | null = null;
  await page.route(new RegExp(`/api/posts/${d.id}$`), async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    puts.push(JSON.parse(route.request().postData() ?? "{}").body);
    if (puts.length === 1) await new Promise<void>((r) => (hold = r));
    return route.fallback();
  });
  await page.goto(`/p/${d.id}/edit`);
  await rich(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" one");
  await expect.poll(() => puts.length, { timeout: 10_000 }).toBe(1);
  await page.keyboard.type(" two three");
  await page.waitForTimeout(4000);
  expect(puts, "no overlapping save").toHaveLength(1);
  (hold as unknown as () => void)();
  await expect(rich(page)).toHaveText("start one two three");
  await expect(rich(page)).toBeFocused();
  await page.keyboard.type(" four"); // the caret is still at the end
  await expect(rich(page)).toHaveText("start one two three four");
  await expect.poll(() => puts.length, { timeout: 10_000 }).toBeGreaterThan(1);
  await expect.poll(() => serverBody(d.id), { timeout: 20_000 }).toBe("start one two three four");
});

test("rich: Cmd/Ctrl+S saves the text typed a moment ago", async ({ page }) => {
  const d = await create("draft", "first");
  await page.goto(`/p/${d.id}/edit`);
  await rich(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" second");
  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(() => serverBody(d.id), { timeout: 2500 }).toBe("first second");
});

test("rich: opening an old post and leaving saves nothing and asks nothing", async ({ page }) => {
  const original = "Some *emphasis*   here.\n\n\n\n* star bullet\n* second\n\n## Heading ##\n\n__strong__ words\n";
  const d = await create("draft", original);
  const writes: string[] = [];
  page.on(
    "request",
    (r) => ["PUT", "POST", "PATCH"].includes(r.method()) && new URL(r.url()).pathname.startsWith("/api/posts") && writes.push(`${r.method()} ${r.url()}`),
  );
  let dialogs = 0;
  page.on("dialog", (dlg) => {
    dialogs++;
    void dlg.dismiss();
  });
  await page.goto(`/p/${d.id}/edit`);
  await expect(rich(page).locator("h2")).toHaveText("Heading");
  await page.waitForTimeout(7000); // past the autosave delays
  await expect(chip(page)).not.toContainText(/Saving|Couldn't/);
  await page.getByRole("link", { name: "Stories" }).click();
  await expect(page).toHaveURL(/\/me\/stories/);
  expect(dialogs).toBe(0);
  expect(writes).toEqual([]);
  expect(await serverBody(d.id)).toBe(original);
  expect(await page.evaluate((k) => localStorage.getItem(k), `iwillbegoogler.story.${d.id}`)).toBeNull();
});

test("rich: a story with raw HTML opens in Markdown mode and refuses visual mode, untouched", async ({ page }) => {
  const original = 'Text.\n\n<div class="note">raw <b>html</b></div>\n\n* odd bullet\n';
  const d = await create("draft", original);
  await page.goto(`/p/${d.id}/edit`);
  await expect(bodyBox(page)).toHaveValue(original);
  await expect(page.getByRole("status").filter({ hasText: "Opened in Markdown mode: it contains raw HTML" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Visual" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Visual" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Can't switch to visual mode: it contains raw HTML" })).toBeVisible();
  await expect(bodyBox(page)).toBeVisible();
  await expect(rich(page)).toHaveCount(0);
  await page.waitForTimeout(6000);
  expect(await serverBody(d.id)).toBe(original);
  // fixing the text lets visual mode in
  await bodyBox(page).fill("Text.\n\nPlain now.\n");
  await page.getByRole("button", { name: "Visual" }).click();
  await expect(rich(page)).toContainText("Plain now.");
  await expect(page.getByRole("alert").filter({ hasText: "Can't switch" })).toHaveCount(0);
});

test("rich: mode switch keeps the text and is remembered; focus mode hides side chrome and is remembered", async ({ page }) => {
  await page.goto("/new-story");
  await rich(page).click();
  await page.keyboard.type("Hello ");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("world");
  await page.getByRole("button", { name: "Markdown" }).click();
  await expect(bodyBox(page)).toHaveValue("Hello **world**");
  await page.reload();
  await expect(bodyBox(page)).toBeVisible(); // remembered
  await expect(page.getByRole("button", { name: "Markdown" })).toHaveAttribute("aria-pressed", "true");
  await bodyBox(page).fill("Hello **world** again");
  await page.getByRole("button", { name: "Visual" }).click();
  await expect(rich(page)).toHaveText("Hello world again");
  await expect(rich(page).locator("strong")).toHaveText("world");
  await expect(page.getByText("03 Body")).toBeVisible();
  await page.getByRole("button", { name: "Focus mode" }).click();
  await expect(page.getByText("03 Body")).toBeHidden();
  await page.reload();
  await expect(page.getByRole("button", { name: "Focus mode" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Focus mode" }).click();
  await expect(page.getByText("03 Body")).toBeVisible();
});

test("rich: pasting a URL over a selection links it; unsafe addresses are refused", async ({ page }) => {
  await page.goto("/new-story");
  await rich(page).click();
  await page.keyboard.type("select me");
  for (let i = 0; i < "select me".length; i++) await page.keyboard.press("Shift+ArrowLeft");
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "https://example.com/pasted");
    document.querySelector(".ProseMirror")?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(rich(page).locator("a")).toHaveAttribute("href", "https://example.com/pasted");
  await page.keyboard.press("ControlOrMeta+k");
  const addr = page.getByLabel("Link address");
  await addr.fill("javascript:alert(1)");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Only web (http, https) and mail links are allowed." })).toBeVisible();
  await expect(rich(page).locator("a")).toHaveAttribute("href", "https://example.com/pasted");
  await addr.fill("mailto:me@example.com");
  await page.keyboard.press("Enter");
  await expect(rich(page).locator("a")).toHaveAttribute("href", "mailto:me@example.com");
});

test("rich: markdown input rules and the bubble menu work", async ({ page }) => {
  await page.goto("/new-story");
  await rich(page).click();
  await page.keyboard.type("## Title");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- one");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("> said");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("```js ");
  await page.keyboard.type("x = 1");
  await expect(rich(page).locator("h2")).toHaveText("Title");
  await expect(rich(page).locator("ul li")).toHaveText("one");
  await expect(rich(page).locator("blockquote")).toHaveText("said");
  await expect(rich(page).locator("pre code")).toHaveText("x = 1");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("bubble text");
  for (let i = 0; i < "bubble text".length; i++) await page.keyboard.press("Shift+ArrowLeft");
  const bubble = page.getByRole("toolbar", { name: "Formatting" }).last();
  await expect(bubble.getByRole("button", { name: "Bold" })).toBeVisible();
  await bubble.getByRole("button", { name: "Bold" }).click();
  await expect(rich(page).locator("strong")).toHaveText("bubble text");
});

test("rich: usable on a phone: toolbar scrolls sideways, the page does not", async ({ browser, page }) => {
  const session = await page.evaluate(() => localStorage.getItem("iwillbegoogler.session"));
  const ctx = await browser.newContext({ ...devices["Pixel 7"], baseURL });
  await ctx.addInitScript(
    ([sess]) => {
      localStorage.setItem("iwillbegoogler.consent", "necessary");
      if (sess) localStorage.setItem("iwillbegoogler.session", sess);
    },
    [session],
  );
  const m = await ctx.newPage();
  await m.goto("/new-story");
  await m.getByLabel("Title", { exact: true }).fill(uniq());
  await rich(m).click();
  await m.keyboard.type("Typing on a phone-sized screen with a fairly long line of words to check that wrapping happens inside the column.");
  const sizes = await m.evaluate(() => {
    const t = document.querySelector('[role="toolbar"]') as HTMLElement;
    const wide = [...document.querySelectorAll("body *")]
      .filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 6)
      .map((e) => `${e.tagName}.${String(e.className).slice(0, 50)}`);
    return { page: [document.documentElement.scrollWidth, document.documentElement.clientWidth], bar: [t.scrollWidth, t.clientWidth], wide };
  });
  expect(sizes.page[0], `wider than the screen: ${sizes.wide.join(" | ")}`).toBeLessThanOrEqual(sizes.page[1] as number);
  expect(sizes.bar[0]).toBeGreaterThan(sizes.bar[1] as number); // it scrolls inside itself
  await tb(m, "Bold").scrollIntoViewIfNeeded();
  await tb(m, "Undo").scrollIntoViewIfNeeded();
  await tb(m, "Undo").tap(); // the far end of the bar can be reached and used by touch
  await expect(rich(m)).not.toContainText("fairly long line");
  await m.setViewportSize({ width: 360, height: 700 });
  await rich(m).click();
  await m.keyboard.type(" more");
  await expect(rich(m)).toContainText("more");
  expect(await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Pasted and typed content must never block: the edit is written as Markdown, saved, and published as it looks in the editor.
// ---------------------------------------------------------------------------------------------------------------------------------
const wordCount = async (page: Page) => Number(/(\d+) words/i.exec(await page.locator("header").innerText())?.[1] ?? 0);
const NOT_WRITABLE = /can't be written as Markdown/;

async function publishFromEditor(page: Page) {
  await page.getByRole("button", { name: "Ship it" }).click();
  await page.getByRole("button", { name: "Ship now" }).click();
  await expect(page.locator(".prose-article")).toBeVisible({ timeout: 15_000 });
}

const PASTES: { name: string; html: string; md: string; text: string; check?: (art: ReturnType<Page["locator"]>) => Promise<void> }[] = [
  {
    name: "an image after text",
    html: '<p>Alpha</p><img src="https://example.com/a.png">',
    md: "Alpha\n\n![](https://example.com/a.png)",
    text: "Alpha",
    check: async (art) => expect(art.locator('img[src="https://example.com/a.png"]')).toHaveCount(1),
  },
  {
    name: "an image whose address is not on the web (dropped)",
    html: "<p>Alpha</p><img src=x onerror=\"window.__z=1\"><img src='file:///C:/a.png'>",
    md: "Alpha",
    text: "Alpha",
    check: async (art) => expect(art.locator("img")).toHaveCount(0),
  },
  {
    name: "literal Markdown characters",
    html: "<p>2 * 3 * 4 _x_ [a] #b</p>",
    md: "2 * 3 * 4 \\_x\\_ \\[a\\] #b",
    text: "2 * 3 * 4 _x_ [a] #b",
    check: async (art) => expect(art.locator("em, strong, a")).toHaveCount(0),
  },
  {
    name: "bold with a trailing space",
    html: "<p><b>qalin </b>so'z</p>",
    md: "**qalin** so'z",
    text: "qalin so'z",
    check: async (art) => expect(art.locator("strong")).toHaveText("qalin"),
  },
  {
    name: "a line that looks like a list, a quote and code",
    html: "<p>1. not a list</p><p>&gt; not a quote</p><p>use `ticks` and \\backslashes\\ &amp; &lt;b&gt;tags&lt;/b&gt;</p>",
    md: "1\\. not a list\n\n\\> not a quote\n\nuse \\`ticks\\` and \\\\backslashes\\\\ & \\<b>tags\\</b>",
    text: "1. not a list",
    check: async (art) => {
      await expect(art).toContainText("> not a quote");
      await expect(art).toContainText("use `ticks` and \\backslashes\\ & <b>tags</b>");
      await expect(art.locator("ol, blockquote, b, code")).toHaveCount(0);
    },
  },
];

for (const c of PASTES)
  test(`rich: pasting ${c.name} is written, saved and published`, async ({ page }) => {
    await page.goto("/new-story");
    await page.getByLabel("Title", { exact: true }).fill(uniq());
    await rich(page).click();
    await pasteInto(page, { html: c.html });
    await expect(page.getByText(NOT_WRITABLE)).toHaveCount(0);
    await expect.poll(() => wordCount(page)).toBeGreaterThan(0);
    await expect(chip(page)).toContainText(/Saved \d/, { timeout: 15_000 });
    await expect(page.getByText(NOT_WRITABLE)).toHaveCount(0);
    const id = idOf(page.url());
    made.add(id);
    expect(await serverBody(id)).toBe(c.md);
    await publishFromEditor(page);
    const art = page.locator(".prose-article");
    await expect(art).toContainText(c.text);
    const text = await art.innerText();
    if (c.name.includes("literal")) expect(text).toContain("2 * 3 * 4 _x_ [a] #b");
    else if (!c.name.includes("line that looks")) expect(text).not.toMatch(/\*\*|\\(?![\\`])/);
    expect(await page.evaluate(() => (window as unknown as { __z?: number }).__z)).toBeUndefined();
    await c.check?.(art);
  });

test("rich: literal Markdown characters that are typed stay literal when published", async ({ page }) => {
  await page.goto("/new-story");
  await page.getByLabel("Title", { exact: true }).fill(uniq());
  await rich(page).click();
  await page.keyboard.type("Price 2 * 3 * 4 and snake_case_name [a] #b <i>not html</i> a\\b & c");
  await expect(page.getByText(NOT_WRITABLE)).toHaveCount(0);
  await expect(chip(page)).toContainText(/Saved \d/, { timeout: 15_000 });
  await expect(page.getByText(NOT_WRITABLE)).toHaveCount(0);
  await publishFromEditor(page);
  const art = page.locator(".prose-article");
  await expect(art).toContainText("Price 2 * 3 * 4 and snake_case_name [a] #b <i>not html</i> a\\b & c");
  await expect(art.locator("i")).toHaveCount(0);
});

test("rich: an edit that cannot be written exactly is kept, held back from the server, and moves to Markdown mode on request", async ({ page }) => {
  await page.goto("/new-story");
  await page.getByLabel("Title", { exact: true }).fill(uniq());
  await rich(page).click();
  await pasteInto(page, { html: "<p>Kept words</p>" });
  await expect(chip(page)).toContainText(/Saved \d/, { timeout: 15_000 });
  const id = idOf(page.url());
  made.add(id);
  expect(await serverBody(id)).toBe("Kept words");
  // three levels of lists with a quote at the bottom: no Markdown parser reads that back the same way
  await page.keyboard.press("Enter");
  await pasteInto(page, {
    html: "<ol><li>one<ul><li>two<ol><li>three<blockquote><p>quoted words</p></blockquote></li></ol></li></ul></li></ol>",
  });
  const notice = page.getByTestId("lossy-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("can't be written as Markdown exactly");
  await expect.poll(() => wordCount(page)).toBeGreaterThan(3);
  await page.waitForTimeout(5000);
  expect(await serverBody(id), "nothing of the unexact edit reaches the server on its own").toBe("Kept words");
  expect(await page.evaluate((k) => localStorage.getItem(k), `iwillbegoogler.story.${id}`)).toContain("quoted words");
  await page.getByRole("button", { name: "Ship it" }).click();
  await page.getByRole("button", { name: "Ship now" }).click();
  await expect(page.getByText("Open Markdown mode first")).toBeVisible();
  expect(await serverBody(id)).toBe("Kept words");

  await notice.getByRole("button", { name: "Open in Markdown mode" }).click();
  await expect(bodyBox(page)).toHaveValue(/quoted words/);
  await expect(notice).toBeHidden();
  await expect.poll(() => serverBody(id), { timeout: 15_000 }).toContain("quoted words");
});

test("the editor chrome and placeholders follow the language", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("iwillbegoogler.lang", "uz");
  });
  await page.goto("/new-story");
  await expect(page.getByRole("link", { name: "Hikoyalar" })).toBeVisible();
  await expect(page.getByPlaceholder("Nomsiz qoralama")).toBeVisible();
  await expect(page.getByPlaceholder("Bir qatorli qisqacha mazmun (ixtiyoriy)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ko‘rib chiqish" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Qoralamani saqlash" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Chop etish" })).toBeVisible();
  await page.evaluate(() => localStorage.setItem("iwillbegoogler.lang", "ru"));
  await page.reload();
  await expect(page.getByPlaceholder("Черновик без названия")).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить черновик" })).toBeVisible();
});

test("rich: on a phone the restore banner stays clear of the header and Save and Ship are in reach", async ({ browser, page }) => {
  const session = await page.evaluate(() => localStorage.getItem("iwillbegoogler.session"));
  const d = await create("draft", "Server draft text.");
  const ctx = await browser.newContext({ ...devices["Pixel 7"], baseURL });
  await ctx.addInitScript(
    ([sess, key, copy]) => {
      localStorage.setItem("iwillbegoogler.consent", "necessary");
      if (sess) localStorage.setItem("iwillbegoogler.session", sess);
      localStorage.setItem(key as string, copy as string);
    },
    [
      session,
      `iwillbegoogler.story.${d.id}`,
      JSON.stringify({
        v: 1,
        at: Date.now() + 60_000,
        form: {
          title: "T",
          subtitle: "",
          body: "Newer text from this device. ".repeat(30),
          status: "draft",
          publishAt: "",
          publicationId: 0,
          coverUrl: "",
          tags: [],
        },
      }),
    ],
  );
  const m = await ctx.newPage();
  await m.goto(`/p/${d.id}/edit`);
  const banner = m.getByRole("region", { name: "Restore unsaved text?" });
  await expect(banner).toBeVisible();
  const header = m.locator("header").first();
  // Save and Ship are on screen without scrolling the header sideways
  const vw = await m.evaluate(() => document.documentElement.clientWidth);
  for (const name of ["Save draft", "Ship it"]) {
    const box = await m.getByRole("button", { name, exact: true }).boundingBox();
    expect(box, name).not.toBeNull();
    expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= vw, `${name} inside the screen`).toBe(true);
  }
  // scroll and focus the editor: wherever the page ends up, the banner is drawn below the sticky header, never behind it
  await m.evaluate(() => window.scrollTo(0, 120));
  await rich(m).click();
  const hb = await header.boundingBox();
  const bb = await banner.boundingBox();
  expect(bb && hb && bb.y >= hb.y + hb.height - 1, `banner ${JSON.stringify(bb)} below header ${JSON.stringify(hb)}`).toBe(true);
  const top = await m.evaluate(
    ([x, y]) =>
      document
        .elementFromPoint(x as number, y as number)
        ?.closest("section")
        ?.getAttribute("aria-label"),
    [(bb?.x ?? 0) + 20, (bb?.y ?? 0) + 8],
  );
  expect(top).toBe("Restore unsaved text?");
  await ctx.close();
});

test("an unverified account is told why it cannot save, is not retried on every keystroke, and keeps its text", async ({ browser }) => {
  const password = "Zq7-lantern-ember-42";
  const name = `e2eunv${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const api = await request.newContext({ baseURL });
  const reg = await api.post("/api/auth/register", { data: { username: name, email: `${name}@e2e.test`, password } });
  expect(reg.status(), await reg.text()).toBe(201);
  const userToken = (await reg.json()).data.token as string;
  const ctx = await browser.newContext({ baseURL });
  await ctx.addInitScript(() => localStorage.setItem("iwillbegoogler.consent", "necessary"));
  const page = await ctx.newPage();
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByLabel("Email or username").fill(`${name}@e2e.test`);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("dialog").getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    const posts: string[] = [];
    page.on("request", (r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/posts" && posts.push(r.url()));
    await page.goto("/new-story");
    const notice = page.getByTestId("save-notice");
    // said up front, before anything fails
    await expect(notice).toContainText("Confirm your email to save and publish. Your text is kept on this device.");
    await page.getByLabel("Title", { exact: true }).fill("e2e unverified draft");
    await rich(page).click();
    await page.keyboard.type("Words that cannot be saved yet.");
    await expect(chip(page)).toContainText("Couldn't save", { timeout: 15_000 });
    await expect(notice).toContainText("Confirm your email to save and publish. Your text is kept on this device.");
    expect(posts).toHaveLength(1);
    // writing on does not hammer the server
    for (const w of [" more", " and more", " and still more"]) {
      await page.keyboard.type(w);
      await page.waitForTimeout(4000);
    }
    expect(posts, "one refused attempt, no retries while typing").toHaveLength(1);
    expect(await page.evaluate(() => localStorage.getItem("iwillbegoogler.story.new"))).toContain("and still more");

    const resend = page.waitForRequest((r) => new URL(r.url()).pathname === "/api/me/verify-email" && r.method() === "POST");
    await notice.getByRole("button", { name: "Resend verification email" }).click();
    await resend;

    // the text is still offered after a reload
    await page.reload();
    await expect(page.getByText("Restore unsaved text?")).toBeVisible();
  } finally {
    await api.delete("/api/me", { headers: { Authorization: `Bearer ${userToken}` }, data: { password } });
    await api.dispose();
    await ctx.close();
  }
});
