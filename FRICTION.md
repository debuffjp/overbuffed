# debuff friction log

Things that got in the way while building Overbuffed. Each one should become a fix in debuff.

- [x] `create-debuff --help` prints the banner and "Pass a directory" instead of usage/options. Fixed in debuff 9a3a441.
- [x] CLI output (`debuff test`, `debuff build`) keeps ANSI colours when stdout isn't a TTY (agents/CI logs fill with escapes). Respect `isTTY` / `NO_COLOR`. Fixed in debuff 9a3a441.
- [x] **keiko hangs forever when the game loads assets** (debuff 0.5.0, Windows). `npx debuff test` prints the banner and never finishes, even with `-t` on a trivial test, no error and no boot timeout. Bisected: stubbing out `assets.load()` makes tests pass in ~1.5s. Scenarios in a real browser load the same assets fine. Logic tests are blocked until this is fixed. Fixed in debuff a586450: Vite's dependency optimizer ran on keiko's virtual timers and deadlocked.
- [ ] Default `draw.text` font is smooth, not pixel; a pixel-art game wants a pixel font out of the box (or a one-line way to get one). Overbuffed now draws its own (buffont); candidate to ship with debuff.
