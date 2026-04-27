// Render the social card HTML to a PNG at exact 1400x1280 dimensions.
// Usage: node writeups/render-card.mjs

import puppeteer from "puppeteer";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(__dirname, "social-card-solhunt-duel.html");
const outPath = resolve(__dirname, "social-card-solhunt-duel.png");

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1280, deviceScaleFactor: 2 });
  await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle0" });
  // Give the webfonts a moment to settle.
  await page.evaluate(() => document.fonts.ready);

  const card = await page.$(".card");
  if (!card) throw new Error(".card element not found");
  await card.screenshot({ path: outPath, type: "png", omitBackground: false });

  console.log(`✅ saved: ${outPath}`);
} finally {
  await browser.close();
}
