import { expect, test } from "@playwright/test";

// These run without Supabase configured (as in CI): pages must degrade gracefully.
test("sign-in page renders", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Welcome home" })).toBeVisible();
});

test("a bad invite link explains itself", async ({ page }) => {
  await page.goto("/invite/" + "0".repeat(48));
  await expect(page.getByRole("heading", { name: /expired/ })).toBeVisible();
});

test("PWA manifest and icons are served", async ({ request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m.display).toBe("standalone");
  expect((await request.get("/icons/icon-192.png")).status()).toBe(200);
  expect((await request.get("/sw.js")).status()).toBe(200);
});

test("export needs sign-in", async ({ request }) => {
  expect([401, 503]).toContain((await request.get("/api/export")).status());
});
