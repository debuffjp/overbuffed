-- Generates Overbuffed's first-pass sprites: flat silhouettes, 1px ink contour gaps, 3 boil frames.
-- Run: Aseprite.exe -b --script art/sprites.lua   (from the repo root)
-- Each sprite is a list of shapes. A pixel takes the topmost shape that covers it; where two shapes
-- meet, the lower one leaves a 1px gap so the ink ground shows through. "hole" shapes cut gaps (eyes).

local function hex(h)
  return app.pixelColor.rgba(tonumber(h:sub(2,3),16), tonumber(h:sub(4,5),16), tonumber(h:sub(6,7),16), 255)
end
local C = { buff = hex("#cffb2d"), shot = hex("#f4ffd0"), rose = hex("#ff5d73"), amber = hex("#ff9f43"), violet = hex("#b06cff"), cyan = hex("#5ee6ff") }

-- Small deterministic noise so each boil frame wobbles differently but the output never changes.
local seed = 1
local function rnd() seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 end
local function j(amount) return (rnd() * 2 - 1) * amount end

local function inside(s, x, y)
  local px, py = x + 0.5, y + 0.5
  if s.kind == "circle" then
    return (px - s.x)^2 + (py - s.y)^2 <= s.r^2
  elseif s.kind == "rrect" then -- rounded rect: x,y,w,h,r
    local cx = math.max(s.x + s.r, math.min(px, s.x + s.w - s.r))
    local cy = math.max(s.y + s.r, math.min(py, s.y + s.h - s.r))
    return px >= s.x and px <= s.x + s.w and py >= s.y and py <= s.y + s.h and (px - cx)^2 + (py - cy)^2 <= s.r^2
  end
end

local function render(img, w, h, shapes, color)
  local owner = {}
  for y = 0, h - 1 do for x = 0, w - 1 do
    local o = 0
    for i, s in ipairs(shapes) do if inside(s, x, y) then o = i end end
    owner[y * w + x] = o
  end end
  for y = 0, h - 1 do for x = 0, w - 1 do
    local o = owner[y * w + x]
    if o > 0 and not shapes[o].hole then
      local gap = false
      for _, d in ipairs({ {1,0}, {-1,0}, {0,1}, {0,-1} }) do
        local nx, ny = x + d[1], y + d[2]
        if nx >= 0 and ny >= 0 and nx < w and ny < h then
          local n = owner[ny * w + nx]
          if n > o and not shapes[n].hole and not shapes[n].merge then gap = true end
        end
      end
      if not gap then img:drawPixel(x, y, shapes[o].color or color) end
    end
  end end
end

-- Baba Is You-style boil: after drawing, nibble and sprout single pixels along the silhouette edge,
-- so every frame looks freshly redrawn rather than shifted.
local function wobble(img, w, h)
  local function filled(x, y) return x >= 0 and y >= 0 and x < w and y < h and app.pixelColor.rgbaA(img:getPixel(x, y)) > 0 end
  -- Only the outer edge wobbles; eye cuts and contour gaps stay crisp. "outside" = empty pixels
  -- reachable from the border.
  local outside = {}
  local stack = {}
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
    local n = 0
    local col
    for _, d in ipairs({ {1,0}, {-1,0}, {0,1}, {0,-1} }) do
      if filled(x + d[1], y + d[2]) then n = n + 1; col = img:getPixel(x + d[1], y + d[2]) end
    end
    if filled(x, y) then
      local touchesOutside = out(x + 1, y) or out(x - 1, y) or out(x, y + 1) or out(x, y - 1)
      local onlyOutside = true
      for _, d in ipairs({ {1,0}, {-1,0}, {0,1}, {0,-1} }) do
        local nx, ny = x + d[1], y + d[2]
        if not filled(nx, ny) and not out(nx, ny) then onlyOutside = false end
      end
      if touchesOutside and onlyOutside and n <= 2 and rnd() < 0.3 then nib[#nib + 1] = { x, y } end
    elseif outside[y * w + x] and n >= 2 and rnd() < 0.25 then
      sprout[#sprout + 1] = { x, y, col }
    end
  end end
  for _, p in ipairs(nib) do img:drawPixel(p[1], p[2], 0) end
  for _, p in ipairs(sprout) do img:drawPixel(p[1], p[2], p[3]) end
end

local function make(name, w, h, frames, color, build)
  local spr = Sprite(w, h, ColorMode.RGB)
  for f = 1, frames - 1 do spr:newEmptyFrame() end
  for f = 1, frames do
    seed = f * 7919 + #name
    local img = Image(w, h, ColorMode.RGB)
    render(img, w, h, build(f), color)
    if w >= 12 then wobble(img, w, h) end
    spr:newCel(spr.layers[1], f, img, Point(0, 0))
  end
  for _, fr in ipairs(spr.frames) do fr.duration = 0.125 end -- ~8 fps boil
  spr:saveAs("art/" .. name .. ".aseprite")
  app.command.ExportSpriteSheet { ui = false, type = SpriteSheetType.HORIZONTAL, textureFilename = "assets/" .. name .. "@" .. w .. "x" .. h .. ".png" }
  spr:close()
end

-- buff: a soft lime block hugging itself, with gap-cut eyes and a little arm across its front.
make("buff", 16, 16, 3, C.buff, function()
  return {
    { kind = "rrect", x = 1.5 + j(0.6), y = 2 + j(0.6), w = 13 + j(0.6), h = 13 + j(0.5), r = 4 + j(1.0) },
    { kind = "rrect", x = 4 + j(0.8), y = 10.2 + j(0.6), w = 9 + j(0.8), h = 3.2, r = 1.6 }, -- arm
    { kind = "rrect", x = 4.6 + j(0.5), y = 5 + j(0.5), w = 2, h = 3.2, r = 1, hole = true },
    { kind = "rrect", x = 9.4 + j(0.5), y = 5 + j(0.5), w = 2, h = 3.2, r = 1, hole = true },
  }
end)

-- blob: a rose petal-cluster of three locked circles, two eye cuts on the front one.
make("blob", 12, 12, 3, C.rose, function()
  return {
    { kind = "circle", x = 3.6 + j(0.6), y = 4 + j(0.6), r = 3.2 + j(0.5) },
    { kind = "circle", x = 8.4 + j(0.6), y = 4 + j(0.6), r = 3.2 + j(0.5) },
    { kind = "circle", x = 6 + j(0.5), y = 7.4 + j(0.6), r = 4.2 + j(0.5) },
    { kind = "rrect", x = 3.8 + j(0.5), y = 6.4, w = 1.6, h = 2.2, r = 0.8, hole = true },
    { kind = "rrect", x = 6.8 + j(0.5), y = 6.4, w = 1.6, h = 2.2, r = 0.8, hole = true },
  }
end)

-- gem (XP): a small lime pebble split by one gap.
make("gem", 6, 6, 3, C.buff, function()
  return {
    { kind = "circle", x = 2.4 + j(0.5), y = 3 + j(0.5), r = 2.2 + j(0.3) },
    { kind = "circle", x = 3.8 + j(0.5), y = 3 + j(0.5), r = 2 + j(0.3) },
  }
end)

-- shot: a pale seed.
make("shot", 5, 5, 3, C.shot, function()
  return { { kind = "circle", x = 2.5 + j(0.5), y = 2.5 + j(0.5), r = 2 + j(0.5) } }
end)
