import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CircleHelp, PlayCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import FeatureEvidenceSummary, { kindLabel, stateLabel, useFeatureCopy } from "@/components/discovery/FeatureEvidenceSummary";
import { dashboardFeatures } from "@/lib/judgeFeatureRegistry";

// Surface A of UPG-12: the four capabilities a judge should understand in ten seconds, placed directly under the
// dashboard's own headline. Each card links only where resolveFeature() has checked the real route guard for the
// signed-in role, and each card carries a plain-language proof panel instead of a number. No metric is repeated
// here, because a figure without its source, period and interval is the thing this section is meant to avoid.

const CHIP = {
  calculated: "bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]",
  published: "bg-[#F5F3FF] text-[#5E4AD1] border-[#D9D6FE]",
  partial: "bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]",
  demo: "bg-[#FEF3F2] text-[#B42318] border-[#FDA29B]",
  unavailable: "bg-canvas text-sub border-hairline",
};

function FeatureCard({ resolved, role, onAsk }) {
  const { t } = useTranslation();
  const text = useFeatureCopy(resolved.feature.id);
  const kind = text.fields.find((item) => item.field === "resultKind")?.value;
  return (
    <article
      data-feature={resolved.feature.id}
      data-judge={`card-${resolved.feature.id}`}
      className="flex h-full flex-col rounded-xl border border-hairline bg-white p-4 shadow-[0_1px_2px_rgba(10,37,64,0.04)]"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold tracking-tight text-ink">{text.title}</h3>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${CHIP[resolved.feature.state] || CHIP.unavailable}`}>
          {stateLabel(t, resolved.feature.state)}
        </span>
      </div>
      <p className="mt-1.5 flex-1 text-[12px] leading-relaxed text-sub">{text.subtitle}</p>
      <p className="mt-2 text-[10.5px] leading-relaxed text-[#8A94A6]">{kind ? kindLabel(t, kind) : null}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          to={resolved.href}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#524BE0]"
        >
          {text.cta}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
        <button type="button" onClick={() => onAsk(resolved.feature.id)} className="text-[11.5px] font-medium text-brand underline underline-offset-2 hover:text-[#524BE0]">
          {t("discover.verified")}
        </button>
      </div>
    </article>
  );
}

export default function FeatureDiscovery({ role, onOpenTour }) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(null);
  const items = dashboardFeatures(role);
  if (!items.length) return null;
  const active = items.find((item) => item.feature.id === asking);
  return (
    <section data-judge="discover" aria-labelledby="discover-title" className="rounded-xl border border-hairline bg-canvas/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id="discover-title" className="text-[16px] font-semibold tracking-tight text-ink">{t("discover.heading")}</h2>
          <p className="mt-0.5 text-[12px] text-sub">{t("discover.subheading")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-judge="discover-tour"
            onClick={onOpenTour}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-[12px] font-medium text-white hover:bg-[#524BE0]"
          >
            <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {t("discover.tourEntry")}
          </button>
          <Link to="/datasets" data-feature="quality-checks" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline">
            <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
            {t("discover.qualityLink")}
          </Link>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((resolved) => <FeatureCard key={resolved.feature.id} resolved={resolved} role={role} onAsk={setAsking} />)}
      </div>
      <FeatureEvidenceSummary feature={active?.feature || null} role={role} open={Boolean(active)} onOpenChange={(open) => setAsking(open ? asking : null)} />
    </section>
  );
}
