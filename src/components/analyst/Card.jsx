import React, { useId, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { askChartQuestion } from "@/lib/chartAi";
import InfoTip from "@/components/analyst/support/InfoTip";
import { helpFor } from "@/data/cardHelp";

export default function Card({ title, subtitle = null, info: infoProp = null, aiInsight = null, aiContext = null, action = null, className = "", bodyClassName = "", tour = undefined, children }) {
  const [showAi, setShowAi] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [aiError, setAiError] = useState("");
  const [asking, setAsking] = useState(false);
  const infoId = useId();
  const info = helpFor(title, infoProp);

  const ask = async (event) => {
    event.preventDefault();
    if (!aiContext || !question.trim() || asking) return;
    setAsking(true);
    setAiError("");
    setAnswer("");
    try {
      setAnswer(await askChartQuestion({ title, question: question.trim(), context: `${info || ""}\n${aiContext}` }));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Could not answer the question.");
    } finally {
      setAsking(false);
    }
  };

  return (
    <section data-tour={tour} className={`group/chart rounded-xl border border-hairline bg-white ${className}`}>
      <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11.5px] leading-snug text-sub">{subtitle}</p>}
        </div>
        <div className="flex max-w-full flex-wrap items-center justify-end gap-1">
          {action}
          {info && <InfoTip label={title} large tourName="chart-explanation">{info}</InfoTip>}
          {aiInsight && (
            <button
              type="button"
              data-tour="chart-ai"
              onClick={() => { setQuestion(""); setAnswer(""); setAiError(""); setShowAi(true); }}
              className="grid h-6 w-6 place-items-center rounded-md text-brand transition-colors hover:bg-brand-soft"
              aria-label="Ask AI about this chart"
              title="Ask AI about this chart"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </header>
      <div className={`px-5 pb-4 ${bodyClassName}`}>{children}</div>

      {showAi && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
          onClick={() => setShowAi(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-hairline bg-white shadow-[0_12px_40px_rgba(10,37,64,0.16)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand" />
                <span className="text-[13px] font-semibold text-ink">AI Insight</span>
              </div>
              <button onClick={() => setShowAi(false)} className="text-sub hover:text-ink" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 py-4">
              <p className="text-[12px] leading-relaxed text-ink">{aiInsight}</p>
              {aiContext ? (
                <>
                  <form onSubmit={ask} className="mt-3">
                    <label htmlFor={`${infoId}-question`} className="block text-[11px] font-medium text-ink">Ask about this chart</label>
                    <textarea id={`${infoId}-question`} value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} rows={2}
                      placeholder="What can this chart tell me?" className="mt-1 w-full resize-y rounded-lg border border-hairline bg-white px-3 py-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-brand" />
                    <button type="submit" disabled={asking || !question.trim()} className="mt-2 rounded-md bg-brand px-3 py-1.5 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
                      {asking ? "Answering…" : "Ask AI"}
                    </button>
                  </form>
                  {answer && <p role="status" className="mt-3 rounded-lg border border-hairline bg-canvas px-3 py-2.5 text-[12px] leading-relaxed text-ink">{answer}</p>}
                  {aiError && <p role="alert" className="mt-3 text-[11px] text-[#B54708]">{aiError}</p>}
                  <p className="mt-3 text-[10px] text-[#8A94A6]">AI uses this chart's labelled figures. Check the source before making a decision.</p>
                </>
              ) : (
                <p className="mt-3 text-[10px] text-[#8A94A6]">AI questions are available on the Poverty Analysis dashboard.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
