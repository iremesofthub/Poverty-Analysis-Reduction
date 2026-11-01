import React from "react";
import { X } from "lucide-react";
import { formatInterval, observationsFor, reasonToReview } from "@/lib/povertySupport";
import { contrastVerdict, reliabilityOf } from "@/lib/districtUncertainty";
import { InvestigateLink, Pill } from "./shared";
import InfoTip, { HELP } from "./InfoTip";

function Stat({ label, help, children }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-hairline/70 py-1.5 last:border-0">
      <span className="flex items-center gap-1 text-[11.5px] text-sub">{label}{help && <InfoTip label={label}>{help}</InfoTip>}</span>
      <span className="text-right text-[12px] font-medium tabular-nums text-ink">{children}</span>
    </div>
  );
}

export default function DistrictPanel({ row, national, reviewList, onSelect }) {
  if (!row) {
    return (
      <div className="rounded-lg border border-dashed border-hairline bg-[#FAFBFD] p-4 text-[11.5px] leading-relaxed text-sub">
        <p className="font-medium text-ink">Select a district</p>
        <p className="mt-1">Choose a dot, or a name below, to see its figures and why it may be worth a closer look.</p>
        {reviewList.length > 0 && (
          <div className="mt-3">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#8A94A6]">Review first ({reviewList.length})</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {reviewList.map((item) => <button key={item.name} type="button" onClick={() => onSelect(item.name)} className="rounded-full border border-hairline bg-white px-2 py-1 text-[11px] text-ink hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-brand">{item.name}</button>)}
            </div>
          </div>
        )}
      </div>
    );
  }
  const verdict = contrastVerdict(row.povertyContrast);
  return (
    <section aria-label={`${row.name} details`} className="rounded-lg border border-hairline bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">{row.name}</h3>
          <p className="text-[11px] text-sub">{row.province} Province</p>
        </div>
        <button type="button" onClick={() => onSelect(null)} aria-label="Clear selected district" className="grid h-6 w-6 place-items-center rounded text-sub hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5"><Pill tone={row.marker.tone}>{row.marker.label}</Pill><Pill tone={row.quality.tone}>{row.quality.label}</Pill></div>
      <div className="mt-2">
        <Stat label="Poverty rate" help={HELP.poverty}>{row.poverty.toFixed(1)}%<span className="block text-[10.5px] font-normal tabular-nums text-sub">{formatInterval(row.povertyInterval)}</span></Stat>
        <Stat label="VUP participation" help={HELP.vup}>{row.vupAmongPoor.toFixed(1)}%<span className="block text-[10.5px] font-normal tabular-nums text-sub">{formatInterval(row.vupInterval)}</span></Stat>
        <Stat label="Sample size" help={HELP.sample}>{row.samplePoorHouseholds} poor / {row.sampleHouseholds} households</Stat>
        <Stat label="Reliability" help={HELP.interval}>{[reliabilityOf(row.povertyEvidence)?.label ?? "Not assessed", reliabilityOf(row.vupEvidence)?.label ?? "Not assessed"].join(" · ")}</Stat>
        <Stat label="National reference" help={HELP.national}>{national.poverty.toFixed(1)}% · {national.vupAmongPoor.toFixed(1)}%</Stat>
      </div>
      <div className="mt-2 rounded-lg border border-hairline bg-[#FAFBFD] p-2.5">
        <p className="text-[11px] font-medium text-ink">{verdict.label}</p>
        <p className="mt-1 text-[10.5px] leading-relaxed text-sub">{verdict.detail}</p>
      </div>
      <div className="mt-3">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#8A94A6]">What the data shows</p>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-[11.5px] leading-relaxed text-ink">{observationsFor(row, national).map((line) => <li key={line}>{line}</li>)}</ul>
      </div>
      <div className="mt-3">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#8A94A6]">Why look closer</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink">{reasonToReview(row)}</p>
      </div>
      <InvestigateLink name={row.name} className="mt-4 w-full justify-center" />
    </section>
  );
}
