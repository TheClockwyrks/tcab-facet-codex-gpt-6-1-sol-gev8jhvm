/* global document, console */
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// Capture is deliberately isolated from the development server’s hot reload.
await page.route("**/@vite/client", (route) =>
  route.fulfill({ contentType: "application/javascript", body: "" }),
);
const failures = [];
page.on("pageerror", (e) => failures.push(e.message));
await page.goto("http://localhost:5173/tools/capture.html");
const handle = await page.evaluateHandle(async () => {
  const { createEngine, ConstantClock } =
    await import("/.vendor/engine/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const e = createEngine({
    canvas: document.querySelector("canvas"),
    width: 1280,
    height: 720,
    background: BACKGROUND,
    game,
    clock: new ConstantClock(1000 / 60),
  });
  await e.initialize();
  await e.advance(1);
  return e;
});
await page.screenshot({ path: "showcase/title.png" });
await handle.evaluate(async (e) => {
  const d = e.debug;
  const rows = Array.from({ length: 8 }, (_, r) =>
    Array.from({ length: 8 }, (_, c) => "RACJBSM"[(r * 2 + c) % 7] + "0").join(
      " ",
    ),
  );
  e.apply((s) => d.loadBoard(s, rows));
  e.apply((s) => d.setScreen(s, "playing"));
  for (const [c, r, t] of [
    [0, 5, "R0"],
    [1, 5, "R0"],
    [2, 5, "J0"],
    [2, 4, "R0"],
    [3, 5, "B3"],
    [4, 5, "S3b"],
    [4, 4, "J3"],
    [5, 4, "C3"],
    [5, 5, "M3s"],
    [5, 6, "A3"],
    [6, 6, "R2"],
    [4, 6, "S2"],
    [6, 2, "X0"],
    [2, 2, "B0b"],
    [1, 1, "C0s"],
  ])
    e.apply((s) => d.setGem(s, c, r, t));
  for (let c = 0; c < 8; c++)
    e.apply((s) =>
      d.setRefillKinds(
        s,
        c,
        Array.from({ length: 8 }, (_, r) => "RACJBSM"[(r * 2 + c) % 7]).join(
          "",
        ),
      ),
    );
  await e.advance(1);
});
await page.screenshot({ path: "showcase/board.png" });
await handle.evaluate(async (e) => {
  e.startRecording();
  e.apply((s) => e.debug.pointerDown(s, 532, 432));
  e.apply((s) => e.debug.pointerMove(s, 532, 504));
  e.apply((s) => e.debug.pointerUp(s));
  await e.advance(26);
});
await page.screenshot({ path: "showcase/pressure.png" });
const replay = await handle.evaluate(async (e) => {
  await e.advance(214);
  return e.stopRecording();
});
await writeFile("showcase/pressure.json.gz", gzipSync(JSON.stringify(replay)));
await handle.evaluate((e) => e.destroy());
await browser.close();
if (failures.length) throw new Error(failures.join("\n"));
console.log(`Captured ${replay.frames.length} frames and three screenshots.`);
