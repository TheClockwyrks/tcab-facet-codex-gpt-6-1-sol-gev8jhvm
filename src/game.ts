import type { Game, UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import { renderFacet, loadArt } from "./view";

export type GemKind =
  "ruby" | "amber" | "citrine" | "jade" | "beryl" | "sapphire" | "amethyst";

export type Cut = "plain" | "brilliant" | "star" | "prism";

export type Screen =
  "title" | "howto" | "playing" | "paused" | "levelclear" | "gameover";

export type Phase = "idle" | "swapping" | "resolving";

export type PointerDevice = "mouse" | "pen" | "touch";

export interface CellRef {
  readonly col: number;
  readonly row: number;
}

export interface GemState {
  readonly col: number;
  readonly row: number;
  readonly kind: GemKind | null;
  readonly cut: Cut;
  readonly strain: number;
  readonly fell: number;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly GemState[];
}

export interface RefusalState {
  readonly a: CellRef;
  readonly b: CellRef;
  readonly timer: number;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface FacetState {
  readonly screen: Screen;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly phase: Phase;
  readonly chainStep: number;
  readonly swapTimer: number;
  readonly stepTimer: number;

  readonly score: number;
  readonly level: number;
  readonly levelScore: number;
  readonly lastCleared: number;
  readonly lastPoints: number;
  readonly lastWaves: number;

  readonly moveScore: number;
  readonly bestMove: number;
  readonly bestChain: number;

  readonly selection: CellRef | null;
  readonly offer: CellRef | null;
  readonly refusal: RefusalState | null;
  readonly armedTarget: string | null;

  readonly pointer: PointerState;
  readonly simTime: number;
  readonly muted: boolean;
  readonly art?: Art;
  readonly motion?: Motion;
  readonly refillKinds: readonly string[];
}

export interface Art {
  readonly images: Readonly<Record<string, ImageBitmap>>;
  readonly systems: Readonly<
    Record<
      string,
      DeepReadonly<import("@clockwyrks/particle-runtime").ParticleSystem>
    >
  >;
}
export interface Motion {
  readonly a?: CellRef;
  readonly b?: CellRef;
  readonly old?: readonly GemState[];
  readonly waves?: readonly number[];
  readonly created?: readonly CellRef[];
  readonly dealAt?: number;
}
type S = DeepReadonly<FacetState>;
export const BACKGROUND = "#0a151e";
export const cellX = (col: number) =>
  C.BOARD_CX - ((C.GRID_COLS - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number) =>
  C.BOARD_CY - ((C.GRID_ROWS - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
const idx = (c: CellRef) => c.row * C.GRID_COLS + c.col;
const ref = (i: number): CellRef => ({
  col: i % C.GRID_COLS,
  row: Math.floor(i / C.GRID_COLS),
});
const adjacent = (a: CellRef, b: CellRef) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
const letters = "RACJBSM";
function integer(n: number, min = 0, max = Infinity) {
  if (!Number.isInteger(n) || n < min || n > max)
    throw new RangeError("Invalid integer");
  return n;
}
function points(n: number) {
  if (!Number.isFinite(n)) throw new RangeError("Invalid points");
  return n;
}
function cell(col: number, row: number) {
  integer(col, 0, C.GRID_COLS - 1);
  integer(row, 0, C.GRID_ROWS - 1);
  return { col, row };
}
function token(t: string, col: number, row: number): GemState {
  if (!/^(?:[RACJBSM][0-3][bs]?|X[0-3])$/.test(t))
    throw new Error("Invalid gem token");
  return {
    col,
    row,
    kind: t[0] === "X" ? null : C.GEM_KINDS[letters.indexOf(t[0])],
    strain: Number(t[1]),
    cut:
      t[0] === "X"
        ? "prism"
        : t[2] === "b"
          ? "brilliant"
          : t[2] === "s"
            ? "star"
            : "plain",
    fell: 0,
  };
}
export function initial(muted = false, art?: Art): FacetState {
  return {
    screen: "title",
    menuIndex: 0,
    board: { cols: 0, rows: 0, cells: [] },
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    score: 0,
    level: 1,
    levelScore: 0,
    lastCleared: 0,
    lastPoints: 0,
    lastWaves: 0,
    moveScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    simTime: 0,
    muted,
    refillKinds: Array(C.GRID_COLS).fill(""),
    art,
  };
}
export function runs(cells: readonly GemState[]): number[][] {
  const out: number[][] = [];
  if (!cells.length) return out;
  for (let axis = 0; axis < 2; axis++)
    for (let lane = 0; lane < C.GRID_ROWS; lane++) {
      let run: number[] = [];
      for (let n = 0; n <= C.GRID_COLS; n++) {
        const i = axis ? n * C.GRID_COLS + lane : lane * C.GRID_COLS + n;
        if (
          n < C.GRID_COLS &&
          cells[i]?.kind &&
          (!run.length || cells[run[0]].kind === cells[i].kind)
        )
          run.push(i);
        else {
          if (run.length >= C.MATCH_MIN) out.push(run);
          run = n < C.GRID_COLS && cells[i]?.kind ? [i] : [];
        }
      }
    }
  return out;
}
function exchanged(cells: readonly GemState[], a: CellRef, b: CellRef) {
  return cells.map((g, i) =>
    i === idx(a)
      ? { ...cells[idx(b)], ...a, fell: 0 }
      : i === idx(b)
        ? { ...cells[idx(a)], ...b, fell: 0 }
        : { ...g },
  );
}
export function productive(cells: readonly GemState[], a: CellRef, b: CellRef) {
  return (
    !!cells[idx(a)] &&
    !!cells[idx(b)] &&
    adjacent(a, b) &&
    (cells[idx(a)].cut === "prism" ||
      cells[idx(b)].cut === "prism" ||
      runs(exchanged(cells, a, b)).length > 0)
  );
}
export function legal(s: S): boolean {
  return s.board.cells.some((g) =>
    [
      [g.col + 1, g.row],
      [g.col, g.row + 1],
    ].some(
      ([c, r]) =>
        c < C.GRID_COLS &&
        r < C.GRID_ROWS &&
        productive(s.board.cells, g, { col: c, row: r }),
    ),
  );
}
export function deal(): BoardState {
  for (;;) {
    const cells: GemState[] = [];
    for (let i = 0; i < C.GRID_COLS * C.GRID_ROWS; i++) {
      const p = ref(i);
      let kind: GemKind;
      do {
        kind = C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)];
      } while (
        (p.col > 1 &&
          cells[i - 1].kind === kind &&
          cells[i - 2].kind === kind) ||
        (p.row > 1 &&
          cells[i - C.GRID_COLS].kind === kind &&
          cells[i - 2 * C.GRID_COLS].kind === kind)
      );
      cells.push({ ...p, kind, strain: 0, cut: "plain", fell: p.row + 1 });
    }
    const board = { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
    if (legal({ ...initial(), board })) return board;
  }
}
export function requestSwap(s: S, a: CellRef, b: CellRef): FacetState {
  if (s.phase !== "idle" || !productive(s.board.cells, a, b))
    return { ...s, refusal: { a, b, timer: 0 } };
  return {
    ...s,
    board: { ...s.board, cells: exchanged(s.board.cells, a, b) },
    phase: "swapping",
    swapTimer: 0,
    stepTimer: 0,
    chainStep: 0,
    moveScore: 0,
    motion: { a, b },
    refusal: null,
  };
}
export const lastFall = (s: S) =>
  Math.max(0, ...s.board.cells.map((g) => g.fell));
export const stepHold = (s: S) =>
  s.lastWaves * C.WAVE_SECONDS +
  lastFall(s) * C.FALL_SECONDS_PER_ROW +
  C.STEP_SECONDS;
function neighbors(i: number, diagonal = false): number[] {
  const p = ref(i),
    out: number[] = [];
  for (let y = -1; y <= 1; y++)
    for (let x = -1; x <= 1; x++)
      if (
        (x || y) &&
        (diagonal || Math.abs(x) + Math.abs(y) === 1) &&
        p.col + x >= 0 &&
        p.col + x < C.GRID_COLS &&
        p.row + y >= 0 &&
        p.row + y < C.GRID_ROWS
      )
        out.push(idx({ col: p.col + x, row: p.row + y }));
  return out;
}
export function resolve(s: S): FacetState {
  const cells = s.board.cells;
  const rs = runs(cells);
  let seed = rs.flat();
  const { a, b } = s.motion ?? {};
  if (s.chainStep === 1 && a && b) {
    const ga = cells[idx(a)],
      gb = cells[idx(b)];
    if (ga.cut === "prism" || gb.cut === "prism")
      seed = cells.flatMap((g, i) =>
        (ga.cut === "prism" && gb.cut === "prism") ||
        (g.cut === "prism" && (i === idx(a) || i === idx(b))) ||
        g.kind === (ga.cut === "prism" ? gb.kind : ga.kind)
          ? [i]
          : [],
      );
  }
  if (!seed.length) return s;
  // A breadth-first closure gives every reached cell its minimum wave.
  const waves = Array(cells.length).fill(-1) as number[];
  const queue = [...new Set(seed)];
  queue.forEach((i) => (waves[i] = 0));
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q],
      g = cells[i];
    let next = neighbors(i).filter((j) => cells[j].strain === C.MAX_STRAIN);
    if (g.cut === "brilliant") next = next.concat(neighbors(i, true));
    if (g.cut === "star")
      next = next.concat(
        cells.flatMap((h, j) =>
          h.col === g.col || h.row === g.row ? [j] : [],
        ),
      );
    for (const j of next)
      if (waves[j] < 0) {
        waves[j] = waves[i] + 1;
        queue.push(j);
      }
  }
  const created = new Map<number, GemState>();
  const place = (i: number, cut: Cut) => {
    const rank = { plain: 0, brilliant: 1, star: 2, prism: 3 };
    if (!created.has(i) || rank[cut] > rank[created.get(i)!.cut])
      created.set(i, {
        ...cells[i],
        cut,
        kind: cut === "prism" ? null : cells[i].kind,
        strain: 0,
        fell: 0,
      });
  };
  if (!(
    s.chainStep === 1 &&
    a &&
    b &&
    (cells[idx(a)].cut === "prism" || cells[idx(b)].cut === "prism")
  )) {
    for (const r of rs)
      if (r.length >= 4) {
        const i =
          r.find((i) => (!!a && i === idx(a)) || (!!b && i === idx(b))) ??
          r[Math.floor((r.length - 1) / 2)];
        place(i, r.length >= 5 ? "prism" : "brilliant");
      }
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++)
        for (const k of rs[i]) if (rs[j].includes(k)) place(k, "star");
  }
  const points = queue.reduce(
    (n, i) =>
      n +
      (cells[i].strain === C.MAX_STRAIN ? C.FLAWED_SCORE : C.BASE_SCORE) *
        Math.min(s.chainStep, C.MAX_MULTIPLIER),
    0,
  );
  // Score and strain read the old board; gravity operates on a fresh array.
  const surviving = cells.map((g, i) =>
    waves[i] >= 0
      ? (created.get(i) ?? null)
      : {
          ...g,
          strain: Math.min(
            C.MAX_STRAIN,
            g.strain + (neighbors(i).some((j) => waves[j] >= 0) ? 1 : 0),
          ),
        },
  );
  const result: GemState[] = Array(cells.length);
  for (let col = 0; col < C.GRID_COLS; col++) {
    let row = C.GRID_ROWS - 1;
    for (let r = C.GRID_ROWS - 1; r >= 0; r--) {
      const g = surviving[r * C.GRID_COLS + col];
      if (g) {
        result[row * C.GRID_COLS + col] = { ...g, col, row, fell: row - r };
        row--;
      }
    }
    for (; row >= 0; row--) {
      const letter = s.refillKinds[col][row];
      result[row * C.GRID_COLS + col] = {
        col,
        row,
        kind: letter
          ? C.GEM_KINDS[letters.indexOf(letter)]
          : C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)],
        cut: "plain",
        strain: 0,
        fell: row + 1,
      };
    }
  }
  return {
    ...s,
    board: { ...s.board, cells: result },
    lastCleared: queue.length,
    lastPoints: points,
    lastWaves: Math.max(...waves),
    score: s.score + points,
    levelScore: s.levelScore + points,
    moveScore: s.moveScore + points,
    bestChain: Math.max(s.bestChain, s.chainStep),
    motion: {
      ...s.motion,
      old: cells,
      waves,
      created: [...created.keys()].map(ref),
    },
  };
}
export interface Target {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export function targets(s: S): Target[] {
  if (s.screen === "playing")
    return [{ id: "pause", x: 1050, y: 36, w: 150, h: C.TARGET_MIN_H }];
  if (s.screen === "howto")
    return [{ id: "back", x: 78, y: 590, w: 160, h: C.TARGET_MIN_H }];
  return [0, 1].map((i) => ({
    id: `menu-${i}`,
    x: 480,
    y: 420 + i * 86,
    w: 320,
    h: C.TARGET_MIN_H,
  }));
}
const show = (s: S, screen: Screen): FacetState => ({
  ...s,
  screen,
  menuIndex: 0,
  armedTarget: null,
});
export function command(s: S, action: string): FacetState {
  if (action === "pause" && (s.screen === "playing" || s.screen === "paused"))
    return show(s, s.screen === "playing" ? "paused" : "playing");
  if (action === "back") {
    if (s.screen === "howto")
      return { ...s, screen: "title", menuIndex: 1, armedTarget: null };
    if (s.screen === "gameover") return show(s, "title");
    return s;
  }
  if (action === "up" || action === "down")
    return s.screen === "playing" || s.screen === "howto"
      ? s
      : { ...s, menuIndex: (s.menuIndex + 1) % 2 };
  if (action !== "confirm") return s;
  if (s.screen === "title" && s.menuIndex === 1) return show(s, "howto");
  if (s.screen === "title" || (s.screen === "gameover" && s.menuIndex === 0)) {
    const n = initial(s.muted, s.art);
    return {
      ...n,
      screen: "playing",
      board: deal(),
      simTime: s.simTime,
      pointer: s.pointer,
      motion: { dealAt: s.simTime },
    };
  }
  if (s.screen === "paused" && s.menuIndex === 0) return show(s, "playing");
  if (s.screen === "levelclear" && s.menuIndex === 0)
    return {
      ...show(s, "playing"),
      level: s.level + 1,
      levelScore: 0,
      bestMove: 0,
      bestChain: 0,
      board: deal(),
      motion: { dealAt: s.simTime },
    };
  if (
    ["paused", "levelclear", "gameover"].includes(s.screen) &&
    s.menuIndex === 1
  )
    return {
      ...s,
      screen: "title",
      menuIndex: 0,
      board: { cols: 0, rows: 0, cells: [] },
      phase: "idle",
      chainStep: 0,
      swapTimer: 0,
      stepTimer: 0,
      selection: null,
      offer: null,
      refusal: null,
      armedTarget: null,
      motion: undefined,
    };
  return s;
}
function hitCell(s: S, x: number, y: number): CellRef | null {
  let best: CellRef | null = null,
    d = C.GEM_HIT_R ** 2;
  for (const g of s.board.cells) {
    const v = (x - cellX(g.col)) ** 2 + (y - cellY(g.row)) ** 2;
    if (v <= d) {
      if (v < d || !best) {
        d = v;
        best = { col: g.col, row: g.row };
      }
    }
  }
  return best;
}
export function pointer(
  s: S,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
): FacetState {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !["mouse", "pen", "touch"].includes(device)
  )
    throw new Error("Invalid pointer");
  let n: FacetState = {
    ...s,
    pointer: {
      x,
      y,
      device,
      down: type === "down" ? true : type === "up" ? false : s.pointer.down,
    },
  };
  const t = targets(s).find(
    (t) => x >= t.x && y >= t.y && x <= t.x + t.w && y <= t.y + t.h,
  );
  if (t?.id.startsWith("menu-") && (type === "down" || !s.pointer.down))
    n = { ...n, menuIndex: Number(t.id.slice(5)) };
  if (type === "down") n = { ...n, armedTarget: t?.id ?? null };
  if (type === "up" && s.armedTarget) {
    n = { ...n, armedTarget: null };
    if (t?.id === s.armedTarget)
      return command(
        n,
        t.id === "pause" ? "pause" : t.id === "back" ? "back" : "confirm",
      );
    return n;
  }
  if ((t && type !== "up") || s.screen !== "playing")
    return type === "up" ? { ...n, armedTarget: null } : n;
  const c = hitCell(s, x, y);
  if (type === "down") {
    if (!c) n = { ...n, selection: null, offer: null };
    else if (!s.selection || !adjacent(c, s.selection))
      n = { ...n, selection: c, offer: null };
    else n = { ...n, offer: c };
  } else if (type === "move" && s.pointer.down && s.selection && c) {
    if (idx(c) === idx(s.selection)) n = { ...n, offer: null };
    else if (adjacent(c, s.selection)) n = { ...n, offer: c };
  }
  if (type === "up" && n.selection && n.offer)
    n = {
      ...requestSwap(n, n.selection, n.offer),
      selection: null,
      offer: null,
      armedTarget: null,
    };
  return n;
}
export function snapshot(s: S) {
  const { art: _art, motion: _motion, ...state } = s;
  return {
    version: C.FACET_DEBUG_VERSION,
    ...state,
    board: {
      ...s.board,
      cells: s.board.cells.map((g) => ({
        ...g,
        x: cellX(g.col),
        y: cellY(g.row),
      })),
    },
    refusal: s.refusal ? { a: s.refusal.a, b: s.refusal.b } : null,
    levelTarget: C.LEVEL_TARGET_STEP * s.level,
    multiplier: Math.min(s.chainStep, C.MAX_MULTIPLIER),
    lastFall: lastFall(s),
    stepHold: stepHold(s),
    legalSwap: legal(s),
    targets: targets(s),
  };
}
export const debug = {
  version: C.FACET_DEBUG_VERSION,
  reset: (s: S) => initial(s.muted, s.art),
  reconcile: (s: S): FacetState => ({ ...s }),
  snapshot,
  setScreen: (s: S, screen: Screen): FacetState => {
    if (
      ![
        "title",
        "howto",
        "playing",
        "paused",
        "levelclear",
        "gameover",
      ].includes(screen)
    )
      throw new Error("Invalid screen");
    return { ...s, screen };
  },
  setMenuIndex: (s: S, index: number): FacetState => ({
    ...s,
    menuIndex: integer(index),
  }),
  loadBoard: (s: S, rows: readonly string[]): FacetState => {
    if (rows.length !== C.GRID_ROWS) throw new Error("Invalid rows");
    return {
      ...s,
      board: {
        cols: C.GRID_COLS,
        rows: C.GRID_ROWS,
        cells: rows.flatMap((r, row) => {
          const ts = r.trim().split(/\s+/);
          if (ts.length !== C.GRID_COLS) throw new Error("Invalid columns");
          return ts.map((t, col) => token(t, col, row));
        }),
      },
    };
  },
  dealBoard: (s: S): FacetState => ({ ...s, board: deal() }),
  clearBoard: (s: S): FacetState => ({
    ...s,
    board: { cols: 0, rows: 0, cells: [] },
  }),
  setGem: (s: S, col: number, row: number, t: string): FacetState => {
    cell(col, row);
    if (!s.board.cells[idx({ col, row })]) throw new Error("No board");
    return {
      ...s,
      board: {
        ...s.board,
        cells: s.board.cells.map((g, i) =>
          i === idx({ col, row }) ? token(t, col, row) : g,
        ),
      },
    };
  },
  setRefillKinds: (s: S, col: number, kinds: string): FacetState => {
    integer(col, 0, C.GRID_COLS - 1);
    if (!/^[RACJBSM]*$/.test(kinds)) throw new Error("Invalid kinds");
    return {
      ...s,
      refillKinds: s.refillKinds.map((k, i) => (i === col ? kinds : k)),
    };
  },
  clearRefillKinds: (s: S): FacetState => ({
    ...s,
    refillKinds: Array(C.GRID_COLS).fill(""),
  }),
  setScore: (s: S, n: number): FacetState => ({ ...s, score: points(n) }),
  setLevel: (s: S, n: number): FacetState => ({ ...s, level: integer(n, 1) }),
  setLevelScore: (s: S, n: number): FacetState => ({
    ...s,
    levelScore: points(n),
  }),
  setBestChain: (s: S, n: number): FacetState => ({
    ...s,
    bestChain: integer(n),
  }),
  setBestMove: (s: S, n: number): FacetState => ({
    ...s,
    bestMove: points(n),
  }),
  setMoveScore: (s: S, n: number): FacetState => ({
    ...s,
    moveScore: points(n),
  }),
  setSelection: (s: S, col: number, row: number): FacetState => ({
    ...s,
    selection: cell(col, row),
  }),
  clearSelection: (s: S): FacetState => ({ ...s, selection: null }),
  setOffer: (s: S, col: number, row: number): FacetState => ({
    ...s,
    offer: cell(col, row),
  }),
  clearOffer: (s: S): FacetState => ({ ...s, offer: null }),
  clearRefusal: (s: S): FacetState => ({ ...s, refusal: null }),
  clearChain: (s: S): FacetState => ({
    ...s,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
  }),
  requestSwap: (s: S, ca: number, ra: number, cb: number, rb: number) =>
    requestSwap(s, cell(ca, ra), cell(cb, rb)),
  pointerDown: (s: S, x: number, y: number, d: PointerDevice = "mouse") =>
    pointer(s, "down", x, y, d),
  pointerMove: (s: S, x: number, y: number, d: PointerDevice = "mouse") =>
    pointer(s, "move", x, y, d),
  pointerUp: (s: S, d: PointerDevice = "mouse") =>
    pointer(s, "up", s.pointer.x, s.pointer.y, d),
};
export type FacetDebugApi = typeof debug;
function advance(s: S, dt: number, events: Set<string>): FacetState {
  let n: FacetState = { ...s };
  if (n.refusal)
    n = {
      ...n,
      refusal:
        n.refusal.timer + dt >= C.REFUSAL_SECONDS
          ? null
          : { ...n.refusal, timer: n.refusal.timer + dt },
    };
  // Spend the entire delta, carrying overshoot across swap and step boundaries.
  let left = dt;
  while (left > 0 && n.phase !== "idle") {
    if (n.phase === "swapping") {
      const take = Math.min(left, C.SWAP_SECONDS - n.swapTimer);
      left -= take;
      n = { ...n, swapTimer: n.swapTimer + take };
      if (n.swapTimer + 1e-10 < C.SWAP_SECONDS) break;
      n = resolve({
        ...n,
        phase: "resolving",
        swapTimer: 0,
        chainStep: 1,
        stepTimer: 0,
      });
      events.add(C.CUES.clear);
    } else {
      const start = n.stepTimer,
        land =
          n.lastWaves * C.WAVE_SECONDS + lastFall(n) * C.FALL_SECONDS_PER_ROW;
      const take = Math.min(left, stepHold(n) - start);
      left -= take;
      n = { ...n, stepTimer: start + take };
      if (start < land && n.stepTimer >= land && lastFall(n) > C.LAND_MIN_ROWS)
        events.add(C.CUES.land);
      if (n.stepTimer + 1e-10 < stepHold(n)) break;
      if (runs(n.board.cells).length) {
        n = resolve({ ...n, chainStep: n.chainStep + 1, stepTimer: 0 });
        events.add(C.CUES.clear);
      } else {
        n = {
          ...n,
          phase: "idle",
          chainStep: 0,
          stepTimer: 0,
          bestMove: Math.max(n.bestMove, n.moveScore),
        };
        if (n.levelScore >= n.level * C.LEVEL_TARGET_STEP) {
          n = show(n, "levelclear");
          events.add(C.CUES.levelUp);
        } else if (!legal(n)) {
          n = show(n, "gameover");
          events.add(C.CUES.gameOver);
        }
      }
    }
    if (n.motion?.created?.length && n.stepTimer === 0) events.add(C.CUES.cut);
    if (
      n.stepTimer === 0 &&
      n.motion?.old?.some(
        (g, i) =>
          g.strain === C.MAX_STRAIN - 1 &&
          (n.motion?.waves?.[i] ?? -1) < 0 &&
          neighbors(i).some((j) => (n.motion?.waves?.[j] ?? -1) >= 0),
      )
    )
      events.add(C.CUES.flaw);
  }
  return n;
}
function update(s: S, api: UpdateApi, dt: number): FacetState {
  let n: FacetState = { ...s, simTime: s.simTime + dt };
  const events = new Set<string>();
  const keys = Object.fromEntries(
    C.ACTIONS.map((k) => [k, api.input.pressed(k)]),
  );
  if (keys.mute) api.audio.setMuted(!api.audio.muted());
  if (keys.pause) n = command(n, "pause");
  else if (keys.back) n = command(n, "back");
  for (const k of ["up", "down", "confirm"]) if (keys[k]) n = command(n, k);
  for (const p of api.input.pointerSamples())
    if (p.primary && (p.button === null || p.button === "primary")) {
      const prev = n;
      n = pointer(n, p.type, p.x, p.y, p.device);
      if (n.selection && n.selection !== prev.selection)
        events.add(C.CUES.select);
      if (prev.phase === "idle" && n.phase === "swapping")
        events.add(C.CUES.swap);
      if (n.refusal && n.refusal !== prev.refusal) events.add(C.CUES.refuse);
    }
  n = {
    ...n,
    pointer: (({ x, y, down, device }) => ({ x, y, down, device }))(
      api.input.pointer(),
    ),
    muted: api.audio.muted(),
  };
  if (s.phase === "idle" && n.phase === "swapping") events.add(C.CUES.swap);
  if (n.screen === "playing") n = advance(n, dt, events);
  for (const e of events) {
    api.audio.play(e);
    if (e === C.CUES.clear)
      api.audio.play(`clear:${Math.min(n.chainStep || 1, C.MAX_MULTIPLIER)}`);
  }
  const theme =
    n.screen === "title" || n.screen === "howto" ? "title-theme" : "play-bed";
  const other = theme === "title-theme" ? "play-bed" : "title-theme";
  api.audio.stop(other);
  api.audio.loop(theme);
  return n;
}
export const game: Game<FacetState, FacetDebugApi> = {
  async initialize(api) {
    for (const a of C.ACTIONS)
      api.input.register(a, { keys: [...C.BINDINGS[a]] });
    const [art] = await Promise.all([
      loadArt(api),
      ...Object.values(C.CUES).map((c) =>
        api.audio.load(c, `audio/${c === "clear" ? "shatter" : c}.wav`),
      ),
      ...Array.from({ length: C.MAX_MULTIPLIER }, (_, i) =>
        api.audio.load(`clear:${i + 1}`, `audio/clear-${i + 1}.wav`),
      ),
      api.audio.load("title-theme", "audio/title.wav"),
      api.audio.load("play-bed", "audio/play.wav"),
    ]);
    for (const key of [
      "screen",
      "phase",
      "score",
      "level",
      "levelScore",
      "chainStep",
      "lastCleared",
      "lastPoints",
      "lastWaves",
      "bestMove",
      "bestChain",
    ] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register(
      "board",
      (s) => `${s.board.cols} × ${s.board.rows}`,
    );
    api.diagnostics.register("target", (s) => s.level * C.LEVEL_TARGET_STEP);
    api.diagnostics.register("multiplier", (s) =>
      Math.min(s.chainStep, C.MAX_MULTIPLIER),
    );
    api.diagnostics.register("lastFall", lastFall);
    api.diagnostics.register("legalSwap", legal);
    api.diagnostics.register("selection", (s) => JSON.stringify(s.selection));
    api.diagnostics.register("offer", (s) => JSON.stringify(s.offer));
    api.diagnostics.register(
      "pointer",
      (s) => `${s.pointer.device} ${s.pointer.x}, ${s.pointer.y}`,
    );
    return [initial(false, art), debug];
  },
  update,
  render: renderFacet,
};
