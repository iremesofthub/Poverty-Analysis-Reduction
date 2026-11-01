import React from "react";
import { useTranslation } from "react-i18next";
import { EvidenceFields } from "@/components/discovery/FeatureEvidenceSummary";
import FeatureMiniEntry from "@/components/discovery/FeatureMiniEntry";
import { featureById } from "@/lib/judgeFeatureRegistry";

// The screen a "Compare support options" card can honestly lead to while UPG-02 is unbuilt: what a same-budget
// comparison is for, which approved inputs it needs, and the plain statement that no comparison figure exists yet.
// It deliberately shows no numbers, because a budget comparison without an approved budget line and a reviewed
// targeting rule would be a guess wearing the clothes of a simulation.

export default function TargetingComparisonNote({ role }) {
  const { t } = useTranslation();
  const feature = featureById("support-compare");
  return (
    <section
      id="support-compare"
      data-judge="support-compare"
      aria-labelledby="support-compare-title"
      className="scroll-mt-20 rounded-xl border border-hairline bg-white p-4 shadow-[0_1px_2px_rgba(10,37,64,0.04)] sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="max-w-2xl">
          <h2 id="support-compare-title" className="text-[16px] font-semibold tracking-tight text-ink">
            {t("discover.feature.support-compare.title")}
          </h2>
          <p className="mt-0.5 text-[12px] text-sub">{t("discover.feature.support-compare.subtitle")}</p>
        </div>
        <span className="rounded-full border border-[#FEDF89] bg-[#FFFAEB] px-2.5 py-1 text-[10.5px] font-medium text-[#B54708]">
          {t("discover.state.unavailable")}
        </span>
      </div>
      <div className="mt-3">
        <EvidenceFields feature={feature} role={role} />
      </div>
      <FeatureMiniEntry className="mt-4" ids={["resilience", "action-tracking"]} role={role} titleKey="discover.mini.whatCanWeDo" />
    </section>
  );
}
