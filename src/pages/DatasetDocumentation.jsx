import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BookOpenText, CircleAlert, Database, RefreshCw, Scale, ShieldCheck } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import Card from "@/components/analyst/Card";
import PanelGuide from "@/components/analyst/PanelGuide";
import { countObservationsBySource } from "@/data/financialInclusion";
import { DASHBOARD_SOURCES } from "@/data/dashboardEvidence";
import { loadFinancialInclusionData } from "@/lib/financialInclusion";
import { useTranslation } from "react-i18next";

const STATUS_STYLES = {
  Imported: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
  "Published but not downloaded": "border-[#FEDF89] bg-[#FFFAEB] text-[#93570A]",
  "Access restricted": "border-[#FECACA] bg-[#FEF2F2] text-[#B42318]",
  "Not available": "border-hairline bg-canvas text-sub",
  "Validation failed": "border-[#FECACA] bg-[#FEF2F2] text-[#B42318]",
  Superseded: "border-hairline bg-canvas text-sub",
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(Number(bytes))) return "Not supplied";
  return `${(Number(bytes) / 1024 / 1024).toFixed(1)} MB`;
};

function SourceStatus({ status }) {
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10.5px] font-medium ${STATUS_STYLES[status] || STATUS_STYLES["Not available"]}`}>{status}</span>;
}

function SourceDetail({ source, observationCount }) {
  if (!source) return <p className="text-[12px] text-sub">Choose a source record to see its evidence and availability details.</p>;
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-[14px] font-semibold text-ink">{source.title}</h3><p className="mt-1 text-[11.5px] text-sub">{source.publisher} · {source.period_label || "Period not stated"}</p></div>
        <SourceStatus status={source.status} />
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
        <div><dt className="text-[10px] font-medium uppercase tracking-wide text-[#8A94A6]">Evidence loaded</dt><dd className="mt-0.5 text-[12px] text-ink">{observationCount} aggregate observations</dd></div>
        <div><dt className="text-[10px] font-medium uppercase tracking-wide text-[#8A94A6]">File</dt><dd className="mt-0.5 break-all text-[12px] text-ink">{source.local_file?.split("/").at(-1) || "No file downloaded"}{source.byte_size ? ` · ${formatBytes(source.byte_size)}` : ""}</dd></div>
        <div><dt className="text-[10px] font-medium uppercase tracking-wide text-[#8A94A6]">Geography available</dt><dd className="mt-0.5 text-[12px] text-ink">{source.geography_available?.join(", ") || "Not reported"}</dd></div>
        <div><dt className="text-[10px] font-medium uppercase tracking-wide text-[#8A94A6]">Retrieved</dt><dd className="mt-0.5 text-[12px] text-ink">{source.retrieval_date ? new Date(source.retrieval_date).toLocaleDateString() : "Not recorded"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-[10px] font-medium uppercase tracking-wide text-[#8A94A6]">License / terms</dt><dd className="mt-0.5 text-[12px] leading-relaxed text-ink">{source.license}</dd></div>
        {source.sha256 && <div className="sm:col-span-2"><dt className="text-[10px] font-medium uppercase tracking-wide text-[#8A94A6]">Source file SHA-256</dt><dd className="mt-0.5 break-all font-mono text-[10.5px] text-sub">{source.sha256}</dd></div>}
        {source.extraction_method && <div className="sm:col-span-2"><dt className="text-[10px] font-medium uppercase tracking-wide text-[#8A94A6]">How it was used</dt><dd className="mt-0.5 text-[12px] leading-relaxed text-ink">{source.extraction_method}</dd></div>}
      </dl>
      {source.limitation && <p className="mt-4 flex gap-2 rounded-lg border border-[#FEDF89] bg-[#FFFAEB] p-3 text-[11.5px] leading-relaxed text-[#93570A]"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{source.limitation}</p>}
      <a href={source.source_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-[11.5px] font-medium text-brand underline underline-offset-2">Open original source <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></a>
    </div>
  );
}

export default function DatasetDocumentation() {
  const { t } = useTranslation();
  const [data, setData] = useState({ sources: [], observations: [] });
  const [loadState, setLoadState] = useState("loading");
  const [activeId, setActiveId] = useState(null);

  const refresh = useCallback(() => {
    setLoadState("loading");
    loadFinancialInclusionData()
      .then((next) => { setData(next); setActiveId((current) => current || next.sources[0]?.source_id || null); setLoadState("ready"); })
      .catch(() => setLoadState("error"));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const observationCounts = useMemo(() => countObservationsBySource(data.observations), [data.observations]);
  const active = data.sources.find((source) => source.source_id === activeId) || data.sources[0] || null;
  const importedCount = data.observations.length;

  return (
    <div className="pb-14">
      <PageHeader title={t("pageTitles.datasets")} badge={<span className="hidden items-center gap-1.5 rounded-full border border-hairline px-2 py-[3px] text-[11px] text-sub sm:inline-flex"><Database className="h-3 w-3 text-brand" />Official source register</span>} />
      <PanelGuide id="data-sources" title="Data & Methodology">
        See where the figures come from, what each measure includes, when it was collected and what we cannot conclude from it. Financial-inclusion source status is read from the data store.
      </PanelGuide>

      <main className="mx-auto max-w-[1280px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <section data-tour="ds-intro" className="rounded-2xl border border-hairline bg-white p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand">Evidence behind the analysis</p><h2 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">Data & Methodology</h2><p className="mt-2 text-[13px] leading-relaxed text-sub">Check the source, period and population before interpreting a figure. This page separates survey evidence from provider reporting and records when data is missing.</p></div>
            <button type="button" onClick={refresh} className="inline-flex h-9 items-center gap-2 rounded-lg border border-hairline bg-white px-3 text-[11.5px] font-medium text-ink hover:bg-canvas"><RefreshCw className={`h-3.5 w-3.5 ${loadState === "loading" ? "animate-spin" : ""}`} aria-hidden="true" />Refresh source status</button>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-canvas p-3.5"><p className="text-[10px] uppercase tracking-wide text-sub">Registered sources</p><p className="mt-1 text-[22px] font-semibold tabular-nums text-ink">{loadState === "ready" ? data.sources.length : "—"}</p></div>
            <div className="rounded-xl bg-canvas p-3.5"><p className="text-[10px] uppercase tracking-wide text-sub">Imported financial observations</p><p className="mt-1 text-[22px] font-semibold tabular-nums text-ink">{loadState === "ready" ? importedCount : "—"}</p></div>
            <div className="rounded-xl bg-canvas p-3.5"><p className="text-[10px] uppercase tracking-wide text-sub">District finance estimates</p><p className="mt-1 text-[15px] font-semibold text-ink">Not published here</p></div>
          </div>
        </section>

        {loadState === "error" && <div role="alert" className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] p-3 text-[12px] text-[#93570A]">The source register could not be loaded from the database. Check the connection and refresh; no replacement figures are shown.</div>}

        <section className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Card tour="ds-list" title="Official source register" subtitle="Download and import status, period and geography" className="min-w-0" bodyClassName="px-0 pb-0">
            {loadState === "loading" && <p className="px-5 pb-4 text-[12px] text-sub" role="status">Loading source records…</p>}
            {loadState === "ready" && data.sources.length === 0 && <p className="px-5 pb-4 text-[12px] text-sub">No source records have been imported.</p>}
            {loadState === "ready" && data.sources.length > 0 && <div className="divide-y divide-hairline/70">
              {data.sources.map((source) => <button type="button" key={source.source_id} aria-pressed={active?.source_id === source.source_id} onClick={() => setActiveId(source.source_id)} className={`flex w-full flex-col gap-2 px-5 py-3 text-left transition-colors sm:flex-row sm:items-center sm:justify-between ${active?.source_id === source.source_id ? "bg-brand-soft" : "hover:bg-[#FAFBFD]"}`}>
                <span className="min-w-0"><span className="block text-[12px] font-medium text-ink">{source.title}</span><span className="mt-0.5 block text-[10.5px] text-sub">{source.publisher} · {source.period_label || "Period not stated"} · {observationCounts[source.source_id] || 0} observations</span></span><SourceStatus status={source.status} />
              </button>)}
            </div>}
          </Card>
          <Card title="Source details" subtitle="File, geography, license and limitations" info="An imported source means its public document and source metadata are registered. The observation count tells you whether numeric data from it was loaded.">
            {loadState === "ready" ? <SourceDetail source={active} observationCount={observationCounts[active?.source_id] || 0} /> : <p className="text-[12px] text-sub">Source details appear when the registry loads.</p>}
          </Card>
        </section>

        <section aria-labelledby="methods-title" className="space-y-3">
          <div><h2 id="methods-title" className="text-[17px] font-semibold tracking-tight text-ink">How to read the financial figures</h2><p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-sub">The same phrase, “financial inclusion,” can refer to different measures. Keep the source, method and date attached to every comparison.</p></div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="FinScope: what adults report using" subtitle="Demand-side · survey · 2024" info="Demand-side means the survey asks people about their use of services. FinScope's overall measure includes both formal and informal financial services.">
              <div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><BookOpenText className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-[12px] leading-relaxed text-ink">FinScope asks adults aged 16 and older about their financial services. Its Access Strand puts each adult in one group: banked, other formal but not banked, informal only, or excluded.</p><ul className="mt-3 space-y-1.5 text-[11px] text-sub"><li>• 2024 national result, from a published report table.</li><li>• The four rounded groups add to 100% and do not overlap.</li><li>• The source table does not provide confidence intervals; none are shown here.</li><li>• No district finance estimate is included in this database load.</li></ul><a href={DASHBOARD_SOURCES.financial} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-brand underline underline-offset-2">Open the FinScope report <ArrowUpRight className="h-3 w-3" aria-hidden="true" /></a></div></div>
            </Card>
            <Card title="NBR dashboard: what regulated providers report" subtitle="Supply-side · active usage · updated weekly by NBR" info="Supply-side means regulated financial providers report usage records. NBR says it deduplicates people internally using national identity numbers; this application only uses public aggregate data.">
              <div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#ECFDF3] text-[#067647]"><Scale className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-[12px] leading-relaxed text-ink">NBR's interactive dashboard describes formal services from regulated providers and adult individuals. It reports weekly updates and uses internal national-ID deduplication.</p><ul className="mt-3 space-y-1.5 text-[11px] text-sub"><li>• This is a different method and population measure from FinScope.</li><li>• No public API/export was confirmed for this import.</li><li>• Provider files are marked by their actual download/import status in the source register.</li><li>• A missing NBR value is not replaced with a FinScope figure.</li></ul><a href="https://fininclusion.bnr.rw/" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-brand underline underline-offset-2">Open the NBR dashboard <ArrowUpRight className="h-3 w-3" aria-hidden="true" /></a></div></div>
            </Card>
          </div>
        </section>

        <Card title="Poverty measures stay separate" subtitle="NISR EICV7 · 2023/24" info="EICV7 poverty measures come from a separate household survey. A district-level comparison with FinScope describes two area averages; it does not link the same households or show that one measure caused the other.">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex max-w-3xl gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#067647]" aria-hidden="true" /><p className="text-[12px] leading-relaxed text-sub">Poverty estimates on the Analyst Dashboard use NISR EICV7 2023/24 evidence. FinScope financial inclusion is a separate survey. Any side-by-side district comparison is descriptive, not household-linked or causal.</p></div><a href={DASHBOARD_SOURCES.poverty} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-brand underline underline-offset-2">Open NISR EICV7 source <ArrowUpRight className="h-3 w-3" aria-hidden="true" /></a></div>
        </Card>

        <p data-tour="ds-dictionary" className="text-[10.5px] leading-relaxed text-[#8A94A6]">Source status describes the registered public files. “Imported” identifies a source record; check the observation count to see whether its numeric aggregates are in the database. Data period is not the same as retrieval or import date.</p>
      </main>
    </div>
  );
}
