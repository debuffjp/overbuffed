# Art direction

**Squish: soft, round, flat critters on a calm dark ground.** Overbuffed uses debuff's own house look,
the one in the `squish` template.

## Shapes
- Every shape is **flat, rounded and soft**: circles and round-cornered rects. No outlines, shading,
  gradients, highlights or jagged pixel edges.
- Characters get **two ink dot eyes**, and nothing else for a face.
- Every enemy family has **its own silhouette as well as its own colour**, so a crowd reads without telling
  hues apart:
  - blob: round, pink
  - spiker: diamond, amber
  - brute (elite): big pill, lilac
- buff's weapons are sky: seed shots are dots, petals are little pills that point along their orbit, and
  the pulse is a ring of dots. XP gems are small lime diamonds; healing dew is a mint drop.

## Colour
- Only the squish palette in `src/palette.ts`. The ground is ink `#11140d`, kept sparse and calm (a few soft
  pebbles in the panel colour) so the swarm always reads.
- **Lime is buff and XP only.** Sky is buff's weapons. Pink, amber and lilac are enemies. Mint heals.
- Text is `#d3dcc2`, or lime for what you act on. Muted `#6b7560` isn't used for text: it's below 4.5:1.

## Motion
- Squash and stretch from the feet (`squash()` from `@debuffjp/juice`): buff squashes when hit or levelling up.
- Idle wobble: buff breathes; critters tilt and breathe, each out of step (phase from its id).
- Hit critters swell and squash for a moment with a soft flash. Dying critters squash flat, swell sideways and
  fade, with round particles in their colour.
- Gems bob. Title critters pop in with an `outBack` overshoot, then hop.
- Reduced motion: no wobble, squash, bob, pops or pop-ins. Gameplay is unaffected.

## Text and UI
- debuff sans (the default `draw.text` font), scaled up for headings.
- Panels and cards are `@debuffjp/ui`'s rounded, outline-free boxes in the panel colour. The selected card
  lifts and gets a lime nub instead of a border.

## Pipeline
- No image assets. Every shape is painted in code at startup (`src/systems/shapes.ts`) into one atlas canvas
  at 8 texture pixels per game pixel, then drawn as sprites. Crowds (critters, shots, petals, gems) go through
  `draw.sprites`, one call per shape.
- 320×180 logical, smooth scaling (not pixel art), so shapes stay soft at any screen size.
- To change a shape, edit its painter in `shapes.ts`; to change a colour, edit `palette.ts`.
