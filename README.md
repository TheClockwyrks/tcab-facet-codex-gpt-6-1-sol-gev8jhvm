# Facet

A browser puzzle about cut stones and stored pressure. Swap neighboring gems into lines of three. Each clear strains the stones around it; flawed stones break with a touching clear and score double. Brilliant, star, and prism cuts turn small moves into spreading chains.

## Run

Requires Node.js 22 or later.

```sh
npm ci
npm run dev
```

Open the local address Vite prints. To create the self-contained static site:

```sh
npm run build
npm run preview
```

Serve `dist/` from any static server, at the root or a sub-path. All art, particle systems, sound effects, and music are committed under `public/assets/`; the build only bundles them. No asset tools, external services, credentials, or runtime network resources are needed.

## Controls

- Mouse, pen, or touch: drag a gem onto its neighbor and release, or tap two neighbors. Return to the original stone before releasing to withdraw an offer.
- Menus: pointer, ↑ / ↓, Enter or Space.
- P or Escape: pause / resume. Escape also returns from help and the final screen.
- M: mute all sound and music.
- The drawn PAUSE and BACK controls make every screen reachable by touch.

Fill the level meter to continue to a fresh board with a higher target. The round ends when no productive swap remains.

## Checks and source

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The engine owns frames, input, fitting, loading, audio, diagnostics, and recording. `src/game.ts` contains immutable state transitions and the debug surface; `src/view.ts` renders committed pixel sprites, animation frames, and live authored particle systems. Tests drive the engine on an in-process canvas and counted clocks, including uneven frame timing.

The optional Python scripts in `tools/` document the one-time asset production using `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample`, and `music`. They are authoring tools only and are never run by installation or build. Their binaries are unnecessary for playing or rebuilding Facet. `tools/capture.mjs`, run while the development server is on port 5173, captures the engine's own drawing for the showcase.

See `showcase/showcase.md` for the player presentation and `showcase/showcase.toml` for the media carousel.
