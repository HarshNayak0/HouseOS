import { expect, test, type Page } from "@playwright/test";

const use2D = (page: Page) =>
  page.addInitScript(() => {
    try {
      localStorage.setItem("veedu.view", "2d");
    } catch {}
  });

test.describe("2D floor plan", () => {
  test.beforeEach(async ({ page }) => use2D(page));

  test("tapping a room opens its panel and updates the URL", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /^Kitchen/ }).click();
    await expect(page).toHaveURL(/\/kitchen$/);
    await expect(page.getByRole("heading", { name: "Kitchen", level: 2 })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/$/);
  });

  test("the back button closes the panel", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /^Wash area/ }).click();
    await expect(page.getByRole("heading", { name: "Wash area", level: 2 })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Wash area", level: 2 })).toBeHidden();
  });

  test("deep link opens that room", async ({ page }) => {
    await page.goto("/office");
    await expect(page.getByRole("heading", { name: "Office", level: 2 })).toBeVisible();
    await page.getByRole("button", { name: "Close panel" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("rooms are reachable by keyboard", async ({ page }) => {
    await page.goto("/");
    const bedroom = page.getByRole("link", { name: /^Bedroom/ });
    await bedroom.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/bedroom$/);
  });

  test("shows Malayalam labels", async ({ page }) => {
    await page.goto("/backyard");
    await expect(page.getByRole("heading", { name: "Backyard", level: 2 })).toBeVisible();
    await expect(page.locator('[lang="ml"]', { hasText: "തൊടി" }).first()).toBeVisible();
  });
});

test.describe("3D house", () => {
  test("loads, steps inside and opens a room", async ({ page }) => {
    test.slow();
    await page.addInitScript(() => {
      try {
        localStorage.setItem("veedu.view", "3d");
      } catch {}
    });
    await page.goto("/");
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveCount(0, { timeout: 60_000 });
    await page.getByRole("button", { name: "Step inside" }).click();
    await expect(page.getByRole("button", { name: "View outside" })).toBeVisible();
    // Keyboard users get a rooms list in 3D mode
    await page.getByRole("navigation", { name: "Rooms", exact: true }).getByRole("link", { name: "Wash area" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/wash$/);
    await expect(page.getByRole("heading", { name: "Wash area", level: 2 })).toBeVisible();
  });
});

test("settings page lets you choose 3D or 2D", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel(/2D floor plan/).check();
  expect(await page.evaluate(() => localStorage.getItem("veedu.view"))).toBe("2d");
  await page.getByRole("link", { name: /Back to the house/ }).click();
  await expect(page.getByRole("navigation", { name: /floor plan/ })).toBeVisible();
});

test("camera animations can override the system reduce-motion setting", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings");
  await expect(page.getByText(/Reduce motion is on here/)).toBeVisible();
  await page.getByLabel(/Always fly the camera/).check();
  expect(await page.evaluate(() => localStorage.getItem("veedu.motion"))).toBe("always");
});
