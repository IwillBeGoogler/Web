import { expect, type Page, request, test } from "@playwright/test";

/**
 * Feedback, failure toasts and automatic error reports against the compose stack, through to the admin panel.
 * Admin checks need ADMIN_PASSWORD (Backend/.env) and E2E_ADMIN_URL (default http://localhost:3100).
 */
const PASSWORD = "Zq7-lantern-ember-42";
const ADMIN_URL = process.env.E2E_ADMIN_URL ?? "http://localhost:3100";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const uniq = (s: string) => `${s}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;

const consent = (page: Page) => page.addInitScript(() => localStorage.setItem("iblog.consent", "necessary"));

async function signUp(page: Page) {
  const u = uniq("e2e").replaceAll("-", "");
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
}

async function adminLogin(page: Page) {
  await page.goto(`${ADMIN_URL}/`);
  await page.locator("input:not([type=password])").first().fill("admin");
  await page.locator("input[type=password]").fill(ADMIN_PASSWORD);
  await page.locator("button[type=submit]").click();
  await expect(page.locator("input[type=password]")).toBeHidden();
}

test("anonymous feedback from the top bar reaches the admin panel", async ({ page }) => {
  test.skip(!ADMIN_PASSWORD, "ADMIN_PASSWORD not set");
  const text = uniq("anon feedback");
  await consent(page);
  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "Send feedback" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Message").fill(text);
  const sent = page.waitForResponse((r) => r.url().endsWith("/api/feedback") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  expect((await sent).status()).toBe(201);
  await expect(page.getByText("Thanks, we got it.")).toBeVisible();

  await adminLogin(page);
  await page.goto(`${ADMIN_URL}/feedback`);
  await expect(page.getByText(text)).toBeVisible();
});

test("a 500 explains itself and Report opens the dialog with the failed call attached", async ({ page }) => {
  await signUp(page);
  await page.route("**/api/diagrams/projects", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 500, contentType: "application/problem+json", body: JSON.stringify({ detail: "secret", request_id: "abcdef123456" }) })
      : route.continue(),
  );
  await page.getByRole("button", { name: "More ways to write" }).click();
  await page.getByRole("menuitem", { name: "DB diagram" }).click();
  const toast = page.locator("[data-sonner-toast]");
  await expect(toast).toContainText("abcdef12");
  await expect(toast).not.toContainText("secret");
  await toast.getByRole("button", { name: "Report" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Message").fill(uniq("report from toast"));
  const sent = page.waitForResponse((r) => r.url().endsWith("/api/feedback") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  const res = await sent;
  expect(res.status()).toBe(201);
  expect(res.request().postDataJSON().error_message).toContain("HTTP 500 POST");
});

test("an uncaught error is reported once, scrubbed, and shows up in the admin panel", async ({ page, baseURL }) => {
  test.skip(!ADMIN_PASSWORD, "ADMIN_PASSWORD not set");
  const marker = uniq("e2e uncaught");
  await consent(page);
  await page.goto("/");
  const posts: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/client-errors")) posts.push(r.postDataJSON());
  });
  const reported = page.waitForResponse((r) => r.url().endsWith("/api/client-errors"));
  const boom = `${marker} leak@example.com`;
  await page.evaluate((m) => {
    for (const d of [0, 20])
      setTimeout(() => {
        throw new Error(m);
      }, d);
  }, boom);
  expect((await reported).status()).toBe(204);
  await page.waitForTimeout(500);
  expect(posts).toHaveLength(1);
  expect(Object.keys(posts[0] ?? {}).sort()).toEqual(["message", "page_url", "stack", "user_agent"]);
  expect(JSON.stringify(posts[0])).not.toContain("leak@example.com");

  const api = await request.newContext({ baseURL });
  const login = await api.post("/api/auth/login", { data: { login: "admin", password: ADMIN_PASSWORD } });
  const token = (await login.json()).data.token as string;
  const list = await api.get("/api/admin/client-errors?limit=50", { headers: { Authorization: `Bearer ${token}` } });
  expect(list.status()).toBe(200);
  expect(await list.text()).toContain(marker);
  await api.dispose();

  await adminLogin(page);
  await page.goto(`${ADMIN_URL}/client-errors`);
  await expect(page.getByText(marker).first()).toBeVisible();
});
