import React from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { formatInterval, hasInterval } from "@/lib/povertySupport";

export const COLORS = { poverty: "#635BFF", vup: "#14B8A6", connector: "#C9D1DE", national: "#0A2540" };

const PILL = {
  brand: "bg-brand-soft text-brand",
  neutral: "bg-[#F1F4F9] text-ink",
  muted: "bg-[#F1F4F9] text-sub",
  warn: "bg-[#FFFAEB] text-[#B54708]",
  ok: "bg-[#ECFDF3] text-[#067647]",
  bad: "bg-[#FEF3F2] text-[#B42318]",
};

export function Pill({ tone = "neutral", children }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-[3px] text-[10px] font-medium ${PILL[tone]}`}>{children}</span>;
}

// AI Engine uses the district query convention: ?district=<name>&autoStart=1.
export const investigationLink = (name) => `/ai-engine?district=${encodeURIComponent(name)}&autoStart=1&from=poverty-support`;

export function InvestigateLink({ name, className = "", children = "Analyze with AI Engine" }) {
  return (
    <Link to={investigationLink(name)} onClick={(event) => event.stopPropagation()}
      className={`inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[11.5px] font-medium text-white hover:bg-[#524BE0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${className}`}>
      <Search className="h-3.5 w-3.5" aria-hidden="true" />{children}
    </Link>
  );
}

// Used by every chart so the hover card always carries the same facts.
export function DistrictFacts({ row, national, source }) {
  return (
    <div className="space-y-1 text-[11px] leading-snug text-ink">
      <p className="text-[12px] font-semibold">{row.name} <span className="font-normal text-sub">· {row.province}</span></p>
      <p><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.poverty }} />Poverty: <strong className="tabular-nums">{row.poverty.toFixed(1)}%</strong> of people <span className="text-sub">(national {national.poverty.toFixed(1)}%)</span></p>
      <p><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.vup }} />VUP: <strong className="tabular-nums">{row.vupAmongPoor.toFixed(1)}%</strong> of poor households <span className="text-sub">(national {national.vupAmongPoor.toFixed(1)}%)</span></p>
      <p className="text-sub">Sample: {row.samplePoorHouseholds} poor households of {row.sampleHouseholds} surveyed</p>
      <p className="text-sub">Confidence interval: poverty {formatInterval(row.povertyInterval)} · VUP {formatInterval(row.vupInterval)}</p>
      <p className="text-sub">{source}</p>
      {row.quality.key !== "assessed" && <p className={row.quality.key === "small" ? "font-medium text-[#B54708]" : "text-sub"}>{row.quality.key === "small" ? "Warning: " : "Note: "}{row.quality.note}</p>}
    </div>
  );
}

export const anyInterval = (rows) => rows.some((row) => hasInterval(row.povertyInterval) || hasInterval(row.vupInterval));

export function Legend({ children }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-sub">{children}</div>;
}

export function Swatch({ color, hollow = false, line = false, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {line
        ? <span aria-hidden="true" className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: color }} />
        : <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={hollow ? { border: `1.5px dashed ${color}` } : { backgroundColor: color }} />}
      {children}
    </span>
  );
}
