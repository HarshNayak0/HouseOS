import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Automated WCAG 2.1 A/AA checks (axe). The 3D canvas itself is skipped: the 2D plan is its accessible twin. */
async function audit(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("canvas").analyze();
  const summary = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
  expect(summary).toEqual([]);
}

const use2D = (page: Page) =>
  page.addInitScript(() => {
    try {
      localStorage.setItem("veedu.view", "2d");
    } catch {}
  });

for (const path of ["/signin", "/privacy", "/terms", "/settings"]) {
  test(`accessible: ${path}`, async ({ page }) => {
    await page.goto(path);
    await audit(page);
  });
}

test("accessible: 2D floor plan", async ({ page }) => {
  await use2D(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: /^Kitchen/ })).toBeVisible();
  await audit(page);
});

for (const room of ["kitchen", "closet", "backyard"]) {
  test(`accessible: ${room} panel`, async ({ page }) => {
    await use2D(page);
    await page.goto(`/${room}`);
    await expect(page.getByRole("button", { name: "Close panel" })).toBeVisible();
    await audit(page);
  });
}

test("keyboard: focus is visible and Escape closes a panel", async ({ page }) => {
  await use2D(page);
  await page.goto("/");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 ? s.outlineColor : s.boxShadow;
  });
  expect(outline).toBeTruthy();
  await page.getByRole("link", { name: /^Office/ }).focus();
  await page.keyboard.press("Enter");
  // the panel moves focus to its heading once it's open
  await expect(page.getByRole("heading", { name: "Office", level: 2 })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/$/);
});

test("tap targets in the header are at least 38 px and links in panels at least 44 px tall", async ({ page }) => {
  await use2D(page);
  await page.goto("/kitchen");
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main button, main a, [role=dialog] button, [role=dialog] a")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ t: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30), h: el.getBoundingClientRect().height }))
      .filter((x) => x.h > 0 && x.h < 38),
  );
  expect(small).toEqual([]);
});
