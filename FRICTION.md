# debuff friction log

Things that got in the way while building Overbuffed. Each one should become a fix in debuff.

- [ ] `create-debuff --help` prints the banner and "Pass a directory" instead of usage/options.
- [ ] CLI output (`debuff test`, `debuff build`) keeps ANSI colours when stdout isn't a TTY (agents/CI logs fill with escapes). Respect `isTTY` / `NO_COLOR`.
