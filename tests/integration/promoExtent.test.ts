import test from "node:test";
import assert from "node:assert/strict";
import { extentOf, holdPivot, imageMask, layer, layerFrame, layerPivot, layerRect, type PromoLayer } from "../../src/viewer/promo";

// A shot's slot of 700 x 1064, taken with the board's margin (0.4 across, 0.12 up and down) round it: its frame.
const W = 700, H = 1064, MX = 0.4, MY = 0.12;
const FW = W * (1 + 2 * MX), FH = H * (1 + 2 * MY);
const canvas = (w: number, h: number) => ({ width: w, height: h }) as unknown as HTMLCanvasElement;
/** An image of the slot's pixels from (L, T) to (R, B), from the slot's top left, as promoShot pictures it. */
function shot(L: number, T: number, R: number, B: number): HTMLCanvasElement {
  const c = canvas(R - L, B - T);
  extentOf.set(c, { x0: (L + MX * W) / FW, y0: (T + MY * H) / FH, x1: (R + MX * W) / FW, y1: (B + MY * H) / FH });
  return c;
}
const frameOnly = () => shot(Math.floor(-MX * W), Math.floor(-MY * H), Math.ceil(W * (1 + MX)), Math.ceil(H * (1 + MY)));
// the same shot, its image grown to the left and down (a weapon turned that way)
const grown = () => shot(-900, Math.floor(-MY * H), Math.ceil(W * (1 + MX)), 1600);
const placed = (image: HTMLCanvasElement): PromoLayer => ({ ...layer("RED", image, 10 - W * MX, 8 - H * MY, FW, FH), scale: 1.37, dx: 41, dy: -17, rotation: 12 });
/** Where a pixel of the slot (from its top left) is drawn on the picture. */
const at = (l: PromoLayer, image: HTMLCanvasElement, sx: number, sy: number, L: number, T: number) => {
  const r = layerRect(l);
  return [r.x + ((sx - L) / image.width) * r.w, r.y + ((sy - T) / image.height) * r.h];
};

test("a shot whose image grows past its frame stays where it was on the picture, at the same size", () => {
  const a = frameOnly(), b = grown();
  const la = placed(a), lb = placed(b);
  for (const [k, v] of Object.entries(layerFrame(la))) assert.ok(Math.abs(v - layerFrame(lb)[k as keyof ReturnType<typeof layerFrame>]) < 1e-9, k);
  for (const [sx, sy] of [[0, 0], [350, 532], [700, 1064], [-120, 900]]) {
    const pa = at(la, a, sx, sy, Math.floor(-MX * W), Math.floor(-MY * H)), pb = at(lb, b, sx, sy, -900, Math.floor(-MY * H));
    assert.ok(Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 1e-6, `slot pixel ${sx}, ${sy}`);
  }
});

test("a turned shot turns about the same point of its frame whatever its image takes in", () => {
  const a = frameOnly(), b = grown();
  const la = placed(a), lb = placed(b);
  la.opaque = { x0: 300, y0: 150, x1: 900, y1: 1300 };
  holdPivot(la);
  lb.pivot = la.pivot;
  const pa = layerPivot(la), pb = layerPivot(lb);
  assert.ok(Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 1e-9);
});

test("a mask stays on the same part of the character as the image grows", () => {
  const a = frameOnly(), b = grown();
  const mask = { on: true, kind: "linear" as const, a: [0.5, 0.55] as [number, number], b: [0.5, 0.92] as [number, number], ratio: 1, mid: 0.5, hardness: 0, invert: false, keep: [] };
  const la = { ...placed(a), mask }, lb = { ...placed(b), mask };
  // the mask's start, in each image's pixels, as the slot's pixel it falls on
  const slotPixel = (l: PromoLayer, image: HTMLCanvasElement, L: number, T: number) => {
    const m = imageMask(l)!;
    return [m.a[0] * image.width + L, m.a[1] * image.height + T];
  };
  const pa = slotPixel(la, a, Math.floor(-MX * W), Math.floor(-MY * H)), pb = slotPixel(lb, b, -900, Math.floor(-MY * H));
  assert.ok(Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 1e-6);
});

test("a layer without an extent is placed as before (fitted in its box)", () => {
  const img = canvas(400, 200);
  const l = { ...layer("Text", img, 100, 50, 800, 800), scale: 2 };
  const r = layerRect(l), f = layerFrame(l);
  assert.deepEqual([r.x, r.y, r.w, r.h], [f.x, f.y, f.w, f.h]);
  assert.equal(r.w, 1600);
  assert.equal(r.h, 800);
});
