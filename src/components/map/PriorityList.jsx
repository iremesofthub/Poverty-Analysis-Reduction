import React, { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import Card from "@/components/analyst/Card";
import { Pill } from "@/components/analyst/support/shared";
import { enrichRows } from "@/lib/povertySupport";
import { describeValue, MAP_LAYERS } from "@/lib/mapLayers";

export default function PriorityList({ rows, national, layer, selected, onSelect }) {
  const [mode, setMode] = useState("review");
  const config = MAP_LAYERS[layer];
  const data = useMemo(() => enrichRows(rows, national), [rows, national]);
  const list = useMemo(() => {
    const base = mode === "review" ? data.filter((row) => row.marker.key === "twoSignals") : data;
    const key = layer === "vup" ? (row) => row.vupAmongPoor : layer === "extreme" ? (row) => row.extremePoverty : (row) => row.poverty;
    return [...base].sort((a, b) => key(b) - key(a) || a.name.localeCompare(b.name));
  }, [data, mode, layer]);

  return (
    <Card title="Districts" subtitle={mode === "review" ? "Poverty above and VUP below the national rate, with a poverty difference from Rwanda larger than sampling uncertainty" : `All districts, highest ${layer === "vup" ? "VUP participation" : config.label.toLowerCase()} first`} bodyClassName="px-0 pb-0">
      <div className="px-5 pb-2" role="group" aria-label="List filter">
        <div className="inline-flex rounded-md bg-[#F1F4F9] p-0.5">
          {[["review", "Review first"], ["all", "All districts"]].map(([key, label]) => (
            <button key={key} type="button" aria-pressed={mode === key} onClick={() => setMode(key)}
              className={`rounded px-2.5 py-1 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-brand ${mode === key ? "bg-white text-ink shadow-sm" : "text-sub hover:text-ink"}`}>{label}</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="border-t border-hairline px-5 py-4 text-[11.5px] text-sub">No districts match this filter.</p>
      ) : (
        <ul data-tour="map-list" className="max-h-[340px] overflow-y-auto border-t border-hairline">
          {list.map((row) => (
            <li key={row.name}>
              <button type="button" onClick={() => onSelect(selected === row.name ? null : row.name)} aria-pressed={selected === row.name}
                className={`flex w-full items-center gap-2 px-5 py-2 text-left transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${selected === row.name ? "bg-brand-soft" : ""}`}>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">{row.name}</span>
                {mode === "all" && layer !== "review" && <Pill tone={row.marker.tone}>{row.marker.label}</Pill>}
                <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-sub">{layer === "review" ? `${row.poverty.toFixed(1)}% poverty` : describeValue(layer, row, national)}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#C1C9D6]" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
