// Pixel geometry for the 95% interval whisker drawn over a horizontal bar
// (UPG-01). Kept separate from the chart so the arithmetic is testable on its
// own and the component stays readable.
//
// A vertical-layout bar in Recharts starts at the axis origin (our domain always
// starts at 0) and extends `barWidth` pixels for `value` units, so pixels-per-
// unit is `barWidth / value`. That makes the bound positions exact for a linear
// axis, without needing the chart's internal scale.

// Returns null whenever a whisker would be a lie or a guess: no interval, a
// non-positive bar length, or non-finite bounds. The chart then draws the plain
// bar and the legend says the interval is unavailable.
export function whiskerGeometry({ barX = 0, barY = 0, barWidth = 0, value, interval, thickness = 11 }) {
  if (!interval) return null;
  const { low, high } = interval;
  if (!Number.isFinite(value) || value <= 0) return null;
  if (!Number.isFinite(barWidth) || barWidth <= 0) return null;
  if (!Number.isFinite(low) || !Number.isFinite(high) || low > high) return null;

  const pixelsPerUnit = barWidth / value;
  const centre = barX + barWidth;
  const left = barX + low * pixelsPerUnit;
  const right = barX + high * pixelsPerUnit;
  const midY = barY + thickness / 2;
  const capHalf = Math.min(thickness / 2, 5);

  return {
    axisLine: { x1: left, y1: midY, x2: right, y2: midY },
    lowCap: { x1: left, y1: midY - capHalf, x2: left, y2: midY + capHalf },
    highCap: { x1: right, y1: midY - capHalf, x2: right, y2: midY + capHalf },
    pointMark: { cx: centre, cy: midY },
    width: Math.max(0, right - left),
    left,
    right,
  };
}

// Accessible text for the same interval, so a screen reader and the printed
// report get the identical figure rather than a second calculation.
export function intervalText(label, interval, unit = "%") {
  if (!interval || !Number.isFinite(interval.low) || !Number.isFinite(interval.high)) {
    return `${label}: confidence interval not available`;
  }
  return `${label}: ${interval.low.toFixed(1)}${unit} to ${interval.high.toFixed(1)}${unit} (95% interval)`;
}
