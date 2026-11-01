import React, { useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { filterRows, formatInterval, sortRows } from "@/lib/povertySupport";
import { contrastVerdict } from "@/lib/districtUncertainty";
import { anyInterval, COLORS, InvestigateLink, Pill } from "./shared";
import InfoTip, { HELP } from "./InfoTip";

function Bar({ value, color, faded = false }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-11 shrink-0 text-right font-medium tabular-nums text-ink">{value.toFixed(1)}%</span>
      <span className="h-1.5 w-full max-w-[110px] overflow-hidden rounded-full bg-[#EDF1F7]" aria-hidden="true">
        <span className={`block h-full rounded-full ${faded ? "opacity-50" : ""}`} style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }} />
      </span>
    </div>
  );
}

function Head({ sort, onSort, sortKey = null, children, help = null, helpLabel = "", className = "" }) {
  const active = sortKey && sort.key === sortKey;
  return (
    <th scope="col" aria-sort={active ? (sort.reverse ? "ascending" : "descending") : undefined} className={`px-2 py-2 font-medium ${className}`}>
      <span className="inline-flex items-center gap-1">
        {sortKey ? (
          <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-0.5 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand">
            {children}{active && (sort.reverse ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
          </button>
        ) : children}
        {help && <InfoTip label={helpLabel}>{help}</InfoTip>}
      </span>
    </th>
  );
}

export default function DistrictsTable({ rows, selectedName, onSelect }) {
  const [sort, setSort] = useState({ key: "poverty", reverse: false });
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const matches = sortRows(filterRows(rows, query), sort.key, sort.reverse ? "reverse" : "default");
  const visible = showAll || query ? matches : matches.slice(0, 10);
  const intervals = anyInterval(rows);
  const onSort = (key) => setSort((old) => ({ key, reverse: old.key === key ? !old.reverse : false }));
  const headProps = { sort, onSort };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sub" aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search district" aria-label="Search districts"
            className="h-8 w-44 rounded-md border border-hairline bg-white pl-7 pr-2 text-[12px] text-ink placeholder:text-[#8A94A6] focus-visible:outline-2 focus-visible:outline-brand" />
        </div>
        <p className="text-[10.5px] text-[#8A94A6]">{intervals ? "Ordered by point estimate. Where intervals overlap, nearby ranks are not statistically separated." : "Ordered by estimate. Without confidence intervals, nearby ranks are not statistically different."}</p>
      </div>

      {matches.length === 0 ? (
        <p className="rounded-lg border border-dashed border-hairline p-6 text-center text-[12px] text-sub">No district matches “{query}”.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[760px] border-collapse text-[11.5px]">
              <caption className="sr-only">Districts compared by poverty rate and VUP participation among poor households</caption>
              <thead>
                <tr className="border-y border-hairline bg-[#FAFBFD] text-left text-[10.5px] text-[#8A94A6]">
                  <Head {...headProps} sortKey="name" className="pl-3">District</Head>
                  <Head {...headProps} sortKey="poverty" help={HELP.poverty} helpLabel="Poverty rate">Poverty · people</Head>
                  <Head {...headProps} sortKey="vup" help={HELP.vup} helpLabel="VUP participation">VUP · poor households</Head>
                  {intervals && <Head {...headProps} help={HELP.interval} helpLabel="Confidence interval">Poverty CI</Head>}
                  {intervals && <Head {...headProps}>VUP CI</Head>}
                  <Head {...headProps} sortKey="sample" help={HELP.sample} helpLabel="Sample size">Poor HH sampled</Head>
                  <Head {...headProps}>Data quality</Head>
                  <Head {...headProps}>Review marker</Head>
                  <Head {...headProps}><span className="sr-only">Action</span></Head>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const selected = selectedName === row.name;
                  return (
                    <tr key={row.name} onClick={() => onSelect(selected ? null : row.name)} aria-selected={selected}
                      className={`cursor-pointer border-b border-hairline/70 ${selected ? "bg-brand-soft" : "hover:bg-[#FAFBFD]"}`}>
                      <th scope="row" className="py-2 pl-3 pr-2 text-left font-medium text-ink">
                        <button type="button" aria-pressed={selected} onClick={(event) => { event.stopPropagation(); onSelect(selected ? null : row.name); }} className="text-left focus-visible:outline-2 focus-visible:outline-brand">{row.name}</button>
                      </th>
                      <td className="px-2 py-2"><Bar value={row.poverty} color={COLORS.poverty} /></td>
                      <td className="px-2 py-2"><Bar value={row.vupAmongPoor} color={COLORS.vup} faded={row.quality.key === "small"} /></td>
                      {intervals && <td className="px-2 py-2 tabular-nums text-sub">{formatInterval(row.povertyInterval)}</td>}
                      {intervals && <td className="px-2 py-2 tabular-nums text-sub">{formatInterval(row.vupInterval)}</td>}
                      <td className="px-2 py-2 tabular-nums text-sub">n={row.samplePoorHouseholds}</td>
                      <td className="px-2 py-2"><Pill tone={row.quality.tone}>{row.quality.label}</Pill></td>
                      <td className="px-2 py-2"><Pill tone={row.marker.tone}>{row.marker.label}</Pill></td>
                      <td className="px-2 py-2 text-right"><InvestigateLink name={row.name} className="!px-2 !py-1 !text-[10.5px]">Investigate</InvestigateLink></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 sm:hidden">
            {visible.map((row) => {
              const selected = selectedName === row.name;
              return (
                <li key={row.name} className={`rounded-lg border p-3 ${selected ? "border-brand/40 bg-brand-soft" : "border-hairline bg-canvas/50"}`}>
                  <button type="button" aria-pressed={selected} onClick={() => onSelect(selected ? null : row.name)} className="flex w-full items-center justify-between gap-2 text-left">
                    <strong className="text-[12px] text-ink">{row.name}</strong><Pill tone={row.marker.tone}>{row.marker.label}</Pill>
                  </button>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-[10.5px] text-sub">
                    <div>Poverty · people<p className="mt-0.5 text-[12px] font-medium tabular-nums text-ink">{row.poverty.toFixed(1)}%</p><p className="text-[10px] tabular-nums text-[#8A94A6]">{formatInterval(row.povertyInterval)}</p></div>
                    <div>VUP · poor households<p className="mt-0.5 text-[12px] font-medium tabular-nums text-ink">{row.vupAmongPoor.toFixed(1)}% <span className="font-normal text-sub">(n={row.samplePoorHouseholds})</span></p><p className="text-[10px] tabular-nums text-[#8A94A6]">{formatInterval(row.vupInterval)}</p></div>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-snug text-sub">{contrastVerdict(row.povertyContrast).label}</p>
                  <div className="mt-2 flex items-center justify-between gap-2"><Pill tone={row.quality.tone}>{row.quality.label}</Pill><InvestigateLink name={row.name} className="!px-2 !py-1 !text-[10.5px]">Investigate</InvestigateLink></div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-[#8A94A6]">
        <span>{intervals ? "95% intervals are design-based (strata and PSUs from the EICV7 sample) and pending independent scientific review." : "Confidence intervals: not calculated in the source data."}</span>
        {!query && matches.length > 10 && <button type="button" onClick={() => setShowAll((value) => !value)} className="font-medium text-brand hover:underline">{showAll ? "Show top 10" : `Show all ${matches.length}`}</button>}
      </div>
    </div>
  );
}
