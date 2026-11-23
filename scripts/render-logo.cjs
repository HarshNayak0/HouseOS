/**
 * Renders the 3D house logo and writes the app icons.
 * Usage: NEXT_PUBLIC_DEV_PAGES=1 npm run build && npm start -- -p 3100   (in another terminal)
 *        node scripts/render-logo.cjs [baseUrl] [chromiumPath]
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const base = process.argv[2] || "http://localhost:3100";
const executablePath = process.argv[3] || undefined;
const root = path.join(__dirname, "..");

async function grab(page, size, bg) {
  await page.goto(`${base}/dev/logo?size=${size}${bg ? `&bg=${encodeURIComponent(bg)}` : ""}`);
  await page.waitForFunction(() => window.__logo, null, { timeout: 120000 });
  const url = await page.evaluate(() => window.__logo);
  return Buffer.from(url.split(",")[1], "base64");
}

(async () => {
  const browser = await chromium.launch({
    executablePath,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage();
  fs.mkdirSync(path.join(root, "docs/brand"), { recursive: true });
  // transparent master + one on the lime-plaster background
  fs.writeFileSync(path.join(root, "docs/brand/veedu-logo-transparent-1024.png"), await grab(page, 1024, null));
  const solid = await grab(page, 1024, "#F6F1E7");
  fs.writeFileSync(path.join(root, "docs/brand/veedu-logo-1024.png"), solid);

  // App icons: compose the render on a warm background with a kasavu band, at each size.
  const b64 = solid.toString("base64");
  const compose = async (size, out, { band = true, pad = 0.06 } = {}) => {
    await page.setViewportSize({ width: size, height: size });
    const inset = Math.round(size * pad);
    await page.setContent(`<html><body style="margin:0">
      <div style="width:${size}px;height:${size}px;position:relative;overflow:hidden;background:radial-gradient(circle at 50% 45%,#FBF8F2 0%,#F6F1E7 55%,#EADFC9 100%)">
        <img src="data:image/png;base64,${b64}" style="position:absolute;left:${inset}px;top:${inset}px;width:${size - 2 * inset}px;height:${size - 2 * inset}px;mix-blend-mode:multiply">
        ${band ? `<div style="position:absolute;left:0;right:0;top:0;height:${Math.max(3, Math.round(size * 0.045))}px;background:repeating-linear-gradient(90deg,#B8893B 0 ${size / 40}px,#E2C27A ${size / 40}px ${size / 28}px,#B8893B ${size / 28}px ${size / 20}px);border-bottom:${Math.max(1, Math.round(size * 0.008))}px solid #8a6424"></div>` : ""}
      </div></body></html>`);
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(root, out), clip: { x: 0, y: 0, width: size, height: size } });
  };
  await compose(512, "public/icons/icon-512.png");
  await compose(192, "public/icons/icon-192.png");
  // maskable: keep the house inside the central safe zone
  await compose(512, "public/icons/icon-maskable-512.png", { band: false, pad: 0.14 });
  await compose(180, "src/app/apple-icon.png", { band: false, pad: 0.04 });
  await compose(64, "src/app/icon.png", { band: false, pad: 0 });
  await browser.close();
  console.log("logo and icons written");
})();
