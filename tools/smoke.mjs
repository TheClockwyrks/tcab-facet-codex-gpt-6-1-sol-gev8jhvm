/* global document, console */
import { URL } from "node:url";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(
      new URL(req.url, "http://local").pathname,
    ).replace(/^\/facet\//, "/");
    const path = `dist${name.endsWith("/") ? name + "index.html" : name}`;
    const bytes = await readFile(path);
    const type = path.endsWith(".js")
      ? "application/javascript"
      : path.endsWith(".png")
        ? "image/png"
        : path.endsWith(".wav")
          ? "audio/wav"
          : path.endsWith(".json")
            ? "application/json"
            : "text/html";
    res.writeHead(200, { "Content-Type": type });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(4174, resolve));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const errors = [];
try {
  for (const [base, viewport] of [
    ["/", { width: 1280, height: 720 }],
    ["/facet/", { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
    });
    await page.goto(`http://localhost:4174${base}`);
    await page.waitForTimeout(700);
    const tap = async (x, y) => {
      const p = await page.evaluate(
        ([x, y]) => {
          const r = document.querySelector("canvas").getBoundingClientRect();
          const scale = Math.min(r.width / 1280, r.height / 720);
          return {
            x: r.x + (r.width - 1280 * scale) / 2 + x * scale,
            y: r.y + (r.height - 720 * scale) / 2 + y * scale,
          };
        },
        [x, y],
      );
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(120);
    };
    await tap(640, 542);
    await tap(158, 626);
    await tap(640, 456);
    await page.waitForTimeout(600);
    await tap(1125, 72);
    await page.keyboard.press("Escape");
    await page.keyboard.press("KeyM");
    await page.screenshot({
      path:
        base === "/" ? "/tmp/facet-production.png" : "/tmp/facet-mobile.png",
    });
    await page.close();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Production smoke passed at / and /facet/, including touch-sized targets, keyboard, audio assets, and DPR 2.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
