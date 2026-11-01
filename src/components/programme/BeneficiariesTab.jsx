import React, { useState } from "react";
import { Search, ShieldCheck, HeartPulse } from "lucide-react";
import Card from "@/components/analyst/Card";
import BeneficiaryDetail from "@/components/programme/BeneficiaryDetail";
import FeatureMiniEntry from "@/components/discovery/FeatureMiniEntry";
import { healthStatusStyle } from "@/data/programme";
import { useCooperatives } from "@/lib/cooperatives";
import { useProgrammeScope } from "@/lib/programmeScope";
import { useProgrammeMembers } from "@/lib/agentsProgrammeApi";

export default function BeneficiariesTab() {
  const { beneficiaries: demoBeneficiaries, programmes } = useProgrammeScope();
  const coops = useCooperatives();

  // Resolve programmeId from the first programme in scope (live data)
  const programmeId = programmes[0]?.id ?? null;

  // ── Live Supabase data ─────────────────────────────────────────────────────
  const { data: supaData, isLoading: supaLoading } = useProgrammeMembers(programmeId);

  // Determine whether live data is available and non-empty
  const liveMembers = Array.isArray(supaData) && supaData.length > 0 ? supaData : null;

  // Normalise live records to the shape the UI expects (matching demo object keys).
  const normalisedLive = liveMembers
    ? liveMembers.map((m) => ({
        id: m.id,
        name: m.full_name,
        district: m.district,
        familySize: m.family_size,
        health: { status: m.health_status ?? "—" },
        skills: [],    // not available in programme_enrollments join; show 0
        tasks: [],     // not available in programme_enrollments join; show 0
        status: m.status === "active"
          ? "Active"
          : m.status === "pending"
          ? "Pending"
          : (m.status ?? "—"),
      }))
    : null;

  // Final list: live if available, otherwise demo fallback
  const BENEFICIARIES = normalisedLive ?? demoBeneficiaries;

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState("All");
  const [health, setHealth] = useState("All");
  const [selected, setSelected] = useState(null);
  const [visible, setVisible] = useState(15);

  const districts = ["All", ...Array.from(new Set(BENEFICIARIES.map((b) => b.district)))];
  const filtered = BENEFICIARIES.filter(
    (b) =>
      (district === "All" || b.district === district) &&
      (health === "All" || b.health.status === health) &&
      (b.name.toLowerCase().includes(q.toLowerCase()) || b.id?.toString().toLowerCase().includes(q.toLowerCase()))
  );
  const shown = filtered.slice(0, visible);

  const unpaid = BENEFICIARIES.filter((b) => b.health.status !== "Paid").length;

  return (
    <div className="space-y-4" data-testid="beneficiaries-tab">
      {/* The "Review screening" entry sends people here, so the screen has to say what it is: a register of
          members on record, not the output of an approved eligibility rule. Nothing here is translated into a
          screening verdict. */}
      <FeatureMiniEntry anchor="vup-rules-destination" titleKey="discover.mini.whatCanWeDo" ids={["vup-rules"]} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A94A6]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-tour="members-search"
            placeholder="Search program member by name or ID…"
            className="w-full rounded-md border border-hairline py-2 pl-9 pr-3 text-[12.5px] text-ink outline-none focus:border-brand"
          />
        </div>
        <select value={district} onChange={(e) => setDistrict(e.target.value)} data-tour="members-district-filter" className="rounded-md border border-hairline bg-white px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand">
          {districts.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={health} onChange={(e) => setHealth(e.target.value)} data-tour="members-health-filter" className="rounded-md border border-hairline bg-white px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand">
          <option>All</option>
          <option>Paid</option>
          <option>Expiring</option>
          <option>Unpaid</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FEE4E2] bg-[#FEF3F2] px-2.5 py-1 text-[#B42318]">
          <HeartPulse className="h-3.5 w-3.5" /> {unpaid} beneficiaries need health insurance attention
        </span>
        <span className="text-sub">Showing {Math.min(visible, filtered.length)} of {filtered.length} beneficiaries</span>
      </div>

      <Card title="Program Member registry" bodyClassName="px-0 pb-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[12.5px]" data-tour="members-table">
            <thead>
              <tr className="border-y border-hairline bg-[#FAFBFD] text-[10.5px] uppercase tracking-[0.06em] text-[#8A94A6]">
                <th className="py-2 pl-5 pr-3 text-left font-medium">Program Member</th>
                <th className="px-3 py-2 text-left font-medium">District</th>
                <th className="px-3 py-2 text-center font-medium">Family</th>
                <th className="px-3 py-2 text-left font-medium">Health insurance</th>
                <th className="px-3 py-2 text-center font-medium">Skills</th>
                <th className="px-3 py-2 text-center font-medium">Tasks</th>
                <th className="px-3 py-2 text-left font-medium">Cooperative</th>
                <th className="py-2 pl-3 pr-5 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {/* Loading skeleton: 5 placeholder rows while Supabase is fetching */}
              {supaLoading &&
                [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i} className="animate-pulse border-b border-hairline/70">
                    <td className="py-2.5 pl-5 pr-3">
                      <div className="h-3 w-32 rounded bg-gray-200" />
                      <div className="mt-1 h-2.5 w-20 rounded bg-gray-100" />
                    </td>
                    <td className="px-3 py-2.5"><div className="h-3 w-20 rounded bg-gray-100" /></td>
                    <td className="px-3 py-2.5 text-center"><div className="mx-auto h-3 w-6 rounded bg-gray-100" /></td>
                    <td className="px-3 py-2.5"><div className="h-5 w-16 rounded-full bg-gray-100" /></td>
                    <td className="px-3 py-2.5 text-center"><div className="mx-auto h-3 w-6 rounded bg-gray-100" /></td>
                    <td className="px-3 py-2.5 text-center"><div className="mx-auto h-3 w-6 rounded bg-gray-100" /></td>
                    <td className="px-3 py-2.5"><div className="h-3 w-24 rounded bg-gray-100" /></td>
                    <td className="py-2.5 pl-3 pr-5 text-right"><div className="ml-auto h-5 w-14 rounded-full bg-gray-100" /></td>
                  </tr>
                ))}

              {!supaLoading &&
                shown.map((b) => (
                  <tr key={b.id} onClick={() => setSelected(b)} className="cursor-pointer border-b border-hairline/70 last:border-0 hover:bg-[#FAFBFD]" data-testid="member-row">
                    <td className="py-2.5 pl-5 pr-3">
                      <p className="font-medium text-ink">{b.name}</p>
                      <p className="text-[10.5px] text-sub">{b.id}</p>
                    </td>
                    <td className="px-3 py-2.5 text-sub">{b.district}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-ink">{b.familySize}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full border px-2 py-[2px] text-[10.5px] font-medium ${healthStatusStyle(b.health.status)}`}>
                        <ShieldCheck className="mr-1 h-3 w-3" /> {b.health.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-ink">{b.skills.length}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-ink">{b.tasks.length}</td>
                    <td className="px-3 py-2.5 text-sub">{coops.coopOf(b.id)?.name || "—"}</td>
                    <td className="py-2.5 pl-3 pr-5 text-right">
                      <span className={`inline-flex rounded-full border px-2 py-[2px] text-[10.5px] font-medium ${
                        b.status === "Active" ? "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" :
                        b.status === "Pending" ? "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" :
                        "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]"
                      }`}>{b.status}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      {visible < filtered.length && (
        <div className="flex justify-center pt-1">
          <button
            onClick={() => setVisible((v) => v + 15)}
            className="rounded-md border border-hairline bg-white px-4 py-2 text-[12px] font-medium text-ink hover:bg-canvas"
          >
            Load more beneficiaries ({filtered.length - visible} remaining)
          </button>
        </div>
      )}

      {selected && <BeneficiaryDetail beneficiary={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
