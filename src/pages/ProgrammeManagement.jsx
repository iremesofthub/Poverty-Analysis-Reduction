import React from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import OverviewTab from "@/components/programme/OverviewTab";
import AgentsTab from "@/components/programme/AgentsTab";
import BeneficiariesTab from "@/components/programme/BeneficiariesTab";
import JobsTab from "@/components/programme/JobsTab";
import PaymentsTab from "@/components/programme/PaymentsTab";
import SkillsTab from "@/components/programme/SkillsTab";
import RequestsTab from "@/components/programme/RequestsTab";
import CooperativesTab from "@/components/programme/CooperativesTab";

import { ALL_PROGRAMMES, useProgrammeScope } from "@/lib/programmeScope";
import { PROGRAMMES } from "@/data/programme";
import PanelGuide from "@/components/analyst/PanelGuide";
import { useTranslation } from "react-i18next";

export default function ProgrammeManagement() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "overview";
  const setTab = (id) => setParams(id === "overview" ? {} : { tab: id });
  const scope = useProgrammeScope();

  return (
    <div className="pb-14">
      <PageHeader
        title={t("pageTitles.programmeManagement")}
        badge={
          <span className="hidden items-center gap-1.5 rounded-full border border-hairline px-2 py-[3px] text-[11px] text-sub sm:inline-flex">
            {scope.everything ? "All programmes" : scope.programme || "No programme"} · {scope.agents.length} agents · {scope.beneficiaries.length} beneficiaries
          </span>
        }
        actions={scope.isAdmin ? (
          <label className="flex items-center gap-2 text-[11.5px] text-sub">Viewing
            <select data-tour="pm-programme-select" value={scope.programme} onChange={(event) => scope.setChoice(event.target.value)} className="rounded-md border border-hairline bg-white px-2 py-1.5 text-[12px] font-medium text-ink outline-none focus:border-brand">
              <option>{ALL_PROGRAMMES}</option>
              {PROGRAMMES.map((item) => <option key={item.name}>{item.name}</option>)}
            </select>
          </label>
        ) : null}
      />

      <PanelGuide id="programme-management" title="Programme Management">
        This is your operational hub. Track agents, beneficiaries, jobs, payments and skills across
        all programmes. Use the menu on the left to switch between views.
      </PanelGuide>

      {!scope.linked && <div className="mx-auto max-w-xl px-6 py-16 text-center"><h2 className="text-[16px] font-semibold text-ink">This account is not linked to a programme</h2><p className="mt-1 text-[12.5px] leading-relaxed text-sub">Programme accounts see only their own programme. Sign out and sign in with a programme account, or ask the platform administrator to link this one.</p></div>}
      {scope.linked && <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
        {!scope.isAdmin && <p className="mb-3 inline-flex items-center gap-2 rounded-md border border-hairline bg-white px-3 py-1.5 text-[11.5px] text-sub">You are signed in as the <strong className="text-ink">{scope.programme}</strong> account. You can see and manage this programme only.</p>}
        {tab === "overview" && <OverviewTab onOpenTab={setTab} />}
        {tab === "requests" && <RequestsTab />}
        {tab === "cooperatives" && <CooperativesTab />}
        {tab === "agents" && <AgentsTab />}
        {tab === "beneficiaries" && <BeneficiariesTab />}
        {tab === "jobs" && <JobsTab />}
        {tab === "payments" && <PaymentsTab />}
        {tab === "skills" && <SkillsTab />}
      </div>}
    </div>
  );
}
