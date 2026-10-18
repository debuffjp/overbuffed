-- Overbuffed's sprites, drawn by Aseprite from soft shapes, boiled the way Baba Is You boils.
-- Run: Aseprite.exe -b --script art/sprites.lua   (from the repo root)
--
-- Each sprite is a few parts: rounded bodies ("soft"), thorns ("tri"), and holes for dot eyes and mouths.
-- A pixel belongs to the topmost part covering it. Where two parts meet, the lower one leaves a 1px seam,
-- so lobes, ears and feet read as separate pieces locked together. One flat colour, no outlines.
--
-- The boil: every frame redraws every outline. A soft body's radius wobbles around its edge with a little
-- low-frequency noise, re-rolled per frame, so the whole contour breathes by about a pixel. Thorn tips
-- and eyes jitter a fraction of a pixel too.

local function hex(h)
  return app.pixelColor.rgba(tonumber(h:sub(2, 3), 16), tonumber(h:sub(4, 5), 16), tonumber(h:sub(6, 7), 16), 255)
end
local C = { buff = hex("#cffb2d"), shot = hex("#f4ffd0"), rose = hex("#ff5d73"), amber = hex("#ff9f43"), violet = hex("#b06cff"), cyan = hex("#5ee6ff") }

local seed = 1
local function rnd() seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 end
local function jit(a) return (rnd() * 2 - 1) * a end

-- Per-frame randomness for each part: noise phases for soft edges, offsets for points.
local function boil(part)
  local p = {}
  for k, v in pairs(part) do p[k] = v end
  if p.kind == "soft" then
    p.waves = {}
    for k = 2, 5 do p.waves[#p.waves + 1] = { k = k, a = 0.35 + rnd() * 0.65, phase = rnd() * math.pi * 2 } end
    p.x, p.y = p.x + jit(0.15), p.y + jit(0.15)
  elseif p.kind == "tri" then
    p.points = {}
    for i, v in ipairs(part.points) do p.points[i] = v + jit(part.wob or 0.45) end
  elseif p.kind == "dot" or p.kind == "bar" then
    p.x, p.y = p.x + jit(0.25), p.y + jit(0.2)
  end
  return p
end

local function inside(s, x, y)
  local px, py = x + 0.5, y + 0.5
  if s.kind == "soft" then
    local dx, dy = (px - s.x) / s.rx, (py - s.y) / s.ry
    local e = s.p or 2
    local d = (math.abs(dx) ^ e + math.abs(dy) ^ e) ^ (1 / e)
    local theta = math.atan(dy, dx)
    local n = 0
    for _, w in ipairs(s.waves) do n = n + w.a * math.sin(w.k * theta + w.phase) end
    -- `wob` is in pixels; divide by the mean radius to scale the normalised distance.
    return d <= 1 + (n / 2) * (s.wob or 0.8) / ((s.rx + s.ry) / 2)
  elseif s.kind == "dot" then
    return (px - s.x) ^ 2 + (py - s.y) ^ 2 <= s.r ^ 2
  elseif s.kind == "bar" then -- rounded rect, for mouths
    local r = math.min(s.h, s.w) / 2
    local cx = math.max(s.x + r, math.min(px, s.x + s.w - r))
    local cy = math.max(s.y + r, math.min(py, s.y + s.h - r))
    return (px - cx) ^ 2 + (py - cy) ^ 2 <= r * r
  elseif s.kind == "tri" then
    local p, n, inside = s.points, #s.points // 2, false
    local j = n
    for i = 1, n do
      local xi, yi, xj, yj = p[i * 2 - 1], p[i * 2], p[j * 2 - 1], p[j * 2]
      if (yi > py) ~= (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi then inside = not inside end
      j = i
    end
    return inside
  end
end

local function render(img, w, h, parts, color)
  local owner = {}
  for y = 0, h - 1 do for x = 0, w - 1 do
    local o = 0
    for i, s in ipairs(parts) do if inside(s, x, y) then o = i end end
    owner[y * w + x] = o
  end end
  for y = 0, h - 1 do for x = 0, w - 1 do
    local o = owner[y * w + x]
    if o > 0 and not parts[o].hole then
      local seam = false
      for _, d in ipairs({ { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }) do
        local nx, ny = x + d[1], y + d[2]
        if nx >= 0 and ny >= 0 and nx < w and ny < h then
          local n = owner[ny * w + nx]
          if n > o and not parts[n].hole and not parts[n].merge then seam = true end
        end
      end
      if not seam then img:drawPixel(x, y, color) end
    end
  end end
end

local soft = function(x, y, rx, ry, o)
  local p = { kind = "soft", x = x, y = y, rx = rx, ry = ry }
  for k, v in pairs(o or {}) do p[k] = v end
  return p
end
local eye = function(x, y, r) return { kind = "dot", x = x, y = y, r = r or 1, hole = true } end
local mouth = function(x, y, w, hgt) return { kind = "bar", x = x, y = y, w = w, h = hgt, hole = true } end
local tri = function(...) return { kind = "tri", points = { ... } } end

local SPRITES = {
  -- buff: a soft lime block on two stubby feet, dot eyes and a little mouth.
  { name = "buff", w = 22, h = 22, color = C.buff, parts = {
    soft(7.5, 19, 2.8, 2.2, { wob = 0.4 }),
    soft(14.5, 19, 2.8, 2.2, { wob = 0.4 }),
    soft(11, 10.5, 9.2, 8.4, { p = 2.7, wob = 1.1 }),
    eye(8, 9.5, 1.15), eye(14, 9.5, 1.15),
    mouth(10, 13, 2.2, 1.2),
  } },
  -- blob: a round rose critter with two ears.
  { name = "blob", w = 16, h = 16, color = C.rose, parts = {
    soft(4.6, 4, 2.3, 2.8, { wob = 0.5 }),
    soft(11.4, 4, 2.3, 2.8, { wob = 0.5 }),
    soft(8, 10.2, 6.6, 5.2, { p = 2.2, wob = 1 }),
    eye(6, 10, 0.95), eye(10, 10, 0.95),
  } },
  -- spiker: an amber thistle, three thorns over a small round body.
  { name = "spiker", w = 16, h = 16, color = C.amber, parts = {
    tri(1.5, 0.5, 6, 7.5, 3, 8.5),
    tri(8, 0, 10.2, 7, 5.8, 7),
    tri(14.5, 0.5, 13, 8.5, 10, 7.5),
    soft(8, 11.3, 5.6, 4.4, { p = 2.2, wob = 0.9 }),
    eye(6.2, 11.3, 0.9), eye(9.8, 11.3, 0.9),
  } },
  -- brute: a big violet elite, a lumpy two-part head over a wide body with a grin and two feet.
  { name = "brute", w = 30, h = 30, color = C.violet, parts = {
    soft(9, 27, 3.8, 2.4, { wob = 0.5 }),
    soft(21, 27, 3.8, 2.4, { wob = 0.5 }),
    soft(9, 7, 6, 5.4, { wob = 0.9 }),
    soft(21, 7, 6, 5.4, { wob = 0.9 }),
    soft(15, 17, 12.6, 9.4, { p = 2.6, wob = 1.4 }),
    eye(11, 14, 1.4), eye(19, 14, 1.4),
    mouth(9.5, 18.5, 11, 2.6),
  } },
  -- petal: buff's orbiting weapon, a lime leaf with a midrib seam.
  { name = "petal", w = 10, h = 10, color = C.buff, parts = {
    soft(3.7, 5, 3.2, 4.2, { wob = 0.5 }),
    soft(6.3, 5, 3.2, 4.2, { wob = 0.5 }),
  } },
  -- gem (XP): a small lime crystal.
  { name = "gem", w = 8, h = 8, color = C.buff, parts = {
    soft(4, 4, 3.4, 3.6, { p = 1.25, wob = 0.5 }),
  } },
  -- dew: a cyan droplet that heals, with a highlight cut.
  { name = "dew", w = 9, h = 11, color = C.cyan, parts = {
    tri(4.5, 0.2, 7.6, 6.5, 1.4, 6.5),
    soft(4.5, 7, 3.6, 3.4, { wob = 0.5, merge = true }),
    eye(3.2, 6.8, 0.8),
  } },
  -- shot: a pale seed.
  { name = "shot", w = 6, h = 6, color = C.shot, parts = {
    soft(3, 3, 2.6, 2.6, { wob = 0.5 }),
  } },
}

for si, s in ipairs(SPRITES) do
  local spr = Sprite(s.w, s.h, ColorMode.RGB)
  spr:newEmptyFrame(); spr:newEmptyFrame()
  for f = 1, 3 do
    seed = si * 7919 + f * 104729
    local parts = {}
    for i, part in ipairs(s.parts) do parts[i] = boil(part) end
    local img = Image(s.w, s.h, ColorMode.RGB)
    render(img, s.w, s.h, parts, s.color)
    spr:newCel(spr.layers[1], f, img, Point(0, 0))
  end
  for _, fr in ipairs(spr.frames) do fr.duration = 0.125 end -- ~8 fps boil
  spr:saveAs("art/" .. s.name .. ".aseprite")
  app.command.ExportSpriteSheet { ui = false, type = SpriteSheetType.HORIZONTAL, textureFilename = "assets/" .. s.name .. "@" .. s.w .. "x" .. s.h .. ".png" }
  spr:close()
end
