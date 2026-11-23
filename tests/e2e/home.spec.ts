import { expect, test } from "@playwright/test";

test("home page shows the Veedu card", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Veedu/ })).toBeVisible();
  await expect(page.getByText("വീട്").first()).toBeVisible();
});

test("no horizontal scroll at this viewport", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(res.headers()["strict-transport-security"]).toContain("max-age=");
});

test("health endpoint responds", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(await res.json()).toEqual({ ok: true, app: "veedu" });
});
