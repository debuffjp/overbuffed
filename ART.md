# Art direction

**Boiling sprites, everywhere.** Every sprite, tile, UI frame and font glyph has 3 hand-redrawn
frames that loop at ~8 fps (line boil), so the whole screen gently wobbles like a flipbook.

- Draw in Aseprite (via an Aseprite MCP server, configured per machine). Sources live in `art/*.aseprite`;
  exported sheets go to `assets/` as `name@WxH.png`, frames left-to-right: boil 0, 1, 2, then any action frames.
- Redraw each boil frame — offset 1px of outline here and there; never just shift the whole sprite.
- Boil phase is offset per entity (from its id), so a crowd shimmers rather than pulsing in sync.
- Reduced motion: boil pauses on frame 0. Gameplay animation is unaffected.
- Palette: `src/palette.ts` only. 320×180, integer scale.
- Buff (lime, eyes, squash-and-stretch) is the hero. Enemies are geometric critters with distinct silhouettes.
