import React from "react";
import Card from "@/components/analyst/Card";
import { InvestigateLink, Pill } from "@/components/analyst/support/shared";
import { enrichRows, hasInterval } from "@/lib/povertySupport";
import { contrastVerdict } from "@/lib/districtUncertainty";

function Row({ label, value, note }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hairline/70 py-1.5 last:border-0">
      <span className="text-[11.5px] text-sub">{label}</span>
      <span className="text-right text-[12.5px] font-medium tabular-nums text-ink">{value}{note && <span className="block text-[10px] font-normal text-[#8A94A6]">{note}</span>}</span>
    </div>
  );
}

export default function DistrictDetail({ district, national, canInvestigate, onClear }) {
  const row = district ? enrichRows([district], national)[0] : null;
  const source = row || national;
  const sampleNote = `${source.samplePoorHouseholds.toLocaleString()} poor households surveyed`;

  return (
    <Card
      title={row ? row.name : "Rwanda overview"}
      subtitle={row ? `${row.province} Province` : "All 30 districts · national figures"}
      info={row ? "These are the numbers for the district you chose, with the design-based 95% interval the survey supports for each measure. The marker compares it with all of Rwanda using a joint contrast, so it accounts for the households the district and the national estimate share. It is a reason to look closer, not proof of a problem." : "These are the numbers for all of Rwanda. Click a district to see its own numbers and intervals."}
      action={row ? <button type="button" onClick={onClear} className="text-[11px] font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand">Clear</button> : null}
    >
      <div data-tour="map-detail">
        <Row label="Poverty" value={`${source.poverty.toFixed(1)}%`} note={`of people${hasInterval(source.povertyInterval) ? ` · 95% interval ${source.povertyInterval.low.toFixed(1)}–${source.povertyInterval.high.toFixed(1)}%` : ""}`} />
        <Row label="Extreme poverty" value={`${(source.extremePoverty).toFixed(1)}%`} note="of people" />
        <Row label="VUP participation" value={`${source.vupAmongPoor.toFixed(1)}%`} note={`of poor households · ${sampleNote}${hasInterval(source.vupInterval) ? ` · 95% interval ${source.vupInterval.low.toFixed(1)}–${source.vupInterval.high.toFixed(1)}%` : ""}`} />
        {row && <Row label="National reference" value={`${national.poverty.toFixed(1)}% · ${national.vupAmongPoor.toFixed(1)}%`} note="poverty · VUP" />}
      </div>

      {row ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Pill tone={row.marker.tone}>{row.marker.label}</Pill>
            <Pill tone={row.quality.tone}>{row.quality.label}</Pill>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-ink"><span className="font-medium">{contrastVerdict(row.povertyContrast).label}:</span> <span className="text-[#8A94A6]">{contrastVerdict(row.povertyContrast).detail}</span></p>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-[#8A94A6]">The marker compares this district with the national rates. It is a reason to look closer, not proof of a problem. Intervals are design-based and pending independent scientific review.</p>
          {canInvestigate && <InvestigateLink name={row.name} className="mt-3 w-full justify-center" />}
        </>
      ) : (
        <p className="mt-3 text-[10.5px] leading-relaxed text-[#8A94A6]">Click a district on the map, or choose one from the list, to see its figures.</p>
      )}
    </Card>
  );
}
