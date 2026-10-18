-- Overbuffed's sprites: hand-drawn pixel grids, boiled Baba Is You style, exported by Aseprite.
-- Run: Aseprite.exe -b --script art/sprites.lua   (from the repo root)
--
-- Each sprite is drawn below as rows of text: "#" is the sprite's one flat colour, "." is empty. Gaps
-- inside a shape (eyes, mouths, seams between lobes) are just "." too: the ink ground shows through.
-- Every frame of the boil is the same drawing with its outer edge nibbled and sprouted a pixel here and
-- there, so the outline wobbles while eyes and seams stay put.

local function hex(h)
  return app.pixelColor.rgba(tonumber(h:sub(2, 3), 16), tonumber(h:sub(4, 5), 16), tonumber(h:sub(6, 7), 16), 255)
end
local C = { buff = hex("#cffb2d"), shot = hex("#f4ffd0"), rose = hex("#ff5d73"), amber = hex("#ff9f43"), violet = hex("#b06cff"), cyan = hex("#5ee6ff") }

-- Small deterministic noise, so the output never changes between runs.
local seed = 1
local function rnd() seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 end

local SPRITES = {
  -- buff: a soft lime block with tall eyes, a small mouth and two stubby feet.
  { name = "buff", color = C.buff, wobble = 0.22, rows = {
    "................",
    "....########....",
    "..############..",
    ".##############.",
    ".##############.",
    ".###..####..###.",
    ".###..####..###.",
    ".###..####..###.",
    ".##############.",
    ".######..######.",
    ".##############.",
    "..############..",
    "...##########...",
    "...###....###...",
    "...###....###...",
    "................",
  } },
  -- blob: a rose critter, two ear-lobes over a round body, split by a seam.
  { name = "blob", color = C.rose, wobble = 0.22, rows = {
    ".###....###.",
    "#####..#####",
    ".###....###.",
    "............",
    "..########..",
    ".##########.",
    ".##.####.##.",
    ".##.####.##.",
    ".##########.",
    ".##########.",
    "..########..",
    "............",
  } },
  -- spiker: an amber thistle, three thorns over a round body.
  { name = "spiker", color = C.amber, wobble = 0.2, rows = {
    "#....#....#.",
    "##...#...##.",
    ".##.###.##..",
    "..#######...",
    "............",
    "..#######...",
    ".#########..",
    ".##.###.##..",
    ".##.###.##..",
    ".#########..",
    "..#######...",
    "............",
  } },
  -- brute: a big violet elite, two lumps for a head over a body with a wide open grin and feet.
  { name = "brute", color = C.violet, wobble = 0.25, rows = {
    "...#####....#####...",
    "..#######..#######..",
    ".########..########.",
    ".########..########.",
    "..######....######..",
    "....................",
    "..################..",
    ".##################.",
    ".####..######..####.",
    ".####..######..####.",
    ".##################.",
    ".##################.",
    ".####..........####.",
    ".#####........#####.",
    ".##################.",
    "..################..",
    "...##############...",
    "...####......####...",
    "...####......####...",
    "....................",
  } },
  -- petal: buff's orbiting weapon, a lime leaf split down its midrib.
  { name = "petal", color = C.buff, wobble = 0.12, rows = {
    "........",
    "..##.##.",
    ".###.###",
    "####.###",
    "####.###",
    ".###.###",
    "..##.##.",
    "........",
  } },
  -- gem (XP): a lime crystal with one facet line.
  { name = "gem", color = C.buff, wobble = 0.08, rows = {
    "..##..",
    ".####.",
    "##.###",
    "###.##",
    ".####.",
    "..##..",
  } },
  -- dew: a cyan heal droplet with a highlight gap.
  { name = "dew", color = C.cyan, wobble = 0.08, rows = {
    "...#...",
    "..###..",
    "..###..",
    ".#####.",
    "##.####",
    "#######",
    ".#####.",
    "..###..",
  } },
  -- shot: a pale seed.
  { name = "shot", color = C.shot, wobble = 0.1, rows = {
    ".###.",
    "#####",
    "#####",
    "#####",
    ".###.",
  } },
}

-- Nibble and sprout single pixels on the outer edge only: empty pixels reachable from the border count as
-- "outside", so eye holes and seams never change.
local function wobble(img, w, h, amount)
  local function filled(x, y) return x >= 0 and y >= 0 and x < w and y < h and app.pixelColor.rgbaA(img:getPixel(x, y)) > 0 end
  local outside, stack = {}, {}
  for x = 0, w - 1 do stack[#stack + 1] = { x, 0 }; stack[#stack + 1] = { x, h - 1 } end
  for y = 0, h - 1 do stack[#stack + 1] = { 0, y }; stack[#stack + 1] = { w - 1, y } end
  while #stack > 0 do
    local p = table.remove(stack)
    local x, y = p[1], p[2]
    if x >= 0 and y >= 0 and x < w and y < h and not outside[y * w + x] and not filled(x, y) then
      outside[y * w + x] = true
      stack[#stack + 1] = { x + 1, y }; stack[#stack + 1] = { x - 1, y }
      stack[#stack + 1] = { x, y + 1 }; stack[#stack + 1] = { x, y - 1 }
    end
  end
  local function out(x, y) return x < 0 or y < 0 or x >= w or y >= h or outside[y * w + x] end
  local nib, sprout = {}, {}
  for y = 0, h - 1 do for x = 0, w - 1 do
    local n, col = 0, nil
    for _, d in ipairs({ { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }) do
      if filled(x + d[1], y + d[2]) then n = n + 1; col = img:getPixel(x + d[1], y + d[2]) end
    end
    if filled(x, y) then
      -- Only pixels whose empty neighbours are all outside: never eat into an eye or seam.
      local edge, safe = false, true
      for _, d in ipairs({ { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }) do
        local nx, ny = x + d[1], y + d[2]
        if not filled(nx, ny) then
          if out(nx, ny) then edge = true else safe = false end
        end
      end
      if edge and safe and n <= 2 and rnd() < amount * 1.3 then nib[#nib + 1] = { x, y } end
    elseif outside[y * w + x] and n >= 2 and rnd() < amount then
      sprout[#sprout + 1] = { x, y, col }
    end
  end end
  for _, p in ipairs(nib) do img:drawPixel(p[1], p[2], 0) end
  for _, p in ipairs(sprout) do img:drawPixel(p[1], p[2], p[3]) end
end

for si, s in ipairs(SPRITES) do
  local h, w = #s.rows, #s.rows[1]
  for _, row in ipairs(s.rows) do assert(#row == w, s.name .. ": rows must all be " .. w .. " wide") end
  local spr = Sprite(w, h, ColorMode.RGB)
  spr:newEmptyFrame(); spr:newEmptyFrame()
  for f = 1, 3 do
    seed = si * 7919 + f * 104729
    local img = Image(w, h, ColorMode.RGB)
    for y, row in ipairs(s.rows) do
      for x = 1, w do if row:sub(x, x) == "#" then img:drawPixel(x - 1, y - 1, s.color) end end
    end
    wobble(img, w, h, s.wobble)
    spr:newCel(spr.layers[1], f, img, Point(0, 0))
  end
  for _, fr in ipairs(spr.frames) do fr.duration = 0.125 end -- ~8 fps boil
  spr:saveAs("art/" .. s.name .. ".aseprite")
  app.command.ExportSpriteSheet { ui = false, type = SpriteSheetType.HORIZONTAL, textureFilename = "assets/" .. s.name .. "@" .. w .. "x" .. h .. ".png" }
  spr:close()
end
