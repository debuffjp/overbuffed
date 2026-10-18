import { BitmapFont, type Draw, type Frame, type Game, type TextDrawOptions } from "@debuffjp/core";
import { boil } from "./boil";

const GLYPHS = 95; // printable ASCII, one row per boil frame (art/font.lua)

/** buffont, debuff's bespoke pixel font, with its three boil frames. */
export class BoilText {
  private fonts: BitmapFont[];

  constructor(
    private game: Game,
    frames: readonly Frame[],
  ) {
    this.fonts = [0, 1, 2].map(
      (f) => new BitmapFont({ frames: frames.slice(f * GLYPHS, (f + 1) * GLYPHS), chars: BitmapFont.ASCII, spaceWidth: 3 }),
    );
  }

  /** The clean frame, for measuring. Every frame has the same widths. */
  get font(): BitmapFont {
    return this.fonts[0]!;
  }

  /** Draws text that boils with the rest of the screen. `phase` desyncs separate labels. */
  draw(draw: Draw, text: string, x: number, y: number, options: Omit<TextDrawOptions, "font"> = {}, phase = 0): void {
    draw.text(text, x, y, { ...options, font: this.fonts[boil(this.game, phase)]! });
  }
}
