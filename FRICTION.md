# debuff friction log

Things that got in the way while building Overbuffed. Each one should become a fix in debuff.

- [x] `create-debuff --help` prints the banner and "Pass a directory" instead of usage/options. Fixed in debuff 9a3a441.
- [x] CLI output (`debuff test`, `debuff build`) keeps ANSI colours when stdout isn't a TTY (agents/CI logs fill with escapes). Respect `isTTY` / `NO_COLOR`. Fixed in debuff 9a3a441.
