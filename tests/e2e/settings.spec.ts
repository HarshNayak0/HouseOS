import { expect, test } from "@playwright/test";

test("evening mode and view choices are remembered on this device", async ({ page }) => {
  await page.goto("/settings");
  const evening = page.getByRole("group", { name: "Evening mode" });
  await expect(evening.getByRole("radio", { name: /Automatic, at Toronto sunset/ })).toBeChecked();
  await expect(evening.getByText(/sunset today \d{1,2}:\d{2}/)).toBeVisible();
  await evening.getByRole("radio", { name: /Always evening/ }).check();
  await page.getByRole("group", { name: "Camera animations" }).getByRole("radio", { name: /Always fly/ }).check();
  await page.reload();
  await expect(page.getByRole("group", { name: "Evening mode" }).getByRole("radio", { name: /Always evening/ })).toBeChecked();
  await expect(page.getByRole("group", { name: "Camera animations" }).getByRole("radio", { name: /Always fly/ })).toBeChecked();
});

test("every room has a working link on the floor plan", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("veedu.view", "2d");
    } catch {}
  });
  await page.goto("/");
  for (const [name, path] of [
    ["Living room", "living"],
    ["Kitchen", "kitchen"],
    ["Bedroom", "bedroom"],
    ["Office", "office"],
    ["Wash area", "wash"],
    ["Coat closet", "closet"],
    ["Backyard", "backyard"],
  ]) {
    await page.getByRole("link", { name: new RegExp(`^${name}:`) }).click();
    await expect(page).toHaveURL(new RegExp(`/${path}$`));
    await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
    await page.getByRole("button", { name: "Close panel" }).click();
    await expect(page).toHaveURL(/\/$/);
  }
});
