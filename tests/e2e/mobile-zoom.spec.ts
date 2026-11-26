import { expect, test } from "@playwright/test";

/**
 * iPhone Safari zooms into any text field under 16 px when tapped (and stays zoomed), cropping the
 * page. On touch screens every field must be at least 16 px; double-tap zoom is off, pinch still works.
 */
test("form fields are 16 px on touch screens, so phones don't zoom in", async ({ page, isMobile }) => {
  await page.goto("/settings");
  const sizes = await page.evaluate(() => {
    const box = document.createElement("div");
    box.innerHTML = `
      <input class="text-[15px]" aria-label="a">
      <input type="date" class="text-sm" aria-label="b">
      <select class="text-sm" aria-label="c"><option>x</option></select>
      <textarea class="text-sm" aria-label="d"></textarea>
      <input class="text-2xl" aria-label="pin">`;
    document.body.appendChild(box);
    const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
    const [a, b, c, d, pin] = [...box.children];
    return { fields: [px(a), px(b), px(c), px(d)], pin: px(pin), touchAction: getComputedStyle(document.documentElement).touchAction };
  });
  if (isMobile) {
    for (const s of sizes.fields) expect(s).toBeGreaterThanOrEqual(16);
  } else {
    expect(sizes.fields[0]).toBe(15); // desktop keeps the design's sizes
  }
  expect(sizes.pin).toBe(24);
  expect(sizes.touchAction).toBe("manipulation");
});
