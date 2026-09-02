/**
 * dominantColor.js  (v2 — spatial sampling)
 *
 * Instead of one global dominant colour, we sample six named zones of the
 * background image and derive per-zone surface + text colours so every UI
 * region actually blends with the wallpaper behind it.
 *
 * Zones
 * ─────
 *   topLeft      → header / clock / greeting / bookmarks
 *   topRight     → search-bookmarks input + settings btn
 *   middleLeft   → left bookmark column
 *   middleCenter → centre content / clock area
 *   middleRight  → right side
 *   bottomCenter → web-search bar
 *
 * Public API
 * ──────────
 *   applyDominantColorTheme(blobOrUrl) → Promise<void>
 *   clearDominantColorTheme()          → void
 */

// ─── Zone definitions ─────────────────────────────────────────────────────────
// Each zone is { x, y, w, h } as 0-1 fractions of the image dimensions.

const ZONES = {
  topLeft:      { x: 0.00, y: 0.00, w: 0.35, h: 0.40 },
  topRight:     { x: 0.65, y: 0.00, w: 0.35, h: 0.40 },
  middleLeft:   { x: 0.00, y: 0.30, w: 0.35, h: 0.40 },
  middleCenter: { x: 0.30, y: 0.25, w: 0.40, h: 0.50 },
  middleRight:  { x: 0.65, y: 0.30, w: 0.35, h: 0.40 },
  bottomCenter: { x: 0.20, y: 0.65, w: 0.60, h: 0.35 },
};

/** Canvas size for the full downsample pass. */
const SAMPLE_W = 100;
const SAMPLE_H = 60;

/** Colour quantisation buckets per channel. */
const BUCKETS = 10;

// ─── Image loading ────────────────────────────────────────────────────────────

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error("dominantColor: image load failed"));
    img.src = source instanceof Blob ? URL.createObjectURL(source) : source;
  });
}

// ─── Canvas sampling ─────────────────────────────────────────────────────────

function buildSampleCanvas(img) {
  const canvas = document.createElement("canvas");
  canvas.width  = SAMPLE_W;
  canvas.height = SAMPLE_H;
  canvas.getContext("2d").drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
  return canvas;
}

function getZonePixels(canvas, zone) {
  const x = Math.floor(zone.x * SAMPLE_W);
  const y = Math.floor(zone.y * SAMPLE_H);
  const w = Math.max(1, Math.floor(zone.w * SAMPLE_W));
  const h = Math.max(1, Math.floor(zone.h * SAMPLE_H));
  return canvas.getContext("2d").getImageData(x, y, w, h).data;
}

// ─── Dominant colour extraction ───────────────────────────────────────────────

const quantise = (v) => Math.floor(v / (256 / BUCKETS));

function dominantRGB(pixels) {
  const freq = {};

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const key = `${quantise(pixels[i])},${quantise(pixels[i+1])},${quantise(pixels[i+2])}`;
    freq[key] = (freq[key] ?? 0) + 1;
  }

  if (!Object.keys(freq).length) return [128, 128, 128];

  const winner = Object.keys(freq).reduce((a, b) => freq[a] >= freq[b] ? a : b);
  const mid = 256 / BUCKETS / 2;
  return winner.split(",").map((v) => Math.round(+v * (256 / BUCKETS) + mid));
}

// ─── Colour math ──────────────────────────────────────────────────────────────

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6;               break;
      case b: h = ((r - g) / d + 4) / 6;               break;
    }
  }
  return [Math.round(h * 360), s, l];
}

function perceivedLuminance(r, g, b) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const clamp    = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hslStr   = (h, s, l)   => `hsl(${h}, ${(s * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%)`;
const hslaStr  = (h, s, l, a) => `hsla(${h}, ${(s * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%, ${a})`;

// ─── Per-zone colour derivation ───────────────────────────────────────────────

/**
 * Given the dominant colour of a zone, produce surface + text colours.
 *
 * Surface: matched hue, low saturation, semi-transparent — blends with wallpaper.
 * Text:    high contrast against that zone's brightness — never gets lost.
 */
function deriveZoneColors(r, g, b) {
  const [h, s, rawL] = rgbToHsl(r, g, b);
  const lum    = perceivedLuminance(r, g, b);
  const isDark = lum < 0.30;

  // Surface keeps the zone hue but is mostly desaturated
  const surfS = clamp(s * 0.30, 0, 0.30);

  // Anchor surface lightness to the zone's own lightness so it truly blends
  const surfL = isDark
    ? clamp(rawL + 0.05, 0.08, 0.30)
    : clamp(rawL - 0.05, 0.72, 0.94);

  const alphaBase  = isDark ? 0.42 : 0.48;
  const alphaHover = isDark ? 0.62 : 0.68;
  const alphaStrong = isDark ? 0.78 : 0.82;

  // Text: push far from the zone lightness for contrast
  // Use a bit of the zone's hue so it doesn't look foreign
  const textS    = clamp(s * 0.15, 0, 0.15);
  const textL    = isDark ? 0.93 : 0.08;
  const subtextL = isDark ? 0.74 : 0.28;

  return {
    surface:       hslaStr(h, surfS, surfL, alphaBase),
    surfaceHover:  hslaStr(h, surfS, surfL, alphaHover),
    surfaceStrong: hslaStr(h, surfS, surfL, alphaStrong),
    text:          hslStr(h, textS, textL),
    subtext:       hslStr(h, textS * 0.7, subtextL),
    isDark,
    h,
    rawS: s,
    rawL,
  };
}

// ─── Global accent derivation ─────────────────────────────────────────────────

function deriveAccents(zoneRGBs) {
  let bestS = -1, bestH = 0, bestLum = 0;

  for (const [r, g, b] of Object.values(zoneRGBs)) {
    const [h, s] = rgbToHsl(r, g, b);
    if (s > bestS) {
      bestS   = s;
      bestH   = h;
      bestLum = perceivedLuminance(r, g, b);
    }
  }

  const accentS = clamp(bestS * 0.75 + 0.20, 0.40, 0.90);
  const isDark  = bestLum < 0.30;

  return {
    mauve: hslStr(bestH, accentS, isDark ? 0.72 : 0.40),
    blue:  hslStr((bestH + 25) % 360, accentS, isDark ? 0.65 : 0.35),
  };
}

// ─── CSS property mapping ─────────────────────────────────────────────────────

function buildCSSProps(zoneColors, zoneRGBs, accents) {
  const props = {};

  // ── Per-zone vars — opt-in for future components ──────────────────────────
  for (const [name, c] of Object.entries(zoneColors)) {
    props[`--zone-${name}-surface`]        = c.surface;
    props[`--zone-${name}-surface-hover`]  = c.surfaceHover;
    props[`--zone-${name}-surface-strong`] = c.surfaceStrong;
    props[`--zone-${name}-text`]           = c.text;
    props[`--zone-${name}-subtext`]        = c.subtext;
  }

  // ── Global surface vars — topLeft drives most chrome ─────────────────────
  const tl = zoneColors.topLeft;
  props["--surface0"] = tl.surface;
  props["--surface1"] = tl.surfaceHover;
  props["--surface2"] = tl.surfaceStrong;

  // ── Text — topLeft (clock, greeting, bookmarks) ───────────────────────────
  props["--text"]     = tl.text;
  props["--subtext1"] = tl.subtext;

  const [th] = rgbToHsl(...zoneRGBs.topLeft);
  const tlTextS = clamp(tl.rawS * 0.08, 0, 0.08);
  props["--subtext0"] = hslStr(th, tlTextS, tl.isDark ? 0.62 : 0.44);
  props["--overlay2"] = hslStr(th, tlTextS * 0.6, tl.isDark ? 0.52 : 0.52);

  // ── Base / Mantle / Crust — for modal backgrounds, scrollbars ────────────
  const [bh, bs] = rgbToHsl(...zoneRGBs.middleCenter);
  const isDarkGlobal = perceivedLuminance(...zoneRGBs.middleCenter) < 0.30;
  const baseS = clamp(bs * 0.18, 0, 0.18);

  props["--base"]   = hslStr(bh, baseS, isDarkGlobal ? 0.13 : 0.93);
  props["--mantle"] = hslStr(bh, baseS, isDarkGlobal ? 0.10 : 0.89);
  props["--crust"]  = hslStr(bh, baseS, isDarkGlobal ? 0.07 : 0.85);

  // ── Accents ───────────────────────────────────────────────────────────────
  props["--mauve"] = accents.mauve;
  props["--blue"]  = accents.blue;

  return props;
}

// ─── DOM injection ────────────────────────────────────────────────────────────

const OWNED_GLOBALS = [
  "--base", "--mantle", "--crust",
  "--text", "--subtext0", "--subtext1", "--overlay2",
  "--surface0", "--surface1", "--surface2",
  "--mauve", "--blue",
];

function injectProps(props) {
  const el = document.body;
  for (const [prop, value] of Object.entries(props)) {
    el.style.setProperty(prop, value);
  }
  el.dataset.dominantColor = "active";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function applyDominantColorTheme(source) {
  if (!source) return;

  try {
    const img    = await loadImage(source);
    const canvas = buildSampleCanvas(img);

    const zoneRGBs = {};
    for (const [name, zone] of Object.entries(ZONES)) {
      zoneRGBs[name] = dominantRGB(getZonePixels(canvas, zone));
    }

    const zoneColors = {};
    for (const [name, rgb] of Object.entries(zoneRGBs)) {
      zoneColors[name] = deriveZoneColors(...rgb);
    }

    const accents = deriveAccents(zoneRGBs);
    const props   = buildCSSProps(zoneColors, zoneRGBs, accents);

    injectProps(props);
  } catch (err) {
    console.warn("dominantColor: falling back to Catppuccin.", err);
  }
}

export function clearDominantColorTheme() {
  const el = document.body;

  for (const prop of OWNED_GLOBALS) {
    el.style.removeProperty(prop);
  }

  // Remove all --zone-* vars
  const toRemove = [];
  for (const prop of el.style) {
    if (prop.startsWith("--zone-")) toRemove.push(prop);
  }
  toRemove.forEach((p) => el.style.removeProperty(p));

  delete el.dataset.dominantColor;
}
