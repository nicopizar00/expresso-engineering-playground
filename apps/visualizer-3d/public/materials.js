import * as THREE from "three";
import { clamp } from "./utils.js";

// PS1 colour palette — extracted from the design spec reference image.
// All domain-object colours should draw from here.
// << EXTEND: add accent, highlight, or seasonal tones as the catalogue grows.
export const ESPRESSO_PALETTE = {
  lightBeige: 0xF1ECDA,  // brightest surface / top faces
  midBeige:   0xCBBE9A,  // default cup/saucer body colour
  darkBeige:  0xA29272,  // shadow / underside faces
  coffee:     0x5B3A1E,  // espresso fill colour
  shadow:     0x2E251C,  // deepest shadow
};

// Inventory-status → mesh colour. Items that carry metadata.color bypass this.
// << EXTEND: add "featured", "new", "lowStock" etc. as the UI evolves.
export const STATUS_COLORS = {
  ok:   0x4caf50,
  warn: 0xf2a200,
  error: 0xd64545,
  idle: 0x9aa0a6,
};

// Pull RGB channels toward grey by `mix` ∈ [0,1]. mix=0 → original, mix=1 → grey.
// Used to recede history items so the hero keeps the visual weight.
export function desaturateHex(hex, mix) {
  const r    = (hex >> 16) & 255;
  const g    = (hex >>  8) & 255;
  const b    =  hex        & 255;
  const grey = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
  const nr   = (r * (1 - mix) + grey * mix) | 0;
  const ng   = (g * (1 - mix) + grey * mix) | 0;
  const nb   = (b * (1 - mix) + grey * mix) | 0;
  return (nr << 16) | (ng << 8) | nb;
}

// =============================================================================
// PS1 pixel texture factory
//
// Paints a tiny canvas (default 16×16) with the base colour and scatters
// dither-noise pixels at ~35 % density.
// NearestFilter + no mipmaps = zero interpolation → sharp visible blocks.
//
// Each call returns a NEW CanvasTexture so callers can share or dispose
// independently. The canvas element is GC'd once all references drop.
//
// << EXTEND: pass a patternFn(ctx, r, g, b, size) to stamp different surface
//    treatments (wood grain, metal scratches, label text) without changing
//    the filter setup.
// =============================================================================
export function makePsxTexture(hexColor, size = 16) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const r = (hexColor >> 16) & 255;
  const g = (hexColor >>  8) & 255;
  const b =  hexColor        & 255;

  // Solid base fill
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, size, size);

  // Dither noise — scatters ~35 % of pixels with ±20 brightness jitter.
  // This recreates the quantisation noise visible on PS1 VRAM textures.
  const count = (size * size * 0.35) | 0;
  for (let i = 0; i < count; i++) {
    const v = ((Math.random() * 40 - 20) | 0);
    ctx.fillStyle = `rgb(${clamp(r+v,0,255)},${clamp(g+v,0,255)},${clamp(b+v,0,255)})`;
    ctx.fillRect((Math.random() * size) | 0, (Math.random() * size) | 0, 1, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter       = THREE.NearestFilter;  // no interpolation → pixel blocks
  tex.minFilter       = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
