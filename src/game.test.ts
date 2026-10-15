/// <reference types="node" />
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import {
  game,
  initial,
  debug,
  runs,
  legal,
  resolve,
  cellX,
  cellY,
  type FacetState,
} from "./game";
import * as C from "./constants";
const fixtures = Array.from({ length: C.GRID_ROWS }, (_, r) =>
  Array.from(
    { length: C.GRID_COLS },
    (_, c) => "RACJBSM"[(r * 2 + c) % 7] + "0",
  ).join(" "),
);
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (url: string) => new Response(await readFile(`public/${url}`)),
  );
  vi.stubGlobal("createImageBitmap", async (b: Blob) =>
    loadImage(Buffer.from(await b.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      async decodeAudioData(b: ArrayBuffer) {
        return { duration: b.byteLength / 88200 };
      }
    },
  );
});
const engines: ReturnType<typeof createEngine<FacetState, typeof debug>>[] = [];
afterEach(() => {
  engines.splice(0).forEach((e) => e.destroy());
});
async function setup(step = 10) {
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const events = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  await engine.initialize();
  engines.push(engine);
  return { engine, events };
}
function board() {
  return debug.loadBoard({ ...initial(), screen: "playing" }, fixtures);
}
describe("board and resolution", () => {
  it("deals clean, productive opening boards with entry distances", () => {
    for (let i = 0; i < 20; i++) {
      const s = debug.dealBoard(initial());
      expect(runs(s.board.cells)).toEqual([]);
      expect(legal(s)).toBe(true);
      expect(
        s.board.cells.every(
          (g) => g.cut === "plain" && g.strain === 0 && g.fell >= g.row + 1,
        ),
      ).toBe(true);
    }
  });
  it("rejects unproductive and nonadjacent moves without mutating input", () => {
    const s = board();
    const before = JSON.stringify(s);
    const n = debug.requestSwap(s, 0, 0, 7, 7);
    expect(n.refusal).not.toBeNull();
    expect(n.board).toEqual(s.board);
    expect(JSON.stringify(s)).toBe(before);
    expect(debug.requestSwap(s, 0, 0, 1, 0).phase).toBe("idle");
  });
  it("expands flaws in breadth-first waves, scores before strain, and preserves survivors", () => {
    let s = board();
    for (let c = 0; c < 3; c++) s = debug.setGem(s, c, 2, "R0");
    s = debug.setGem(s, 3, 2, "J3");
    s = debug.setGem(s, 4, 2, "B3");
    s = debug.setGem(s, 4, 3, "M2");
    const n = resolve({ ...s, phase: "resolving", chainStep: 1 });
    expect(n.lastCleared).toBe(5);
    expect(n.lastWaves).toBe(2);
    expect(n.lastPoints).toBe(70);
    expect(n.board.cells.find((g) => g.col === 4 && g.row === 3)?.strain).toBe(
      3,
    );
    expect(s.board.cells[2 * 8 + 4].strain).toBe(3);
  });
  it("creates brilliant, prism and star stones with priority", () => {
    for (const [count, cut] of [
      [4, "brilliant"],
      [5, "prism"],
    ] as const) {
      let s = board();
      for (let c = 0; c < count; c++) s = debug.setGem(s, c, 0, "R0");
      const n = resolve({ ...s, chainStep: 1 });
      expect(n.board.cells.some((g) => g.cut === cut && g.strain === 0)).toBe(
        true,
      );
    }
    let s = board();
    for (const [c, r] of [
      [2, 1],
      [2, 2],
      [2, 3],
      [1, 2],
      [3, 2],
    ])
      s = debug.setGem(s, c, r, "R0");
    expect(
      resolve({ ...s, chainStep: 1 }).board.cells.some((g) => g.cut === "star"),
    ).toBe(true);
  });
  it("prism exchanges seed one kind, and double prisms clear the whole board", () => {
    let s = debug.setGem(board(), 0, 0, "X0");
    s = debug.setGem(s, 1, 0, "X0");
    const swapped = debug.requestSwap(s, 0, 0, 1, 0);
    expect(swapped.phase).toBe("swapping");
    const n = resolve({ ...swapped, chainStep: 1 });
    expect(n.lastCleared).toBe(64);
    expect(n.lastPoints).toBe(640);
  });
  it("obeys refill poses by final row and reports fall after resting", () => {
    let s = board();
    for (let c = 0; c < 3; c++) s = debug.setGem(s, c, 7, "R0");
    s = debug.setRefillKinds(s, 0, "M");
    const n = resolve({ ...s, chainStep: 1 });
    expect(n.board.cells[0].kind).toBe("amethyst");
    expect(n.board.cells[7 * 8].fell).toBe(1);
    expect(debug.clearChain(n).board).toEqual(n.board);
  });
  it("fails loudly for invalid debug domains and poses only requested fields", () => {
    const s = board();
    expect(() => debug.setGem(s, 8, 0, "R0")).toThrow();
    expect(() => debug.loadBoard(s, ["R0"])).toThrow();
    expect(() => debug.setRefillKinds(s, 0, "X")).toThrow();
    expect(() => debug.setLevel(s, 0)).toThrow();
    expect(() => debug.setMenuIndex(s, -1)).toThrow();
    expect(debug.setScreen(s, "paused").board).toBe(s.board);
    expect(debug.reconcile(s)).toEqual(s);
  });
});
describe("engine integration", () => {
  it("loads every produced asset and renders every screen", async () => {
    const { engine } = await setup();
    expect(engine.debug.version).toBe(C.FACET_DEBUG_VERSION);
    expect(engine.state.art?.images["ruby-3"]).toBeDefined();
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      engine.apply((s) => debug.setScreen(debug.dealBoard(s), screen));
      await engine.advance(1);
      expect(debug.snapshot(engine.state).targets.length).toBe(
        screen === "playing" || screen === "howto" ? 1 : 2,
      );
    }
    expect(engine.diagnostics().every((d) => !d.error)).toBe(true);
  });
  it("resolves exactly after the swap span and freezes clocks behind pause", async () => {
    const { engine } = await setup();
    engine.apply(() => debug.setGem(board(), 0, 0, "X0"));
    engine.apply((s) => debug.requestSwap(s, 0, 0, 1, 0));
    await engine.advance(17);
    expect(engine.state.phase).toBe("swapping");
    await engine.advance(1);
    expect(engine.state.phase).toBe("resolving");
    expect(engine.state.lastCleared).toBeGreaterThan(0);
    engine.apply((s) => debug.setScreen(s, "paused"));
    const timer = engine.state.stepTimer;
    await engine.advance(20);
    expect(engine.state.stepTimer).toBe(timer);
    expect(engine.state.simTime).toBeCloseTo(0.38);
  });
  it("drives selection, withdrawn offers, and release through touch poses", async () => {
    const { engine } = await setup();
    engine.apply(() => debug.setGem(board(), 0, 0, "X0"));
    engine.apply((s) => debug.pointerDown(s, cellX(0), cellY(0), "touch"));
    engine.apply((s) => debug.pointerMove(s, cellX(1), cellY(0), "touch"));
    expect(engine.state.offer).toEqual({ col: 1, row: 0 });
    engine.apply((s) => debug.pointerMove(s, cellX(0), cellY(0), "touch"));
    engine.apply((s) => debug.pointerUp(s, "touch"));
    expect(engine.state.phase).toBe("idle");
    expect(engine.state.selection).not.toBeNull();
    engine.apply((s) => debug.pointerDown(s, cellX(1), cellY(0), "touch"));
    engine.apply((s) => debug.pointerUp(s, "touch"));
    expect(engine.state.phase).toBe("swapping");
    expect(engine.state.selection).toBeNull();
  });
  it("uses the same pointer targets for title, help, play and pause", async () => {
    const { engine } = await setup();
    const click = (id: string) => {
      const t = debug.snapshot(engine.state).targets.find((t) => t.id === id)!;
      engine.apply((s) => debug.pointerDown(s, t.x + t.w / 2, t.y + t.h / 2));
      engine.apply((s) => debug.pointerUp(s));
    };
    click("menu-1");
    expect(engine.state.screen).toBe("howto");
    click("back");
    expect(engine.state.menuIndex).toBe(1);
    click("menu-0");
    expect(engine.state.screen).toBe("playing");
    click("pause");
    expect(engine.state.screen).toBe("paused");
    click("menu-0");
    expect(engine.state.screen).toBe("playing");
  });
  it("plays each event once per frame and toggles mute via the engine", async () => {
    const { engine, events } = await setup();
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    engine.apply(() => debug.setGem(board(), 0, 0, "X0"));
    engine.apply((s) => debug.requestSwap(s, 0, 0, 1, 0));
    await engine.advance(18);
    expect(cues.filter((c) => c === C.CUES.clear)).toHaveLength(1);
    events.dispatchEvent(Object.assign(new Event("keydown"), { code: "KeyM" }));
    await engine.advance(1);
    expect(engine.state.muted).toBe(true);
  });
  it("carries overshoot identically across frame partitions with posed refill", async () => {
    const a = (await setup()).engine,
      b = (await setup()).engine;
    let s = debug.setGem(board(), 0, 0, "X0");
    for (let c = 0; c < 8; c++)
      s = debug.setRefillKinds(
        s,
        c,
        Array.from({ length: 8 }, (_, r) => "RACJBSM"[(r * 2 + c) % 7]).join(
          "",
        ),
      );
    s = debug.requestSwap(s, 0, 0, 1, 0);
    a.apply(() => s);
    b.apply(() => s);
    b.setClock(new SequenceClock([37, 23]));
    await a.advance(60);
    await b.advance(20);
    expect(a.state.phase).toBe(b.state.phase);
    expect(a.state.stepTimer).toBeCloseTo(b.state.stepTimer);
    expect(a.state.board).toEqual(b.state.board);
    expect(a.state.score).toBe(b.state.score);
  });
  it("completes a level after settling and carries total score into a fresh board", async () => {
    const { engine } = await setup();
    let s = debug.setGem(board(), 0, 0, "X0");
    for (let c = 0; c < 8; c++)
      s = debug.setRefillKinds(
        s,
        c,
        Array.from({ length: 8 }, (_, r) => "RACJBSM"[(r * 2 + c) % 7]).join(
          "",
        ),
      );
    s = debug.setLevelScore(s, C.LEVEL_TARGET_STEP);
    engine.apply(() => debug.requestSwap(s, 0, 0, 1, 0));
    await engine.advance(400);
    expect(engine.state.screen).toBe("levelclear");
    const score = engine.state.score;
    engine.apply((s) => debug.pointerDown(s, 640, 456));
    engine.apply((s) => debug.pointerUp(s));
    expect(engine.state.level).toBe(2);
    expect(engine.state.score).toBe(score);
    expect(engine.state.levelScore).toBe(0);
  });
});
describe("round boundaries and special cuts", () => {
  it("expands brilliant rings and complete star axes recursively", () => {
    let s = board();
    for (let c = 0; c < 3; c++) s = debug.setGem(s, c, 3, "R0");
    s = debug.setGem(s, 2, 3, "R0b");
    s = debug.setGem(s, 3, 4, "J0s");
    const n = resolve({ ...s, chainStep: 8 });
    expect(n.lastWaves).toBeGreaterThan(0);
    expect(n.lastCleared).toBeGreaterThan(16);
    expect(n.lastPoints).toBe(n.lastCleared * C.BASE_SCORE * C.MAX_MULTIPLIER);
  });
  it("ends only when a chain settles, with level completion taking priority", async () => {
    const { engine } = await setup();
    const s = { ...board(), phase: "resolving" as const, chainStep: 1 };
    expect(legal(s)).toBe(false);
    engine.apply(() => s);
    await engine.advance(25);
    expect(engine.state.screen).toBe("gameover");
    engine.apply(() => ({ ...s, levelScore: C.LEVEL_TARGET_STEP }));
    await engine.advance(25);
    expect(engine.state.screen).toBe("levelclear");
  });
  it("puts a quit round down but retains its earned figures", async () => {
    const { engine } = await setup();
    engine.apply(() => ({
      ...board(),
      screen: "paused",
      menuIndex: 1,
      score: 1234,
      level: 3,
      levelScore: 420,
    }));
    engine.apply((s) => debug.pointerDown(s, 640, 542));
    engine.apply((s) => debug.pointerUp(s));
    expect(engine.state.screen).toBe("title");
    expect(engine.state.board.cells).toEqual([]);
    expect(engine.state.score).toBe(1234);
    expect(engine.state.level).toBe(3);
    expect(engine.state.levelScore).toBe(420);
    expect(debug.reset(engine.state).score).toBe(0);
  });
  it("poses points literally, clears only named fields and validates tokens", () => {
    let s = debug.setScore(board(), -12.5);
    expect(s.score).toBe(-12.5);
    s = debug.setBestMove(s, 500);
    s = debug.setMoveScore(s, 23);
    s = debug.setBestChain(s, 7);
    s = debug.setSelection(s, 1, 2);
    s = debug.setOffer(s, 2, 2);
    expect(debug.clearSelection(s).offer).toEqual(s.offer);
    expect(debug.clearOffer(s).selection).toEqual(s.selection);
    expect(debug.clearRefillKinds(s).refillKinds.every((k) => k === "")).toBe(
      true,
    );
    expect(debug.clearRefusal(s).refusal).toBeNull();
    expect(debug.clearBoard(s).board.cells).toEqual([]);
    expect(() => debug.setGem(s, 0, 0, "X0b")).toThrow();
    expect(() => debug.setScore(s, NaN)).toThrow();
  });
  it("cancels an armed menu press released elsewhere and clears a distant board press", async () => {
    const { engine } = await setup();
    engine.apply((s) => debug.pointerDown(s, 640, 456));
    engine.apply((s) => debug.pointerMove(s, 100, 100));
    engine.apply((s) => debug.pointerUp(s));
    expect(engine.state.screen).toBe("title");
    engine.apply(() => debug.setSelection(board(), 0, 0));
    engine.apply((s) => debug.pointerDown(s, 15, 15));
    expect(engine.state.selection).toBeNull();
  });
});
