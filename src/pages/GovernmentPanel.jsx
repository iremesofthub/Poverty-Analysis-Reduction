import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import PanelGuide from "@/components/analyst/PanelGuide";
import GovCooperatives from "@/components/government/GovCooperatives";
import Beneficiary360 from "@/components/government/Beneficiary360";
import GovMembersDb from "@/components/government/GovMembersDb";
import { useDatabaseSession } from "@/lib/memberApi";
import { GovBeneficiaries, GovIssues, GovOverview, GovProblems, GovRequests } from "@/components/government/GovTabs";
import { useDemoAuth } from "@/lib/DemoAuthContext";
import { useAuth } from "@/lib/AuthContext";
import { leaderScope, useCooperatives } from "@/lib/cooperatives";
import { GOV_TABS, areaProblems, areaRecords } from "@/lib/govArea";
import { visibleIssues, useGovIssues } from "@/lib/govIssues";
import { actorFrom, useActionRequests } from "@/lib/actionRequests";
import { BENEFICIARIES } from "@/data/programme";
import { useTranslation } from "react-i18next";

export default function GovernmentPanel() {
  const { t } = useTranslation();
  const { data: dbReady } = useDatabaseSession();
  const { demoUser } = useDemoAuth();
  const { profile } = useAuth();
  const scope = leaderScope(demoUser, profile);
  const [params] = useSearchParams();
  const tab = GOV_TABS.some((item) => item.id === params.get("tab")) ? params.get("tab") : "overview";
  const [person, setPerson] = useState(null);
  const coopStore = useCooperatives();
  const allDistricts = useMemo(() => [...new Set(BENEFICIARIES.map((item) => item.district))].sort(), []);
  const [districtChoice, setDistrictChoice] = useState("Nyaruguru");
  const area = useMemo(() => areaRecords(scope, districtChoice), [scope.all, scope.district, scope.sector, scope.cell, districtChoice]);
  const problems = useMemo(() => areaProblems(area.records), [area.records]);
  const issueStore = useGovIssues();
  const { requests, create } = useActionRequests();
  const by = actorFrom(demoUser, scope.role);
  const issues = visibleIssues(issueStore.issues, scope, area.district);
  const districtRequests = requests.filter((item) => item.district === area.district);

  return (
    <div className="pb-14">
      <PageHeader
        title={t("pageTitles.government")}
        badge={
          <span className="hidden items-center gap-1.5 rounded-full border border-hairline px-2 py-[3px] text-[11px] text-sub sm:inline-flex">
            {scope.label || area.district}
          </span>
        }
      />

      <PanelGuide id="government-v2" title="Government">
        Everything here is limited to your own area. The overview combines the district survey figures with the beneficiary records on this platform. Use the menu on the left. Delivery problems lets you ask a programme team to act, Field reports to tell the leaders above you what you found, and Cooperatives to see how cooperatives in your area are doing.
      </PanelGuide>

      {scope.all && <div className="mx-auto max-w-[1440px] px-4 pt-4 sm:px-6 lg:px-8"><select value={districtChoice} onChange={(event) => setDistrictChoice(event.target.value)} aria-label="District" className="rounded-md border border-hairline bg-white px-3 py-1.5 text-[12.5px] outline-none focus:border-brand">{allDistricts.map((name) => <option key={name}>{name}</option>)}</select></div>}

      <div data-tour="gov-content" className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
        {tab === "overview" && <GovOverview area={area} scope={scope} problems={problems} issues={issues} requests={districtRequests} />}
        {tab === "beneficiaries" && (dbReady ? <GovMembersDb scopeLabel={scope.label || area.district} /> : <GovBeneficiaries area={area} scope={scope} onOpen={setPerson} />)}
        {tab === "problems" && <GovProblems area={area} problems={problems} by={by} onCreate={create} onOpen={setPerson} />}
        {tab === "reports" && <GovIssues area={area} scope={scope} store={issueStore} by={by} />}
        {tab === "requests" && <GovRequests area={area} requests={requests} />}
        {tab === "cooperatives" && <GovCooperatives />}
      </div>
      {person && <Beneficiary360 person={person} coopStore={coopStore} onClose={() => setPerson(null)} />}
    </div>
  );
}
