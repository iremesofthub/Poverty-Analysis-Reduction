import React, { useMemo, useState } from "react";
import AnalystTopbar from "@/components/analyst/AnalystTopbar";
import PanelGuide from "@/components/analyst/PanelGuide";
import PovertySupportSection from "@/components/analyst/PovertySupportSection";
import ProgrammeDeliveryCard from "@/components/analyst/ProgrammeDeliveryCard";
import DistrictNeedsCard from "@/components/analyst/DistrictNeedsCard";
import FlaggedDistrictsTable from "@/components/analyst/FlaggedDistrictsTable";
import TargetingComparisonNote from "@/components/analyst/TargetingComparisonNote";
import { useRole } from "@/lib/DemoAuthContext";
import { DASHBOARD_DISTRICTS } from "@/data/dashboardEvidence";

export default function OtherAnalysis() {
  const role = useRole();
  const [province, setProvince] = useState("all");
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const rows = useMemo(
    () => province === "all" ? DASHBOARD_DISTRICTS : DASHBOARD_DISTRICTS.filter((row) => row.province === province),
    [province]
  );
  const investigationDistrict = rows.some((row) => row.name === selectedDistrict) ? selectedDistrict : (province === "all" ? "Gisagara" : rows[0]?.name);

  const handleViewDistrict = (name) => {
    setSelectedDistrict(name);
    document.getElementById("district-needs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="pb-14">
      <AnalystTopbar title="Other Analysis" introPath="/other-analysis" province={province} onProvinceChange={setProvince} />
      <PanelGuide id="other-analysis" title="Other Analysis">
        Earlier analysis that uses older methods or data that is not the latest survey: poverty and social support, programme delivery, district needs and priority districts.
      </PanelGuide>

      <main className="mx-auto max-w-[1440px] space-y-4 px-4 py-5 sm:px-6 lg:px-8">
        <div data-tour="analysis-support"><PovertySupportSection rows={rows} province={province} selectedName={investigationDistrict === selectedDistrict ? selectedDistrict : null} onSelect={setSelectedDistrict} /></div>

        <TargetingComparisonNote role={role} />

        <div id="programme-delivery" data-judge="programme-delivery" className="scroll-mt-20"><ProgrammeDeliveryCard rows={rows} /></div>

        <div id="district-needs" data-tour="analysis-needs" className="scroll-mt-20">
          <DistrictNeedsCard rows={rows} selectedName={selectedDistrict} onSelectDistrict={setSelectedDistrict} />
        </div>

        <div data-tour="analysis-priority"><FlaggedDistrictsTable rows={rows} onViewDistrict={handleViewDistrict} /></div>
      </main>
    </div>
  );
}
