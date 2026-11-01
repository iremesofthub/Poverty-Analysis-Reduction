import React, { useRef, useState } from "react";
import { useSize } from "@/hooks/use-size";
import { QUADRANTS, hasInterval, isDistinguishableFromNational } from "@/lib/povertySupport";
import { contrastVerdict } from "@/lib/districtUncertainty";
import { COLORS, DistrictFacts, Legend, Swatch } from "./shared";

const SOURCE = "NISR EICV7, 2023/24";
const niceCeil = (value, step) => Math.ceil(value / step) * step;

// Screen-reader phrase for the design-based interval, or an explicit statement
// that none exists. Never a blank, which a listener could misread as "no spread".
const intervalPhrase = (row) => (hasInterval(row.povertyInterval)
  ? ` (95 percent interval ${row.povertyInterval.low.toFixed(1)} to ${row.povertyInterval.high.toFixed(1)})`
  : ", interval not available");

export default function PriorityScatter({ rows, national, selectedName, onSelect }) {
  const box = useRef(null);
  const size = useSize(box);
  const refs = useRef({});
  const [hoverName, setHoverName] = useState(null);
  const [tabStop, setTabStop] = useState(0);

  const W = Math.max(280, size?.width || 640);
  const H = W < 480 ? 330 : W < 720 ? 390 : 430;
  const m = { l: 40, r: 14, t: 16, b: 40 };
  const xMax = Math.max(30, niceCeil(Math.max(...rows.map((row) => row.vupAmongPoor), national.vupAmongPoor) * 1.08, 5));
  const yMax = Math.max(30, niceCeil(Math.max(...rows.map((row) => row.poverty), national.poverty) * 1.06, 10));
  const sx = (value) => m.l + (value / xMax) * (W - m.l - m.r);
  const sy = (value) => H - m.b - (value / yMax) * (H - m.t - m.b);
  const rx = sx(national.vupAmongPoor);
  const ry = sy(national.poverty);
  const xTicks = Array.from({ length: xMax / 5 + 1 }, (_, i) => i * 5).filter((tick) => W >= 480 || tick % 10 === 0);
  const yTicks = Array.from({ length: yMax / 10 + 1 }, (_, i) => i * 10);

  const ordered = [...rows].sort((a, b) => b.poverty - a.poverty || a.name.localeCompare(b.name));
  const reviewFirst = ordered.filter((row) => row.quadrant.key === "reviewFirst");
  const clearlyAbove = reviewFirst.filter((row) => isDistinguishableFromNational(row)).length;
  const labelled = new Set([...(reviewFirst.length <= 8 ? reviewFirst.map((row) => row.name) : []), selectedName, hoverName].filter(Boolean));
  const shown = rows.find((row) => row.name === hoverName);

  const moveFocus = (index) => {
    const next = (index + ordered.length) % ordered.length;
    setTabStop(next);
    refs.current[ordered[next].name]?.focus();
  };
  const onKeyDown = (event, index, row) => {
    const keys = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: ordered.length - 1 };
    if (event.key in keys) { event.preventDefault(); moveFocus(keys[event.key]); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(selectedName === row.name ? null : row.name); }
    else if (event.key === "Escape") { setHoverName(null); }
  };

  const tipLeft = shown ? Math.min(Math.max(4, sx(shown.vupAmongPoor) + 12), W - 244) : 0;
  const tipBelow = shown ? sy(shown.poverty) < H / 2 : false;

  return (
    <div>
      <Legend>
        <Swatch color={COLORS.poverty}>District (50+ poor households sampled)</Swatch>
        <Swatch color={COLORS.poverty} hollow>Small sample (under 50): read with care</Swatch>
        <Swatch color={COLORS.national} line>National reference</Swatch>
      </Legend>
      <div ref={box} className="relative mt-2 w-full">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Scatter plot of ${rows.length} districts. Horizontal axis: VUP participation among poor households. Vertical axis: poverty rate. Use the arrow keys to move between districts and Enter to select one.`} className="block max-w-full select-none">
          <rect x={m.l} y={m.t} width={Math.max(0, rx - m.l)} height={Math.max(0, ry - m.t)} fill={COLORS.poverty} opacity="0.07" />
          {yTicks.map((tick) => <g key={`y${tick}`}><line x1={m.l} x2={W - m.r} y1={sy(tick)} y2={sy(tick)} stroke="#EDF1F7" /><text x={m.l - 6} y={sy(tick) + 3} textAnchor="end" fontSize="10" fill="#8A94A6">{tick}%</text></g>)}
          {xTicks.map((tick) => <g key={`x${tick}`}><line y1={m.t} y2={H - m.b} x1={sx(tick)} x2={sx(tick)} stroke="#EDF1F7" /><text x={sx(tick)} y={H - m.b + 14} textAnchor="middle" fontSize="10" fill="#8A94A6">{tick}%</text></g>)}
          <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fill="#697386">VUP participation among poor households →</text>
          <text transform={`translate(11 ${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize="10.5" fill="#697386">Poverty rate (% of people) →</text>

          <line x1={rx} x2={rx} y1={m.t} y2={H - m.b} stroke={COLORS.national} strokeDasharray="4 3" strokeWidth="1.2" />
          <line x1={m.l} x2={W - m.r} y1={ry} y2={ry} stroke={COLORS.national} strokeDasharray="4 3" strokeWidth="1.2" />
          <text x={rx + 4} y={m.t + 10} fontSize="9.5" fill={COLORS.national}>National VUP {national.vupAmongPoor.toFixed(1)}%</text>
          <text x={W - m.r - 2} y={ry - 4} textAnchor="end" fontSize="9.5" fill={COLORS.national}>National poverty {national.poverty.toFixed(1)}%</text>

          <text x={m.l + 6} y={m.t + 22} fontSize="10.5" fontWeight="600" fill={COLORS.poverty}>{QUADRANTS.reviewFirst.label}</text>
          {W >= 480 && <>
            <text x={m.l + 6} y={m.t + 34} fontSize="9" fill="#697386">{QUADRANTS.reviewFirst.detail}</text>
            <text x={W - m.r - 4} y={m.t + 22} textAnchor="end" fontSize="9" fill="#697386">{QUADRANTS.higherBoth.detail}</text>
            <text x={m.l + 6} y={H - m.b - 6} fontSize="9" fill="#697386">{QUADRANTS.lowerPovertyLowVup.detail}</text>
            <text x={W - m.r - 4} y={H - m.b - 6} textAnchor="end" fontSize="9" fill="#697386">{QUADRANTS.lowerPovertyHighVup.detail}</text>
          </>}

          {ordered.map((row, index) => {
            const x = sx(row.vupAmongPoor);
            const y = sy(row.poverty);
            const small = row.quality.key === "small";
            const selected = selectedName === row.name;
            return (
              <g key={row.name} ref={(node) => { refs.current[row.name] = node; }} tabIndex={index === tabStop ? 0 : -1} role="button" aria-pressed={selected}
                aria-label={`${row.name}: poverty ${row.poverty.toFixed(1)} percent${intervalPhrase(row)}, VUP participation ${row.vupAmongPoor.toFixed(1)} percent. ${row.quadrant.detail}.${small ? " Small sample." : ""} ${contrastVerdict(row.povertyContrast).label}. Press Enter to select.`}
                className="cursor-pointer outline-none [&:focus-visible>circle.ring]:stroke-[#0A2540]"
                onPointerEnter={(event) => { if (event.pointerType === "mouse") setHoverName(row.name); }}
                onPointerLeave={(event) => { if (event.pointerType === "mouse") setHoverName(null); }}
                onFocus={() => { setHoverName(row.name); setTabStop(index); }} onBlur={() => setHoverName(null)}
                onKeyDown={(event) => onKeyDown(event, index, row)}
                onClick={() => { onSelect(selected ? null : row.name); setHoverName(row.name); }}>
                <circle className="ring" cx={x} cy={y} r={selected ? 9 : 7.5} fill="none" stroke={selected ? COLORS.national : "transparent"} strokeWidth="2.2" />
                <circle cx={x} cy={y} r="14" fill="transparent" />
                <circle cx={x} cy={y} r="5.5" fill={small ? "#fff" : COLORS.poverty} fillOpacity={row.quadrant.key === "reviewFirst" || selected ? 1 : 0.62}
                  stroke={COLORS.poverty} strokeWidth="1.6" strokeDasharray={small ? "2.2 1.6" : undefined} />
                {labelled.has(row.name) && <text x={x + 9} y={y + 3.5} fontSize="10" fontWeight="600" fill={COLORS.national} paintOrder="stroke" stroke="#fff" strokeWidth="3">{row.name}</text>}
              </g>
            );
          })}
          {shown && hasInterval(shown.povertyInterval) && (
            // The hovered district's design-based 95% interval, drawn on the poverty
            // axis only. It is not a joint confidence region for the two measures.
            <g pointerEvents="none" aria-hidden="true">
              <line x1={sx(shown.vupAmongPoor)} x2={sx(shown.vupAmongPoor)} y1={sy(shown.povertyInterval.low)} y2={sy(shown.povertyInterval.high)} stroke={COLORS.national} strokeWidth="1.4" opacity="0.55" />
              <line x1={sx(shown.vupAmongPoor) - 5} x2={sx(shown.vupAmongPoor) + 5} y1={sy(shown.povertyInterval.low)} y2={sy(shown.povertyInterval.low)} stroke={COLORS.national} strokeWidth="1.4" opacity="0.55" />
              <line x1={sx(shown.vupAmongPoor) - 5} x2={sx(shown.vupAmongPoor) + 5} y1={sy(shown.povertyInterval.high)} y2={sy(shown.povertyInterval.high)} stroke={COLORS.national} strokeWidth="1.4" opacity="0.55" />
            </g>
          )}
        </svg>
        {shown && (
          <div role="tooltip" className="pointer-events-none absolute z-20 w-60 rounded-lg border border-hairline bg-white p-2.5 shadow-[0_8px_24px_rgba(10,37,64,0.14)]"
            style={{ left: tipLeft, top: tipBelow ? sy(shown.poverty) + 14 : undefined, bottom: tipBelow ? undefined : H - sy(shown.poverty) + 14 }}>
            <DistrictFacts row={shown} national={national} source={SOURCE} />
            <p className="mt-1 text-[10.5px] font-medium text-brand">{shown.quadrant.detail}</p>
            <p className="mt-1 text-[10.5px] leading-snug text-sub">{contrastVerdict(shown.povertyContrast).label}: {contrastVerdict(shown.povertyContrast).detail}</p>
          </div>
        )}
      </div>
      <p className="mt-1 text-[10.5px] leading-relaxed text-[#8A94A6]">
        The lines show Rwanda-wide values. Hovering a district draws its design-based 95% interval for poverty; a district whose joint contrast against Rwanda includes zero may not truly differ from the national rate. {reviewFirst.length} of {rows.length} districts are in the shaded “review first” area, of which {clearlyAbove} have a poverty difference from Rwanda larger than sampling uncertainty.
      </p>
    </div>
  );
}
