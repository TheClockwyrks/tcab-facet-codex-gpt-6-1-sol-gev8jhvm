import type { InitApi, RenderApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import {
  ParticleSimulator,
  type ParticleSystem,
} from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  cellX,
  cellY,
  targets,
  type Art,
  type FacetState,
  type GemState,
} from "./game";
type S = DeepReadonly<FacetState>;
export async function loadArt(api: InitApi<FacetState>): Promise<Art> {
  const files = [
    "board",
    "brilliant",
    "star",
    ...C.GEM_KINDS.flatMap((k) =>
      Array.from({ length: 4 }, (_, s) => `${k}-${s}`),
    ),
    ...Array.from({ length: 4 }, (_, s) => `prism-${s}`),
    ...C.GEM_KINDS.flatMap((k) =>
      Array.from({ length: 6 }, (_, f) => `break/${k}/${f}`),
    ),
    ...Array.from({ length: 8 }, (_, f) => `prism-turn/${f}`),
  ];
  const [images, systems] = await Promise.all([
    Promise.all(
      files.map(
        async (p) => [p, await api.assets.loadImage(`gems/${p}.png`)] as const,
      ),
    ),
    Promise.all(
      ["clear", "flaw", "cut", "aura"].map(
        async (p) =>
          [
            p,
            JSON.parse(
              await (await api.assets.load(`fx/${p}.json`)).text(),
            ) as ParticleSystem,
          ] as const,
      ),
    ),
  ]);
  return {
    images: Object.fromEntries(images),
    systems: Object.fromEntries(systems),
  };
}
const cream = "#e8dfc4",
  gold = "#c8ae73",
  muted = "#83999c";
function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size = 18,
  color = cream,
  align: CanvasTextAlign = "left",
  serif = false,
) {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.font = `${serif ? "" : "500 "}${size}px ${serif ? "Georgia, serif" : '"Trebuchet MS", sans-serif'}`;
  ctx.fillText(s, x, y);
}
function rule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  ctx.strokeStyle = "#3b4e53";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
}
function image(
  s: S,
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  size = 64,
) {
  const img = s.art?.images[name];
  if (img) ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
}
function jewel(
  s: S,
  ctx: CanvasRenderingContext2D,
  g: DeepReadonly<GemState>,
  x: number,
  y: number,
) {
  ctx.save();
  ctx.shadowColor = g.strain === C.MAX_STRAIN ? "#ffc77b66" : "#000a";
  ctx.shadowBlur = g.strain === C.MAX_STRAIN ? 12 : 5;
  ctx.shadowOffsetY = 3;
  image(s, ctx, `${g.kind ?? "prism"}-${g.strain}`, x, y);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (g.cut === "prism") {
    ctx.globalAlpha = g.strain ? 0.28 : 0.75;
    image(s, ctx, `prism-turn/${Math.floor(s.simTime * 9) % 8}`, x, y);
    ctx.globalAlpha = 1;
  }
  if (g.cut === "brilliant" || g.cut === "star") image(s, ctx, g.cut, x, y);
  ctx.restore();
  if (g.cut !== "plain")
    effect(
      s,
      ctx,
      "aura",
      x,
      y,
      (s.simTime + g.col * 0.13 + g.row * 0.2) % 1.5,
      g.row * C.GRID_COLS + g.col,
    );
}
// Reconstruct each effect from its age. The renderer owns no advancing state;
// replaying a frame therefore reproduces exactly the same simulated particles.
function effect(
  s: S,
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  age: number,
  seed: number,
) {
  if (age < 0 || age > 1.5) return;
  const system = s.art?.systems[name];
  if (!system) return;
  const sim = new ParticleSimulator(system as ParticleSystem, {
    seed: seed + 128,
  });
  for (let t = 0; t < age; t += 1 / 60)
    sim.step(Math.min(1 / 60, age - t) * 1000);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of sim.capture()) {
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = `rgb(${p.color.map((v) => Math.round(v * 255)).join(",")})`;
    ctx.beginPath();
    ctx.arc(
      x + p.position[0],
      y - p.position[1],
      Math.max(0.2, p.size * 3),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}
function board(s: S, ctx: CanvasRenderingContext2D) {
  const img = s.art?.images.board;
  if (img) ctx.drawImage(img, 336, 92, 608, 608);
  ctx.save();
  ctx.beginPath();
  ctx.rect(350, 106, 580, 580);
  ctx.clip();
  const shatter = s.lastWaves * C.WAVE_SECONDS;
  const moving = s.phase === "resolving";
  for (const g of s.board.cells) {
    let x = cellX(g.col),
      y = cellY(g.row);
    const m = s.motion;
    if (s.phase === "swapping" && m?.a && m.b) {
      const t = 1 - Math.pow(1 - Math.min(1, s.swapTimer / C.SWAP_SECONDS), 3);
      if (g.col === m.a.col && g.row === m.a.row) {
        x = cellX(m.b.col) + (x - cellX(m.b.col)) * t;
        y = cellY(m.b.row) + (y - cellY(m.b.row)) * t;
      } else if (g.col === m.b.col && g.row === m.b.row) {
        x = cellX(m.a.col) + (x - cellX(m.a.col)) * t;
        y = cellY(m.a.row) + (y - cellY(m.a.row)) * t;
      }
    }
    if (s.offer && s.selection) {
      if (g.col === s.selection.col && g.row === s.selection.row) {
        x = cellX(s.offer.col);
        y = cellY(s.offer.row);
      } else if (g.col === s.offer.col && g.row === s.offer.row) {
        x = cellX(s.selection.col);
        y = cellY(s.selection.row);
      }
    }
    if (moving) {
      if (s.stepTimer < shatter) continue;
      const t = Math.min(
        1,
        Math.max(
          0,
          (s.stepTimer - shatter) / (g.fell * C.FALL_SECONDS_PER_ROW || 1),
        ),
      );
      y -= g.fell * C.CELL_PITCH * (1 - t * t);
    } else if (m?.dealAt !== undefined) {
      const t = Math.min(
        1,
        (s.simTime - m.dealAt) / (g.fell * C.FALL_SECONDS_PER_ROW),
      );
      y -= g.fell * C.CELL_PITCH * (1 - t * t);
    }
    jewel(s, ctx, g, x, y);
  }
  if (moving && s.motion?.old) {
    s.motion.old.forEach((g, i) => {
      const wave = s.motion?.waves?.[i] ?? -1;
      if (wave < 0) {
        if (s.stepTimer < shatter) jewel(s, ctx, g, cellX(g.col), cellY(g.row));
        return;
      }
      const age = s.stepTimer - wave * C.WAVE_SECONDS;
      const x = cellX(g.col),
        y = cellY(g.row);
      if (age < 0) jewel(s, ctx, g, x, y);
      else if (age < 0.3) {
        if (g.kind)
          image(
            s,
            ctx,
            `break/${g.kind}/${Math.min(5, Math.floor(age * 20))}`,
            x,
            y,
          );
        effect(
          s,
          ctx,
          g.strain === C.MAX_STRAIN ? "flaw" : "clear",
          x,
          y,
          age,
          i,
        );
      }
    });
    for (const p of s.motion.created ?? [])
      effect(
        s,
        ctx,
        "cut",
        cellX(p.col),
        cellY(p.row),
        s.stepTimer - shatter,
        p.row * C.GRID_COLS + p.col,
      );
  }
  ctx.restore();
  for (const [p, color] of [
    [s.selection, gold],
    [s.offer, "#7ce1db"],
    [s.refusal?.a, "#ff766e"],
    [s.refusal?.b, "#ff766e"],
  ] as const) {
    if (!p) continue;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cellX(p.col) - 33, cellY(p.row) - 33, 66, 66, 9);
    ctx.stroke();
  }
}
function button(
  s: S,
  ctx: CanvasRenderingContext2D,
  t: ReturnType<typeof targets>[number],
  label: string,
  i?: number,
) {
  const active = i === s.menuIndex || s.armedTarget === t.id;
  ctx.fillStyle = active ? "#c9b681" : "#142630";
  ctx.strokeStyle = active ? "#efe4bb" : "#496067";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(t.x, t.y, t.w, t.h, 3);
  ctx.fill();
  ctx.stroke();
  text(
    ctx,
    label,
    t.x + t.w / 2,
    t.y + t.h / 2 + 7,
    18,
    active ? "#15252b" : cream,
    "center",
  );
  if (active && i !== undefined)
    text(ctx, "›", t.x + 26, t.y + t.h / 2 + 8, 26, "#273a3e");
}
export function renderFacet(s: S, api: RenderApi) {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  const bg = ctx.createRadialGradient(640, 320, 30, 640, 360, 760);
  bg.addColorStop(0, "#182e36");
  bg.addColorStop(1, "#080f19");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  // Fine engraved field, with no competing objects around the lit board.
  ctx.strokeStyle = "#21313a";
  ctx.lineWidth = 0.7;
  for (let x = -600; x < 1500; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 720, 720);
    ctx.stroke();
  }
  rule(ctx, 46, 40, 160);
  rule(ctx, 1074, 680, 160);
  if (s.board.cells.length) board(s, ctx);
  if (s.screen === "playing") {
    text(ctx, C.TITLE_TEXT, 62, 98, 35, cream, "left", true);
    text(ctx, "THE LAPIDARY’S BENCH", 64, 121, 10, muted);
    rule(ctx, 64, 151, 211);
    text(ctx, C.HUD_SCORE_LABEL, 66, 205, 12, gold);
    text(ctx, s.score.toLocaleString(), 64, 251, 43, cream, "left", true);
    text(ctx, C.HUD_LEVEL_LABEL, 66, 306, 12, gold);
    text(
      ctx,
      String(s.level).padStart(2, "0"),
      64,
      352,
      43,
      cream,
      "left",
      true,
    );
    text(ctx, C.HUD_LEVEL_LABEL + " " + s.level, 356, 40, 12, gold);
    text(
      ctx,
      `${s.levelScore.toLocaleString()} / ${(s.level * C.LEVEL_TARGET_STEP).toLocaleString()}`,
      924,
      40,
      12,
      muted,
      "right",
    );
    ctx.fillStyle = "#283b42";
    ctx.fillRect(356, 57, 568, 4);
    ctx.fillStyle = gold;
    ctx.fillRect(
      356,
      57,
      568 * Math.min(1, s.levelScore / (s.level * C.LEVEL_TARGET_STEP)),
      4,
    );
    text(ctx, "BUILD THE PRESSURE", 1010, 223, 12, gold);
    text(ctx, "Every clear leaves", 1010, 252, 16, muted);
    text(ctx, "its mark on the stones", 1010, 276, 16, muted);
    text(ctx, "beside it.", 1010, 300, 16, muted);
    rule(ctx, 1010, 326, 198);
    for (let i = 0; i < 4; i++)
      image(s, ctx, `ruby-${i}`, 1034 + i * 48, 371, 44);
    text(ctx, "CLEAN  →  FLAWED", 1010, 418, 11, gold);
    text(ctx, "A flawed stone breaks", 1010, 451, 16, muted);
    text(ctx, "with a touching clear.", 1010, 475, 16, muted);
    text(ctx, "Double the value.", 1010, 509, 16, cream);
    if (s.phase === "resolving") {
      text(ctx, C.HUD_CHAIN_LABEL, 66, 426, 12, gold);
      text(
        ctx,
        `×${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`,
        64,
        478,
        52,
        "#8ce6dd",
        "left",
        true,
      );
      text(ctx, `+${s.lastPoints}`, 66, 510, 20, cream);
    }
    button(s, ctx, targets(s)[0], C.PAUSE_LABEL);
    text(ctx, "DRAG OR TAP TWO NEIGHBORS", 640, 715, 10, muted, "center");
    text(ctx, s.muted ? "M · SOUND OFF" : "M · SOUND ON", 65, 666, 11, muted);
    return;
  }
  if (s.screen === "title") {
    ctx.fillStyle = "#0a151eb8";
    ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
    text(ctx, "A STUDY IN CHAIN REACTIONS", 640, 112, 12, gold, "center");
    // A small exhibition of real stones, above the wordmark.
    for (let i = 0; i < 5; i++) {
      const g: GemState = {
        col: i,
        row: 0,
        kind: C.GEM_KINDS[[5, 4, 0, 3, 6][i]],
        strain: 0,
        cut: "plain",
        fell: 0,
      };
      jewel(s, ctx, g, 520 + i * 60, 179 + Math.abs(i - 2) * 7);
    }
    text(ctx, C.TITLE_TEXT, 640, 303, 112, cream, "center", true);
    rule(ctx, 490, 330, 300);
    text(ctx, C.TAGLINE_TEXT, 640, 365, 14, gold, "center");
    targets(s).forEach((t, i) => button(s, ctx, t, C.TITLE_ITEMS[i], i));
    text(
      ctx,
      "SWAP STONES. BUILD STRAIN. RELEASE A CHAIN.",
      640,
      651,
      12,
      muted,
      "center",
    );
    text(ctx, "01 / FACET", 64, 680, 11, gold);
    text(ctx, "M · SOUND", 1216, 680, 11, muted, "right");
    return;
  }
  if (s.screen === "howto") {
    ctx.fillStyle = "#0a151ef5";
    ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
    text(ctx, "THE ART OF PRESSURE", 78, 107, 43, cream, "left", true);
    text(ctx, "A small move can undo the whole board.", 80, 145, 18, muted);
    rule(ctx, 80, 173, 1120);
    const blocks = [
      [
        "01",
        "MAKE A RUN",
        "Seven kinds. Drag or tap two neighboring stones.",
        "Release beside a neighbor; return to your first stone to cancel.",
        "Match three in a line. A swap that clears nothing is refused.",
      ],
      [
        "02",
        "LEAVE A MARK",
        "Every clear strains the stones beside it.",
        "Three cracks make a flaw: it breaks with a touching clear.",
        "Flawed stones score double. Spend the pressure wisely.",
      ],
      [
        "03",
        "LET IT CASCADE",
        "Falling stones can match again, building a chain.",
        "Each step raises the multiplier, up to eight.",
        "Reach the level target to begin a fresh board.",
      ],
    ];
    blocks.forEach(([n, title, ...lines], i) => {
      const y = 216 + i * 112;
      text(ctx, n, 80, y, 28, gold, "left", true);
      text(ctx, title, 150, y, 16, cream);
      lines.forEach((line, j) =>
        text(ctx, line, 150, y + 27 + j * 22, 16, muted),
      );
    });
    const cuts = [
      ["brilliant", "FOUR → BRILLIANT", "Clears its eight neighbors."],
      ["star", "CROSS → STAR", "Clears its row and column."],
      ["prism-0", "FIVE OR MORE → PRISM", "Swap to clear an entire kind."],
    ];
    cuts.forEach(([img, label, desc], i) => {
      image(s, ctx, img, 908, 231 + i * 119);
      text(ctx, label, 954, 228 + i * 119, 12, gold);
      text(ctx, desc, 954, 254 + i * 119, 14, muted);
    });
    text(
      ctx,
      "A round ends when no productive swap remains.",
      150,
      566,
      16,
      cream,
    );
    button(s, ctx, targets(s)[0], C.BACK_LABEL);
    text(ctx, "P / ESC · PAUSE     M · MUTE", 1200, 642, 12, muted, "right");
    text(
      ctx,
      "MOUSE · PEN · TOUCH    |    ↑ ↓ MENUS    ENTER / SPACE · CHOOSE    ESC · BACK",
      640,
      688,
      12,
      muted,
      "center",
    );
    return;
  }
  ctx.fillStyle = "#07121cdd";
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.fillStyle = "#11232cf5";
  ctx.fillRect(410, 135, 460, 490);
  rule(ctx, 450, 163, 380);
  const title =
    s.screen === "paused"
      ? C.PAUSED_TITLE_TEXT
      : s.screen === "levelclear"
        ? C.LEVELCLEAR_TITLE_TEXT
        : C.GAMEOVER_TITLE_TEXT;
  text(ctx, title, 640, 244, 43, cream, "center", true);
  if (s.screen === "levelclear") {
    text(ctx, `${C.HUD_LEVEL_LABEL} ${s.level}`, 640, 292, 15, gold, "center");
    text(
      ctx,
      `${C.BEST_CHAIN_LABEL}  ${s.bestChain}`,
      640,
      335,
      16,
      cream,
      "center",
    );
    text(
      ctx,
      `${C.BEST_MOVE_LABEL}  ${s.bestMove}`,
      640,
      367,
      16,
      cream,
      "center",
    );
  } else if (s.screen === "gameover") {
    text(
      ctx,
      `${C.HUD_SCORE_LABEL}  ${s.score.toLocaleString()}`,
      640,
      325,
      27,
      gold,
      "center",
    );
    text(ctx, `${C.HUD_LEVEL_LABEL} ${s.level}`, 640, 367, 16, muted, "center");
  } else {
    text(ctx, "Let the dust settle.", 640, 315, 22, gold, "center", true);
    text(ctx, "Your stones will wait.", 640, 351, 16, muted, "center");
  }
  const items =
    s.screen === "paused"
      ? C.PAUSED_ITEMS
      : s.screen === "levelclear"
        ? C.LEVELCLEAR_ITEMS
        : C.GAMEOVER_ITEMS;
  targets(s).forEach((t, i) => button(s, ctx, t, items[i], i));
}
