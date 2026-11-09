import { expect, type Page, test } from "@playwright/test";

const ADMIN = { login: process.env.E2E_LOGIN ?? "admin", password: process.env.E2E_PASSWORD ?? "admin12345" };

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Email or username").fill(ADMIN.login);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByRole("dialog").getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

// The cookie banner is answered up front; its own test below starts without consent.
test.beforeEach(async ({ page }, info) => {
  if (!info.title.startsWith("cookie banner")) await page.addInitScript(() => localStorage.setItem("iwillbegoogler.consent", "necessary"));
});

test("cookie banner: choice sticks, legal pages and language switch work", async ({ page }) => {
  await page.goto("/");
  const banner = page.getByRole("region", { name: "Cookies" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Necessary only" }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(banner).toBeHidden();
  await page.getByRole("link", { name: "Privacy Policy" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
  await page.getByRole("combobox", { name: "Language" }).selectOption("uz");
  await expect(page.getByRole("heading", { level: 1, name: "Maxfiylik siyosati" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "uz");
});

test("visitors land on the landing page and start reading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Ideas worth shipping" })).toBeVisible();
  await expect(page.getByRole("link", { name: "IWillBeGoogler home" })).toBeVisible();
  await expect(page).toHaveTitle(/IWillBeGoogler/);
  await page.getByRole("link", { name: "Open the stream" }).first().click();
  await expect(page.getByRole("radio", { name: "Newest" })).toBeVisible();
});

test("anonymous reader sees the latest feed and opens a story", async ({ page }) => {
  await page.goto("/?tab=latest");
  const first = page.locator("article h2").first();
  await expect(first).toBeVisible();
  const title = await first.textContent();
  await first.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title ?? "");
  await expect(page.getByRole("toolbar", { name: "Post actions" }).first()).toBeVisible();
});

test("clap asks anonymous readers to sign in", async ({ page }) => {
  await page.goto("/?tab=latest");
  await page.locator("article h2").first().click();
  await page
    .getByRole("button", { name: /^Spark/ })
    .first()
    .click();
  await expect(page.getByText("Sign in to IWillBeGoogler")).toBeVisible();
});

test("writer publishes a story and finds it in search", async ({ page, isMobile }) => {
  test.skip(isMobile, "editor flow covered on desktop");
  await page.addInitScript(() => localStorage.setItem("iwillbegoogler.editor.mode", "md")); // types Markdown; the visual editor is covered in editor.spec.ts
  await signIn(page);
  const title = `E2E story ${Date.now()}`;
  await page.goto("/new-story");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Story body (Markdown)").fill("## Heading\n\nHello from **Playwright**.");
  await page.getByRole("button", { name: "Ship it", exact: true }).click();
  await page.getByLabel("Add a topic").fill("e2e");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Ship now" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(page.locator(".prose-article strong")).toHaveText("Playwright");
  await page.goto("/search?q=E2E");
  await expect(page.getByRole("heading", { name: title }).first()).toBeVisible();
});

test("search and topic pages work", async ({ page }) => {
  await page.goto("/tag/go");
  await expect(page.getByRole("heading", { level: 1, name: "go" })).toBeVisible();
  await page.goto("/search?q=zzzz-nothing");
  await expect(page.getByText("No stories found.")).toBeVisible();
});

test("signed-in reader: settings, lists, stats, publications and responses", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop flow");
  await signIn(page);
  await page.goto("/me/settings?tab=security");
  await expect(page.getByText("This device")).toBeVisible();
  await expect(page.getByRole("button", { name: "Set up two-factor authentication" })).toBeVisible();
  await page.goto("/me/settings?tab=privacy");
  await expect(page.getByRole("heading", { name: "Topics in your feed" })).toBeVisible();

  const name = `E2E list ${Date.now()}`;
  await page.goto("/me/library");
  await page.getByRole("radio", { name: "Lists" }).click();
  await page.getByRole("button", { name: "New list" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/me\/library/);

  await page.goto("/me/stats");
  await expect(page.getByRole("heading", { level: 1, name: "Stats" })).toBeVisible();
  await expect(page.getByText("Views").first()).toBeVisible();

  await page.goto("/me/publications");
  await expect(page.getByRole("button", { name: "New publication" })).toBeVisible();

  await page.goto("/?tab=latest");
  await page.locator("article h2").first().click();
  await page
    .getByRole("button", { name: /^Discussion/ })
    .first()
    .click();
  const text = `E2E response ${Date.now()}`;
  await page.getByLabel("Write a note").fill(text);
  await page.getByRole("button", { name: "Post note" }).click();
  await expect(page.getByText(text)).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete response" }).last().click();
  await expect(page.getByText(text)).toBeHidden();
});

test("password reset and verify links render", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByRole("button", { name: /Send reset link/ }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();
  await page.goto("/verify-email?code=bogus");
  await expect(page.getByText("This link doesn't work")).toBeVisible();
});

test("reading settings: palette, bionic and focus persist across reloads", async ({ page }) => {
  await page.goto("/?tab=latest");
  await page.locator("article h2").first().click();
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByLabel("Theme", { exact: true }).selectOption("sepia");
  await page.getByRole("switch", { name: "Bionic reading" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "sepia");
  await expect(page.locator(".prose-article b.bionic").first()).toBeVisible();
  await page.getByRole("switch", { name: "Focus mode" }).click();
  await expect(page.locator("header[data-chrome]")).toBeHidden();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "sepia");
  await expect(page.locator("header[data-chrome]")).toBeHidden();
  await page.evaluate(() => localStorage.removeItem("iwillbegoogler.reading"));
});
