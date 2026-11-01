import test from "node:test";
import assert from "node:assert/strict";
import { intervalText, whiskerGeometry } from "./intervalWhisker.js";

// A bar 0 -> 40% occupies 200 px, so one point is 5 px.
const base = { barX: 10, barY: 4, barWidth: 200, value: 40, thickness: 11 };

test("the whisker spans exactly the reported interval in pixels", () => {
  const shape = whiskerGeometry({ ...base, interval: { low: 30, high: 50 } });
  assert.equal(shape.left, 10 + 30 * 5); // 160
  assert.equal(shape.right, 10 + 50 * 5); // 260
  assert.equal(shape.pointMark.cx, 210);
  assert.equal(shape.axisLine.x1, shape.left);
  assert.equal(shape.axisLine.x2, shape.right);
  assert.equal(shape.axisLine.y1, 4 + 11 / 2);
  assert.equal(shape.lowCap.x1, shape.left);
  assert.equal(shape.highCap.x1, shape.right);
  assert.equal(shape.width, 100);
});

test("an interval wider than the bar is drawn in full, not clipped to the bar", () => {
  const shape = whiskerGeometry({ ...base, interval: { low: 20, high: 55 } });
  assert.ok(shape.left < 10 + base.barWidth, "low bound sits left of the bar end");
  assert.ok(shape.right > 10 + base.barWidth, "high bound sits right of the bar end");
});

test("no whisker is drawn when there is no interval or no real bar", () => {
  assert.equal(whiskerGeometry({ ...base, interval: null }), null);
  assert.equal(whiskerGeometry({ ...base, interval: { low: 10 } }), null);
  assert.equal(whiskerGeometry({ ...base, interval: { low: 50, high: 30 } }), null);
  assert.equal(whiskerGeometry({ ...base, value: 0, interval: { low: 0, high: 5 } }), null);
  assert.equal(whiskerGeometry({ ...base, barWidth: 0, interval: { low: 1, high: 5 } }), null);
  assert.equal(whiskerGeometry({ ...base, value: Number.NaN, interval: { low: 1, high: 5 } }), null);
  assert.equal(whiskerGeometry({ ...base, interval: { low: Number.NaN, high: 20 } }), null);
});

test("the zero-width cap never grows past the bar thickness", () => {
  const thin = whiskerGeometry({ ...base, thickness: 4, interval: { low: 30, high: 50 } });
  assert.ok(thin.lowCap.y2 - thin.lowCap.y1 <= 4, "caps stay inside the bar");
});

test("screen-reader text states the interval or says it is unavailable", () => {
  assert.equal(intervalText("Poverty", { low: 18.5, high: 28.8 }), "Poverty: 18.5% to 28.8% (95% interval)");
  assert.equal(intervalText("Poverty", null), "Poverty: confidence interval not available");
  assert.equal(intervalText("Poverty", { low: 1, high: Number.NaN }), "Poverty: confidence interval not available");
});
