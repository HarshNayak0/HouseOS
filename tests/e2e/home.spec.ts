import { expect, test } from "@playwright/test";

test("no horizontal scroll at this viewport", async ({ page }) => {
  await page.goto("/settings");
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

test("unknown rooms are a 404", async ({ request }) => {
  expect((await request.get("/garage")).status()).toBe(404);
  expect((await request.get("/kitchen/extra")).status()).toBe(404);
});
