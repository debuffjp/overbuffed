# Art direction

**Silhouette-first night garden, boiling everywhere.**

## Shapes
- Every sprite is a **bold flat silhouette** in one fill colour: no outlines, shading, gradients or highlights.
- Shapes are built from chunky rounded forms (circles, soft-cornered squares, petal clusters) that
  **pile up and lock together**. Where two shapes touch, they're separated by a thin (1px) **contour gap**
  in `ink`, the ground colour showing through. Gaps carry all the detail: eyes, limbs, hands, overlaps.
- Contour lines are playful and hand-drawn, not geometric-perfect.
- Reference: a flat graphic mark where rounded black shapes cluster into a petal-like mass and a figure
  hugs it, with only thin cut-out lines separating them. We translate that into colour on a dark ground.

## Colour
- Dark `ink` ground, sparse flat fills from `src/palette.ts` only. Most of the screen is ink, deep and slate.
- Lime is buff and XP only. Warm fills mean danger. Cyan means good. Violet means elite.
- Enemy families differ by silhouette as well as colour.

## Boil
- Feel: Baba Is You. Chunky silhouettes whose outer edge nibbles and sprouts single pixels each frame;
  eyes and contour gaps stay crisp. `art/sprites.lua` generates the first pass in Aseprite.
- Every sprite, tile, UI frame and glyph has **3 hand-redrawn frames** looping at ~8 fps (line boil).
  What boils is mostly the contour gaps and silhouette edges, so the whole screen wobbles like a flipbook.
- Redraw each frame by nudging the gaps and edges by 1px. Never just shift the whole sprite.
- Boil phase is offset per entity (from its id), so a crowd shimmers instead of pulsing in sync.
- Reduced motion: boil pauses on frame 0. Gameplay animation is unaffected.

## Pipeline
- Draw in Aseprite (via an Aseprite MCP server, configured per machine). Sources go in `art/*.aseprite`.
  Exported sheets go to `assets/` as `name@WxH.png`, frames left to right: boil 0, 1, 2, then action frames.
- 320×180, integer scale. Buff (lime, gap-cut eyes, squash and stretch) is the hero.
- Text: **buffont**, our own pixel font (`art/font.lua` → `assets/font@6x11.png`, 5×7 caps, proportional).
  It boils by hopping each glyph a pixel up or down per frame; glyph shapes never change, so text stays legible.
