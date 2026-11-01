import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Building2, ChevronDown, ExternalLink, Landmark, ShieldCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DASHBOARD_DISTRICTS } from "@/data/dashboardEvidence";
import { BNR_INCLUSION_SNAPSHOT } from "@/data/bnrInclusionSnapshot";
import AccessCard from "@/components/analyst/AccessCard";
import DistrictAccessCard from "@/components/analyst/DistrictAccessCard";
import FinanceChangeCard from "@/components/analyst/FinanceChangeCard";
import FinanceSeriesCard from "@/components/analyst/FinanceSeriesCard";
import PanelGuide from "@/components/analyst/PanelGuide";

const BNR_DASHBOARD_URL = "https://fininclusion.bnr.rw/inclusion";
const number = new Intl.NumberFormat("en-US");

export default function FinancialInclusion() {
  const { t } = useTranslation();
  const [openPanel, setOpenPanel] = useState("nisr");
  const isBnrOpen = openPanel === "bnr";
  const isNisrOpen = openPanel === "nisr";

  return (
    <div className="pb-14">
      <main className="mx-auto max-w-[1440px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <section data-tour="financial-intro" className="overflow-hidden rounded-xl border border-hairline bg-white shadow-[0_1px_2px_rgba(10,37,64,0.04)]" aria-labelledby="financial-inclusion-title">
          <div className="border-b border-hairline bg-[linear-gradient(115deg,#F7F9FC_0%,#F0FDF9_100%)] px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-brand"><Landmark className="h-3.5 w-3.5" aria-hidden="true" /> Rwanda financial inclusion</p>
                <h1 id="financial-inclusion-title" className="mt-2 text-[24px] font-semibold tracking-tight text-ink sm:text-[28px]">Financial Inclusion</h1>
                <p className="mt-1.5 text-[13px] leading-relaxed text-sub">A dedicated view of financial access evidence for Rwanda. It keeps provider-reported BNR information distinct from the NISR FinScope household survey.</p>
              </div>
              <a href={BNR_DASHBOARD_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-[12px] font-medium text-white hover:bg-[#524BE0]">Open BNR dashboard <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></a>
            </div>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <button type="button" onClick={() => setOpenPanel(isBnrOpen ? null : "bnr")} aria-expanded={isBnrOpen} className={`rounded-lg border p-3.5 text-left transition-colors ${isBnrOpen ? "border-[#067647] bg-[#ECFDF3] ring-1 ring-[#067647]" : "border-[#B7E5D0] bg-[#F0FDF4] hover:bg-[#ECFDF3]"}`}><div className="flex gap-2.5"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#067647]" aria-hidden="true" /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h2 className="text-[12px] font-semibold text-ink">What BNR shows</h2><ChevronDown className={`h-4 w-4 shrink-0 text-[#067647] transition-transform ${isBnrOpen ? "rotate-180" : ""}`} aria-hidden="true" /></div><p className="mt-1 text-[11.5px] leading-relaxed text-sub">Official records reported by regulated financial-service providers. Click to understand this data.</p></div></div></button>
            <button type="button" onClick={() => setOpenPanel(isNisrOpen ? null : "nisr")} aria-expanded={isNisrOpen} className={`rounded-lg border p-3.5 text-left transition-colors ${isNisrOpen ? "border-brand bg-[#F5F3FF] ring-1 ring-brand" : "border-[#D9D6FE] bg-[#F5F3FF] hover:bg-[#F0EEFF]"}`}><div className="flex gap-2.5"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h2 className="text-[12px] font-semibold text-ink">What Ireme Insight shows</h2><ChevronDown className={`h-4 w-4 shrink-0 text-brand transition-transform ${isNisrOpen ? "rotate-180" : ""}`} aria-hidden="true" /></div><p className="mt-1 text-[11.5px] leading-relaxed text-sub">NISR FinScope survey evidence about what adults say they use. Click to understand this data.</p></div></div></button>
          </div>
        </section>

        <div data-tour="financial-guide"><PanelGuide id="financial-inclusion" title="Financial Inclusion">Start with the official BNR dashboard for its live provider view. Use the FinScope charts below to understand what adults report using in the survey. Do not combine the two measures or treat them as a poverty result.</PanelGuide></div>

        {isBnrOpen && <section data-tour="financial-bnr" className="overflow-hidden rounded-xl border border-[#B7E5D0] bg-white" aria-labelledby="bnr-dashboard-title">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#B7E5D0] bg-[#F0FDF4] px-4 py-3 sm:px-5"><div><h2 id="bnr-dashboard-title" className="text-[14px] font-semibold text-ink">BNR data, explained</h2><p className="mt-0.5 text-[11.5px] text-sub">This is BNR’s provider-reported view, not Ireme Insight data.</p></div><a href={BNR_DASHBOARD_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand hover:underline">Open official BNR dashboard <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a></div>
          <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5"><div><p className="text-[11px] font-semibold text-[#067647]">Where it comes from</p><p className="mt-1 text-[11.5px] leading-relaxed text-sub">Banks and other regulated financial-service providers report their records to BNR.</p></div><div><p className="text-[11px] font-semibold text-[#067647]">Who it describes</p><p className="mt-1 text-[11.5px] leading-relaxed text-sub">Adults appearing in regulated-provider records. BNR uses national-ID matching internally to avoid counting the same person twice.</p></div><div><p className="text-[11px] font-semibold text-[#067647]">How to use it</p><p className="mt-1 text-[11.5px] leading-relaxed text-sub">Use it to understand formal financial-service coverage. Check BNR’s definitions, date, and filters before quoting a number.</p></div></div>
          <div className="border-t border-[#D1FADF] bg-[#FCFEFD] p-4 sm:p-5"><div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-[13px] font-semibold text-ink">BNR dashboard snapshot</h3><p className="mt-0.5 text-[11px] text-sub">All institutions · active status · all genders and ages · all locations · dashboard date {BNR_INCLUSION_SNAPSHOT.dashboardDate}</p></div><span className="rounded-full bg-[#ECFDF3] px-2.5 py-1 text-[10.5px] font-medium text-[#067647]">Public aggregate snapshot</span></div><div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-[#D1FADF] bg-white p-4"><p className="text-[11px] font-medium text-sub">Financially included</p><p className="mt-1 text-[28px] font-semibold leading-none tracking-tight text-[#067647] tabular-nums">{BNR_INCLUSION_SNAPSHOT.financiallyIncludedPct}%</p><p className="mt-2 text-[11px] leading-relaxed text-sub">BNR’s reported inclusion result for the selected dashboard view.</p></div><div className="rounded-lg border border-[#D1FADF] bg-white p-4"><p className="text-[11px] font-medium text-sub">Total customers</p><p className="mt-1 text-[28px] font-semibold leading-none tracking-tight text-ink tabular-nums">{number.format(BNR_INCLUSION_SNAPSHOT.totalCustomers)}</p><p className="mt-2 text-[11px] leading-relaxed text-sub">Customers in the BNR dashboard’s selected active-status view.</p></div></div><div className="rounded-lg border border-[#D1FADF] bg-white p-3"><p className="px-1 text-[11px] font-medium text-sub">Customers by gender</p><div className="mt-1 flex items-center gap-2"><div className="h-[130px] w-[130px] shrink-0" role="img" aria-label={`BNR dashboard snapshot customers by gender: female ${number.format(BNR_INCLUSION_SNAPSHOT.gender[0].value)}, male ${number.format(BNR_INCLUSION_SNAPSHOT.gender[1].value)}`}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={BNR_INCLUSION_SNAPSHOT.gender} dataKey="value" nameKey="name" innerRadius={35} outerRadius={56} paddingAngle={2} stroke="none" isAnimationActive={false}>{BNR_INCLUSION_SNAPSHOT.gender.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value) => number.format(value)} /></PieChart></ResponsiveContainer></div><ul className="min-w-0 flex-1 space-y-2">{BNR_INCLUSION_SNAPSHOT.gender.map((item) => <li key={item.name} className="text-[10.5px]"><span className="flex items-center gap-1.5 text-sub"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />{item.name}</span><strong className="mt-0.5 block tabular-nums text-ink">{number.format(item.value)}</strong></li>)}</ul></div></div></div></div>
          <div className="grid gap-3 border-t border-[#D1FADF] bg-[#FCFEFD] p-4 xl:grid-cols-2 sm:p-5">
            <div className="rounded-lg border border-[#D1FADF] bg-white p-3">
              <h4 className="text-[12px] font-semibold text-ink">Inclusion by institution type</h4>
              <p className="mt-0.5 text-[10.5px] text-sub">Share included through each BNR institution type.</p>
              <div className="mt-2 h-[245px]" role="img" aria-label={`BNR dashboard snapshot. Inclusion by institution type: ${BNR_INCLUSION_SNAPSHOT.institutionInclusion.map((item) => `${item.name}: ${item.value} percent`).join(". ")}.`}>
                <ResponsiveContainer width="100%" height="100%"><BarChart data={BNR_INCLUSION_SNAPSHOT.institutionInclusion} layout="vertical" margin={{ top: 2, right: 26, bottom: 2, left: 78 }}><CartesianGrid horizontal={false} stroke="#EDF1F7" /><XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10, fill: "#8A94A6" }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 10, fill: "#425466" }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => `${value}%`} /><Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>{BNR_INCLUSION_SNAPSHOT.institutionInclusion.map((item) => <Cell key={item.name} fill={item.color} />)}</Bar></BarChart></ResponsiveContainer>
              </div>
              <p className="text-[10px] leading-relaxed text-[#8A94A6]">People can use more than one type, so these percentages overlap and must not be added together.</p>
            </div>
            <div className="rounded-lg border border-[#D1FADF] bg-white p-3">
              <h4 className="text-[12px] font-semibold text-ink">Largest customer counts by district</h4>
              <p className="mt-0.5 text-[10.5px] text-sub">Top ten categories shown by BNR for the same filtered view.</p>
              <div className="mt-2 h-[245px]" role="img" aria-label={`BNR dashboard snapshot. Customer counts by district: ${BNR_INCLUSION_SNAPSHOT.topDistrictCustomers.map((item) => `${item.name}: ${number.format(item.value)}`).join(". ")}.`}>
                <ResponsiveContainer width="100%" height="100%"><BarChart data={BNR_INCLUSION_SNAPSHOT.topDistrictCustomers} margin={{ top: 8, right: 8, bottom: 47, left: 4 }}><CartesianGrid vertical={false} stroke="#EDF1F7" /><XAxis dataKey="name" interval={0} angle={-38} textAnchor="end" height={55} tick={{ fontSize: 9.5, fill: "#425466" }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => `${Math.round(value / 1000000)}m`} width={35} tick={{ fontSize: 10, fill: "#8A94A6" }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => number.format(value)} /><Bar dataKey="value" fill="#AB892C" radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer>
              </div>
              <p className="text-[10px] leading-relaxed text-[#8A94A6]">“Unknown location” is a BNR dashboard category and is retained as reported.</p>
            </div>
          </div>
          <p className="border-t border-[#D1FADF] px-4 py-2.5 text-[10.5px] leading-relaxed text-[#5B6B7F]">Snapshot retrieved {BNR_INCLUSION_SNAPSHOT.retrievedAt} from the BNR dashboard. It can change when BNR updates its data. Ireme Insight does not use protected individual records or present this provider measure as an NISR survey estimate.</p>
        </section>}

        {isNisrOpen && <section data-tour="financial-finscope" data-judge="resilience-evidence" aria-labelledby="finscope-title" className="space-y-4">
          <div><h2 id="finscope-title" className="text-[17px] font-semibold tracking-tight text-ink">NISR FinScope survey evidence</h2><p className="mt-0.5 text-[12px] text-sub">Published household-survey estimates. The national survey figures and district comparisons below are not live BNR dashboard values.</p><p className="mt-1 max-w-3xl text-[11.5px] leading-relaxed text-[#B54708]">{t("discover.financialNote")}</p></div>
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2"><AccessCard province="all" /><FinanceSeriesCard rows={DASHBOARD_DISTRICTS} /></div>
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2"><DistrictAccessCard rows={DASHBOARD_DISTRICTS} /><FinanceChangeCard rows={DASHBOARD_DISTRICTS} /></div>
        </section>}
      </main>
    </div>
  );
}
