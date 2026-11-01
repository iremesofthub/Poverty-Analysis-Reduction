import { SECTION_TITLES } from "../../lib/reportTemplate.js";
import { choosePageCuts } from "../../lib/pdfPagination.js";
import { exportBanner, requireExportable } from "../../lib/exportPolicy.js";

const slug = (value) => String(value || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadText(text, filename, type = "text/markdown;charset=utf-8") {
  save(new Blob([text], { type }), filename);
}

export function reportToMarkdown(report, meta = {}) {
  const bullets = (items) => items.map((item) => `- ${item}`);
  const lines = [
    `# ${report.title}`, "", report.subtitle ? `_${report.subtitle}_` : "", "",
    `**Prepared by:** ${report.author}  `, `**Date:** ${report.date ? String(report.date).slice(0, 10) : ""}`, "", meta.note ? `> ${meta.note}` : "", "",
    `## 1. ${SECTION_TITLES[0]}`, "", "### Objective", "", report.executive_summary.objective, "",
  ];
  if (report.executive_summary.evidence_check) lines.push("### Evidence check", "", report.executive_summary.evidence_check, "");
  lines.push("### Main points", "", ...bullets(report.executive_summary.main_points), "");
  if (report.key_numbers.length) lines.push("### Key numbers", "", ...report.key_numbers.map((item) => `- **${item.label}:** ${item.value}${item.context ? `, ${item.context}` : ""}`), "");
  lines.push(`## 2. ${SECTION_TITLES[1]}`, "", "### Background", "", report.introduction.background, "", "### Questions this report asks", "", ...bullets(report.introduction.questions), "", "### Scope and limits", "", ...bullets(report.introduction.scope), "");
  const sourceLine = (item) => `${item.text}${item.file ? ` (file: ${item.file})` : ""}`;
  const used = report.methodology.data_sources.filter((item) => item.role !== "available");
  const available = report.methodology.data_sources.filter((item) => item.role === "available");
  lines.push(`## 3. ${SECTION_TITLES[2]}`, "", "### Data used for the figures in this report", "", ...bullets(used.map(sourceLine)), "");
  if (available.length) lines.push("### Also available to the engine, but not used for these figures", "", ...bullets(available.map(sourceLine)), "");
  lines.push("### How households were chosen and counted", "", ...bullets(report.methodology.sampling), "", "### Tools and methods", "", ...bullets(report.methodology.tools), "");
  lines.push(`## 4. ${SECTION_TITLES[3]}`, "");
  for (const section of report.results.sections) lines.push(`### ${section.heading}`, "", section.body, "");
  if (report.results.how_sure) lines.push("### How sure can we be?", "", report.results.how_sure, "");
  const check = report.verification;
  lines.push(`## 5. ${SECTION_TITLES[4]}`, "", check?.headline || "No figure in this report was checked against official publications.", "");
  if (check?.available) {
    lines.push("| Indicator | Internal result | Official published result | Source | Verification |", "|---|---|---|---|---|",
      ...check.rows.map((row) => `| ${row.indicator} | ${row.internal} | ${row.official} | ${row.url ? `[${row.source}](${row.url})` : row.source} | ${row.label} |`), "");
    lines.push(`**Confirmed:** ${check.lists.verified || "None"}  `, `**Discrepancies:** ${check.lists.discrepancies || "None"}  `, `**Cannot be compared (different definitions):** ${check.lists.mismatches || "None"}  `,
      `**Not checked against any official figure:** ${check.lists.unverified || "None"}  `, `**The engine's own analyses:** ${check.lists.original || "None"}`, "");
    const quality = check.quality;
    if (quality?.available) {
      // The same derived facts the screen shows, so the exported document cannot disagree with the report it came from.
      lines.push("### Evidence quality", "",
        `Recounted from the ${quality.totals.registry} checks recorded by the engine${quality.generatedAt ? `, run on ${String(quality.generatedAt).slice(0, 10)}` : ""}. Nothing below is typed in.`, "",
        ...bullets(quality.statuses.map(({ label, count }) => `${label}: ${count}`)), "");
      if (quality.countsMatchSummary === false) lines.push("> The figures recorded for this run and the summary attached to them do not agree. The counts above recount the recorded checks; the summary claims a different total. Read the table, not the summary.", "");
      if (quality.unexpectedStatuses.length) lines.push(`- ${quality.unexpectedStatuses.length} check carries a status this document has no label for (${quality.unexpectedStatuses.join(", ")}); it is counted in the total and listed in the table.`, "");
      lines.push("", ...bullets([
        `Official documents read: ${quality.sources.retrieved} of ${quality.sources.total}${quality.periods.length ? `; survey period: ${quality.periods.join(", ")}` : ""}`,
        quality.sources.failedToRetrieve.length ? `Could not be read: ${quality.sources.failedToRetrieve.map((item) => `${item.title} (${item.error || "no reason recorded"})`).join("; ")}` : "Could not be read: none",
        quality.sources.claimsWithoutSource.length ? `Figures with no published document behind them: ${quality.sources.claimsWithoutSource.join("; ")}` : "Every figure carries a source or is listed as the engine's own analysis",
        `Definitions line up enough to compare: ${quality.comparability.comparable} comparable, ${quality.comparability.notComparable} not comparable${quality.comparability.unknown ? `, ${quality.comparability.unknown} not stated` : ""}`,
        `Where the numbers come from: ${quality.estimates.observed} calculated by the engine from the microdata, ${quality.estimates.modelled} copied from a published modelled estimate and not recomputed here`,
        `Method review: ${quality.checks.status === "not_run" ? "not attempted for this run" : `${quality.checks.status} — ${quality.checks.passed} of ${quality.checks.total} checks passed${quality.checks.needsReview ? `, ${quality.checks.needsReview} needs review` : ""}`}`,
        `Human scientific review: ${quality.approvals.note}`,
        quality.unresolved ? `Unresolved: ${quality.unresolved} (${quality.unresolvedItems.join(", ") || "no item named"})` : "Unresolved: none",
        `${quality.limitations} stated limitations and ${quality.auditSteps} audit entries travel with this report. A passing count is not a release decision: only the governed API can mark a report published.`,
      ]), "");
    }
    if (check.corrections.length) lines.push("### Corrected during review", "", ...check.corrections.flatMap((item) => [`- Was: ${item.original}`, `  Now: ${item.corrected}`, `  Why: ${item.reason}`]), "");
    if (check.decomposition) lines.push("### Review of the gap-splitting method (Oaxaca-Blinder)", "", ...bullets(check.decomposition.checks.map((item) => `${item.check}: ${item.passed ? "passed" : "needs review"} (${item.observed})`)), "", ...bullets(check.decomposition.assumptions), "");
    lines.push("### Official documents read", "", ...bullets(check.sources.map((item) => `${item.url ? `[${item.title}](${item.url})` : item.title}${item.available ? `, version ${item.version}, retrieved ${String(item.retrieved_at).slice(0, 10)}` : ` (could not be retrieved: ${item.error})`}`)), "");
  } else if (check?.reason) lines.push(check.reason, "");
  lines.push(`## 6. ${SECTION_TITLES[5]}`, "", "### What the numbers mean", "", report.discussion.interpretation, "");
  if (report.discussion.comparison) lines.push("### How this compares", "", report.discussion.comparison, "");
  if (report.discussion.risks.length) lines.push("### Risks and surprises", "", ...bullets(report.discussion.risks), "");
  lines.push(`## 7. ${SECTION_TITLES[6]}`, "", "### Conclusion", "", report.conclusion.conclusion, "");
  if (report.conclusion.options.length) lines.push("### Options to evaluate", "", ...report.conclusion.options.flatMap((item) => [`#### ${item.title}`, "", item.rationale, "", `Evidence: ${item.evidence_level || "Not stated"}`, item.check_first ? `Check first: ${item.check_first}` : "", ""]));
  if (report.conclusion.next_steps.length) lines.push("### Next steps", "", ...bullets(report.conclusion.next_steps), "");
  lines.push(`## 8. ${SECTION_TITLES[7]}`, "");
  if (report.appendices.glossary.length) lines.push("### Words explained", "", ...report.appendices.glossary.map((item) => `- **${item.term}:** ${item.meaning}.`), "");
  if (report.appendices.references.length) lines.push("### References", "", ...bullets(report.appendices.references.map((item) => `[${item.title}](${item.url}), ${item.publisher}${item.period ? ` (${item.period})` : ""}`)), "");
  if (meta.footer) lines.push("---", meta.footer);
  return lines.filter((line, index, all) => !(line === "" && all[index - 1] === "")).join("\n");
}

export function downloadMarkdown(report, meta, name) {
  requireExportable(meta?.decision);
  const body = reportToMarkdown(report, meta);
  const banner = exportBanner(meta.decision);
  save(new Blob([`${banner}\n\n${body}`], { type: "text/markdown;charset=utf-8" }), `${slug(name)}.md`);
}

// Self-contained page: the rendered document plus the stylesheets currently applied to it.
export function downloadHtml(element, title, name, decision) {
  requireExportable(decision);
  const css = [...document.styleSheets].map((sheet) => { try { return [...sheet.cssRules].map((rule) => rule.cssText).join("\n"); } catch { return ""; } }).join("\n");
  const clone = element.cloneNode(true);
  clone.querySelectorAll("[data-export-hide]").forEach((node) => node.remove());
  const banner = document.createElement("div");
  banner.setAttribute("data-export-status", decision.mode);
  banner.setAttribute("style", "margin:0;padding:12px 16px;background:#FFF4E5;border-bottom:2px solid #B54708;color:#7A2E0E;font:600 12px/1.5 Inter,ui-sans-serif,system-ui,sans-serif");
  banner.textContent = `${decision.watermark}. Analyst draft produced without a server-side release decision; do not publish or cite as official.`
    + (decision.blockers.length ? ` Checks not passed: ${decision.blockers.join(", ")}.` : "");
  clone.prepend(banner);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title.replace(/[<&]/g, "")}</title><style>${css}</style><style>body{margin:0;background:#F7F9FC;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#0A2540}.report-shell{max-width:760px;margin:32px auto;background:#fff;border:1px solid #E3E8EE;border-radius:12px}</style></head><body><div class="report-shell">${clone.outerHTML}</div></body></html>`;
  save(new Blob([html], { type: "text/html;charset=utf-8" }), `${slug(name)}.html`);
}

// Each block is rendered on its own so charts and paragraphs are never cut in half across pages.
export async function downloadPdf(element, name, decision) {
  requireExportable(decision);
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const width = pageW - margin * 2;
  const usable = pageH - margin * 2;
  let y = margin;
  let freshPage = true;
  const blocks = [...element.querySelectorAll("[data-pdf-block]")];
  for (const block of blocks) {
    const canvas = await html2canvas(block, { scale: 1.6, backgroundColor: "#ffffff", useCORS: true, logging: false, ignoreElements: (node) => node.hasAttribute?.("data-export-hide") });
    if (!canvas.width || !canvas.height) continue;
    const toPixels = canvas.width / width; // image pixels per PDF point
    const pageCapacity = usable * toPixels;
    // Where text lines, list items, table rows, charts and cards sit in the image, so a page break never runs through one.
    const rect = block.getBoundingClientRect();
    const scale = canvas.height / rect.height;
    const spans = [];
    const headings = [];
    for (const node of block.querySelectorAll("p, li, tr, dt, dd, [data-pdf-unit], svg, .recharts-wrapper")) {
      const box = node.getBoundingClientRect();
      if (!box.height || box.height * scale > pageCapacity * 0.85) continue;
      spans.push([(box.top - rect.top) * scale, (box.bottom - rect.top) * scale]);
    }
    for (const node of block.querySelectorAll("h1, h2, h3, h4")) headings.push((node.getBoundingClientRect().bottom - rect.top) * scale);
    // A block that cannot fit in the room left starts a new page, unless only a sliver of the page is used.
    const room = pageH - margin - y;
    const firstCapacity = freshPage ? pageCapacity : Math.max(room, 0) * toPixels;
    const slices = choosePageCuts({ totalHeight: canvas.height, firstCapacity, pageCapacity, protectedSpans: spans, headingBottoms: headings });
    let drewPrevious = false;
    slices.forEach((slice, index) => {
      const sliceHeight = slice.bottom - slice.top;
      // A new page is started only after something was drawn, so an empty "new page first" slice never leaves a blank page behind.
      if ((index > 0 && drewPrevious) || (index === 0 && !freshPage && (sliceHeight === 0 || sliceHeight > firstCapacity + 1))) { pdf.addPage(); y = margin; freshPage = true; }
      drewPrevious = sliceHeight > 0;
      if (sliceHeight <= 0) return;
      const piece = document.createElement("canvas");
      piece.width = canvas.width;
      piece.height = Math.ceil(sliceHeight);
      piece.getContext("2d").drawImage(canvas, 0, slice.top, canvas.width, piece.height, 0, 0, canvas.width, piece.height);
      const heightPt = piece.height / toPixels;
      pdf.addImage(piece.toDataURL("image/jpeg", 0.9), "JPEG", margin, y, width, heightPt);
      y += heightPt + (index === slices.length - 1 ? 10 : 0);
      freshPage = false;
    });
  }
  const total = pdf.getNumberOfPages();
  pdf.setProperties({ title: `${name} (${decision.watermark})`, subject: decision.watermark,
    creator: "Ireme Insight legacy browser export", keywords: decision.blockers.join(",") });
  for (let page = 1; page <= total; page += 1) {
    pdf.setPage(page);
    pdf.setFontSize(7);
    pdf.setTextColor(180, 71, 8);
    pdf.text(decision.watermark, margin, 18);
    if (decision.blockers.length) pdf.text(`Checks not passed: ${decision.blockers.join(", ")}`, margin, 27);
    pdf.setFontSize(8);
    pdf.setTextColor(105, 115, 134);
    pdf.text(`Page ${page} of ${total}`, pageW - margin, pageH - 16, { align: "right" });
  }
  pdf.save(`${slug(name)}.pdf`);
}
