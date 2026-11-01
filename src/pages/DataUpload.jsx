import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, FileUp, Loader2, ShieldCheck, X } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import Card from "@/components/analyst/Card";
import { supabase, supabaseConfigured } from "@/lib/supabaseClient";
import { aggregateCsvTemplate, readAggregateCsv } from "@/lib/financialDatasetUpload";
import { useRole } from "@/lib/DemoAuthContext";

const emptyMeta = { source_id: "", title: "", publisher: "", source_url: "", period_label: "", publication_date: "", license: "" };
const formatTime = (value) => value ? new Date(value).toLocaleString() : "—";

export default function DataUpload() {
  const client = useQueryClient();
  const role = useRole();
  const [meta, setMeta] = useState(emptyMeta);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState({});
  const uploads = useQuery({ queryKey: ["financial-inclusion-uploads"], enabled: supabaseConfigured, queryFn: async () => {
    const { data, error: loadError } = await supabase.from("financial_inclusion_uploads").select("id,source_id,title,publisher,period_label,status,row_count,submitted_at,reviewed_at,review_note").order("submitted_at", { ascending: false });
    if (loadError) throw loadError;
    return data;
  } });
  const canApprove = role === "platform_admin";
  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  const setField = (event) => setMeta((current) => ({ ...current, [event.target.name]: event.target.value }));
  const readFile = async (event) => {
    setError(""); setNotice("");
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Choose a CSV file with aggregate indicators only."); return; }
    try { const parsed = readAggregateCsv(await file.text()); setRows(parsed); setFileName(file.name); }
    catch (cause) { setRows([]); setFileName(""); setError(cause.message || "The CSV could not be read."); }
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([aggregateCsvTemplate], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "financial-inclusion-aggregate-template.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
  };
  const submit = async (event) => {
    event.preventDefault(); setError(""); setNotice("");
    if (!rows.length) { setError("Choose and validate a CSV file first."); return; }
    setBusy(true);
    try {
      const { error: rpcError } = await supabase.rpc("submit_financial_inclusion_upload", { p_metadata: meta, p_observations: rows });
      if (rpcError) throw rpcError;
      setMeta(emptyMeta); setRows([]); setFileName(""); setNotice("Draft submitted. It will not change public charts until a platform administrator approves it.");
      await client.invalidateQueries({ queryKey: ["financial-inclusion-uploads"] });
    } catch (cause) { setError(cause.message || "The dataset draft could not be submitted."); }
    finally { setBusy(false); }
  };
  const review = async (upload, decision) => {
    setError(""); setNotice(""); setBusy(upload.id + decision);
    try {
      const { error: rpcError } = await supabase.rpc("review_financial_inclusion_upload", { p_upload_id: upload.id, p_decision: decision, p_review_note: notes[upload.id] || null });
      if (rpcError) throw rpcError;
      setNotice(decision === "approved" ? "Dataset approved and published to the financial-inclusion evidence tables." : "Dataset draft rejected; public charts were not changed.");
      await client.invalidateQueries({ queryKey: ["financial-inclusion-uploads"] });
      await client.invalidateQueries({ queryKey: ["financial-inclusion-data"] });
    } catch (cause) { setError(cause.message || "The review could not be saved."); }
    finally { setBusy(false); }
  };

  return <div className="pb-14"><PageHeader title="Data upload" />
    <main className="mx-auto max-w-[1180px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <section data-tour="upload-intro" className="rounded-xl border border-[#D9D6FE] bg-[#F5F3FF] p-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" /><div><h2 className="text-[13px] font-semibold text-ink">Controlled aggregate-data upload</h2><p className="mt-1 text-[11.5px] leading-relaxed text-sub">Upload published aggregate indicators only. Never upload household, customer, national-ID, phone, or other personal data. A draft cannot change public charts; a platform administrator must approve it.</p></div></div></section>
      {!supabaseConfigured && <p role="alert" className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] p-3 text-[12px] text-[#93570A]">Supabase is not configured in this local build. The form validates files locally, but submitting and approving drafts requires the configured hosted database.</p>}
      {error && <p role="alert" className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2] p-3 text-[12px] text-[#B42318]">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-[#ABEFC6] bg-[#ECFDF3] p-3 text-[12px] text-[#067647]">{notice}</p>}
      <section className="grid items-start gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div data-tour="upload-form"><Card title="Submit an aggregate CSV draft" subtitle="Validated before it reaches the review queue"><form onSubmit={submit} className="space-y-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-[11.5px] text-sub">Required fields are marked below. Use a stable source ID for this version.</p><button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand hover:underline"><Download className="h-3.5 w-3.5" />Download CSV template</button></div><div className="grid gap-3 sm:grid-cols-2">{Object.entries({ source_id: "Source ID", title: "Dataset title", publisher: "Publisher", source_url: "Official source URL", period_label: "Period", publication_date: "Publication date", license: "License / terms" }).map(([name, label]) => <label key={name} className={name === "title" || name === "source_url" || name === "license" ? "sm:col-span-2" : ""}><span className="mb-1 block text-[11px] font-medium text-ink">{label}{name !== "publication_date" && <span className="text-[#B42318]"> *</span>}</span><input required={name !== "publication_date"} type={name === "publication_date" ? "date" : name === "source_url" ? "url" : "text"} name={name} value={meta[name]} onChange={setField} placeholder={name === "source_id" ? "bnr-inclusion-2026-10" : undefined} className="h-9 w-full rounded-md border border-hairline bg-white px-2.5 text-[12px] outline-none focus:border-brand" /></label>)}</div><label className="block rounded-lg border border-dashed border-[#B8B3FF] bg-[#FAFAFF] p-4 text-center"><FileUp className="mx-auto h-5 w-5 text-brand" /><span className="mt-1 block text-[12px] font-medium text-ink">{fileName || "Choose aggregate CSV"}</span><span className="mt-0.5 block text-[10.5px] text-sub">Maximum 5,000 rows · no personal data</span><input type="file" accept=".csv,text/csv" onChange={readFile} className="sr-only" /></label>{rows.length > 0 && <p className="rounded-md bg-canvas px-3 py-2 text-[11.5px] text-ink"><strong>{rows.length}</strong> rows passed browser validation. They remain a draft until approval.</p>}<button disabled={!supabaseConfigured || Boolean(busy)} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-brand text-[12px] font-medium text-white disabled:opacity-50">{busy === true ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Submit for review</button></form></Card></div>
        <div data-tour="upload-preview"><Card title="CSV preview" subtitle={rows.length ? `${rows.length} validated aggregate rows` : "Choose a file to preview its first rows"}><div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left text-[10.5px]"><thead className="bg-canvas text-sub"><tr>{["Indicator", "Value", "Unit", "Geography", "Period end"].map((head) => <th key={head} className="p-2 font-medium">{head}</th>)}</tr></thead><tbody>{preview.length ? preview.map((row) => <tr key={row.observation_id} className="border-t border-hairline"><td className="p-2 text-ink">{row.indicator_label}</td><td className="p-2 tabular-nums">{row.value}</td><td className="p-2">{row.unit}</td><td className="p-2">{row.geography_level}</td><td className="p-2">{row.period_end}</td></tr>) : <tr><td colSpan="5" className="p-6 text-center text-sub">No validated file selected.</td></tr>}</tbody></table></div></Card></div>
      </section>
      <div data-tour="upload-review"><Card title="Dataset review queue" subtitle="Only approved datasets are published"><div className="space-y-3">{uploads.isLoading ? <p className="flex items-center gap-2 text-[12px] text-sub"><Loader2 className="h-4 w-4 animate-spin" />Loading drafts…</p> : (uploads.data || []).length === 0 ? <p className="text-[12px] text-sub">No uploaded datasets yet.</p> : uploads.data.map((upload) => <div key={upload.id} className="rounded-lg border border-hairline p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[12px] font-semibold text-ink">{upload.title}</p><p className="mt-0.5 text-[10.5px] text-sub">{upload.publisher} · {upload.period_label} · {upload.row_count} rows · submitted {formatTime(upload.submitted_at)}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-medium ${upload.status === "approved" ? "bg-[#ECFDF3] text-[#067647]" : upload.status === "rejected" ? "bg-[#FEF3F2] text-[#B42318]" : "bg-[#FFFAEB] text-[#93570A]"}`}>{upload.status}</span></div>{upload.status === "draft" && canApprove && <div className="mt-3 flex flex-wrap gap-2"><input aria-label={`Review note for ${upload.title}`} value={notes[upload.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [upload.id]: event.target.value }))} maxLength={500} placeholder="Review note (optional)" className="h-8 min-w-[220px] flex-1 rounded-md border border-hairline px-2 text-[11px]" /><button type="button" disabled={Boolean(busy)} onClick={() => review(upload, "approved")} className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-[11px] font-medium text-white"><Check className="h-3.5 w-3.5" />Approve & publish</button><button type="button" disabled={Boolean(busy)} onClick={() => review(upload, "rejected")} className="inline-flex items-center gap-1 rounded-md border border-[#FECDCA] px-2.5 py-1.5 text-[11px] font-medium text-[#B42318]"><X className="h-3.5 w-3.5" />Reject</button></div>}{upload.review_note && <p className="mt-2 text-[10.5px] text-sub">Review note: {upload.review_note}</p>}</div>)}</div></Card></div>
    </main>
  </div>;
}
