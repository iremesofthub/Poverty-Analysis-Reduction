import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, Users } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import Card from "@/components/analyst/Card";
import PanelGuide from "@/components/analyst/PanelGuide";
import FieldVisitModal from "@/components/field/FieldVisitModal";
import { supabaseConfigured } from "@/lib/supabaseClient";
import { useDemoAuth } from "@/lib/DemoAuthContext";
import { useAuth } from "@/lib/AuthContext";
import { useAgentAssignmentCount, useAgentVisits, useCompleteAgentVisit } from "@/lib/fieldApi";
import { useTranslation } from "react-i18next";

// ── Static fallback demo data ─────────────────────────────────────────────────
const DEMO_VISITS = [
  { id: "v1", name: "Mukasine Beatrice", cell: "Rusenge", type: "Payment verification", time: "09:30", status: "Done" },
  { id: "v2", name: "Habimana Jean", cell: "Kibingo", type: "Enrolment", time: "11:00", status: "Done" },
  { id: "v3", name: "Uwase Diane", cell: "Mata", type: "Complaint follow-up", time: "13:30", status: "In progress" },
  { id: "v4", name: "Nshuti Patrick", cell: "Kivu", type: "Payment verification", time: "15:00", status: "Pending" },
  { id: "v5", name: "Mukamana Claire", cell: "Gitanga", type: "Home visit", time: "16:30", status: "Pending" },
];

const DEMO_PROBLEMS = [
  { name: "Mukamana Claire", issue: "Did not receive October payment", priority: "High" },
  { name: "Habimana Jean", issue: "Program Member moved to another district", priority: "Medium" },
];

// ── KPI card ──────────────────────────────────────────────────────────────────
function Kpi({ icon: Icon, label, value, foot }) {
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-3.5">
      <div className="flex items-center gap-2 text-sub">
        <Icon className="h-4 w-4" strokeWidth={1.9} />
        <span className="text-[11.5px] font-medium">{label}</span>
      </div>
      <p className="mt-1.5 text-[22px] font-semibold leading-none tracking-tight text-ink tabular-nums">{value}</p>
      <p className="mt-1.5 text-[11px] text-[#8A94A6]">{foot}</p>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cls =
    status === "Done"
      ? "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]"
      : status === "In progress"
      ? "border-[#D3CEFF] bg-[#EFEDFF] text-[#4B3FCC]"
      : status === "Missed"
      ? "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]"
      : "border-hairline bg-[#FAFBFD] text-[#8A94A6]";
  return (
    <span className={`inline-flex rounded-full border px-2 py-[2px] text-[10.5px] font-medium ${cls}`}>
      {status}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AgentDashboard() {
  const { t } = useTranslation();
  const { demoUser } = useDemoAuth();
  const { profile } = useAuth();
  const agentId = profile?.agent_id;
  const visitsQuery = useAgentVisits(agentId);
  const assignmentCountQuery = useAgentAssignmentCount(agentId);
  const completeVisit = useCompleteAgentVisit(agentId);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState(null);

  const isDemo = !supabaseConfigured;
  const visits = isDemo ? DEMO_VISITS : visitsQuery.data ?? [];
  const problems = isDemo ? DEMO_PROBLEMS : [];
  const isLoading = supabaseConfigured && Boolean(agentId) && visitsQuery.isLoading;
  const dataError = supabaseConfigured && (visitsQuery.error || assignmentCountQuery.error);

  // Derived KPIs
  const assigned = isDemo ? 47 : assignmentCountQuery.data ?? 0;
  const doneCount = visits.filter((visit) => visit.status === "Done").length;
  const pendingCount = visits.filter((visit) => visit.status === "Pending" || visit.status === "In progress").length;

  // Open modal for a specific visit row
  const openRecordModal = (visit) => {
    setSelectedVisit(visit);
    setModalOpen(true);
  };

  const handleRecord = async ({ visitId }) => {
    if (isDemo) return;
    if (!agentId || !visitId) {
      throw new Error("Only a scheduled visit assigned to your account can be updated.");
    }
    await completeVisit.mutateAsync({ visitId });
  };

  return (
    <div className="pb-14" data-testid="agent-dashboard">
      <PageHeader
        title={t("pageTitles.agent")}
        badge={
          <span className="hidden items-center gap-1.5 rounded-full border border-hairline px-2 py-[3px] text-[11px] text-sub sm:inline-flex">
            {isDemo ? "VUP · Nyaruguru" : [profile?.programme, profile?.district].filter(Boolean).join(" · ") || "Field Agent"}
          </span>
        }
      />

      <PanelGuide id="agent-dashboard" title="Field Work">
        This page shows your daily field work — visits, problems and tasks. Use it to plan your day
        and record visits after you complete them.
      </PanelGuide>

      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4" data-tour="agent-day" data-judge="agent-day">
          <h2 className="text-[20px] font-semibold tracking-tight text-ink">Today's field work</h2>
          <p className="mt-0.5 text-[12px] text-sub">
            Assigned program members, visits and problem reports
            {isDemo && (
              <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-[10px] text-[#8A94A6]">
                demo data
              </span>
            )}
            {!isDemo && (
              <span className="ml-2 rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[10px] font-medium text-[#067647]">
                Supabase data
              </span>
            )}
          </p>
        </div>

        {supabaseConfigured && !agentId && (
          <div role="status" className="mb-4 rounded-lg border border-[#FEC84B] bg-[#FFFAEB] px-4 py-3 text-[12px] text-[#93370D]">
            This account is not linked to an agent record yet. Ask a platform administrator to link your profile before viewing field assignments.
          </div>
        )}
        {dataError && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
            We could not load your authorized field records. {dataError.message}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi icon={Users} label="Assigned" value={assigned} foot={isDemo ? "within VUP programme" : profile?.programme ? `current assignments in ${profile.programme}` : "current assignments"} />
          <Kpi icon={CheckCircle2} label="Visits today" value={visits.length} foot={`${doneCount} completed`} />
          <Kpi icon={Clock} label="Pending" value={pendingCount} foot="scheduled this afternoon" />
          <Kpi icon={AlertTriangle} label="Problems" value={isDemo ? problems.length : "—"} foot={isDemo ? "flagged for supervisor" : "not in connected schema"} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* Visits table */}
          <Card tour="agent-visits" title="Today's visits" subtitle="Schedule" className="xl:col-span-2" bodyClassName="px-0 pb-0">
            {!isDemo && !agentId ? (
              <p className="px-5 py-4 text-[12px] text-sub">Link this account to an agent profile to load visits.</p>
            ) : dataError ? (
              <p className="px-5 py-4 text-[12px] text-sub">Field records are unavailable. Retry after your connection or access is restored.</p>
            ) : isLoading ? (
              <p role="status" className="px-5 py-4 text-[12px] text-sub">Loading your assigned visits…</p>
            ) : visits.length === 0 ? (
              <p className="px-5 py-4 text-[12px] text-sub">No visits are assigned to this account yet.</p>
            ) : <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-y border-hairline bg-[#FAFBFD] text-[10.5px] uppercase tracking-[0.06em] text-[#8A94A6]">
                    <th className="py-2 pl-5 pr-3 text-left font-medium">Program Member</th>
                    <th className="px-3 py-2 text-left font-medium">Cell</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-right font-medium">Time</th>
                    <th className="py-2 pl-3 pr-5 text-right font-medium">Status</th>
                    <th className="py-2 pl-3 pr-5 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.map((v) => {
                    const isDone = v.status === "Done" || v.status === "Cancelled";
                    return (
                      <tr
                        key={v.id ?? (v.name + v.time)}
                        data-testid="visit-row"
                        className="border-b border-hairline/70 last:border-0 hover:bg-[#FAFBFD]"
                      >
                        <td className="py-2.5 pl-5 pr-3 font-medium text-ink">{v.name}</td>
                        <td className="px-3 py-2.5 text-sub">{v.cell}</td>
                        <td className="px-3 py-2.5 text-sub">{v.type}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sub">{v.time}</td>
                        <td className="py-2.5 pl-3 pr-3 text-right">
                          <StatusBadge status={v.status} />
                        </td>
                        <td className="py-2.5 pl-3 pr-5 text-right">
                          {!isDone && (isDemo || v.status === "Pending") && (
                            <button
                              type="button"
                              data-testid="record-visit-btn"
                              onClick={() => openRecordModal(v)}
                              className="rounded-md border border-hairline px-2.5 py-1 text-[10.5px] font-medium text-ink hover:bg-canvas"
                            >
                              {isDemo ? "Record" : "Mark complete"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}
          </Card>

          <div className="flex flex-col gap-4">
            {/* Quick record card */}
            <Card tour="agent-record" title={isDemo ? "Record a visit" : "Complete a scheduled visit"} subtitle={isDemo ? "Quick capture" : "Connected workflow"}>
              {isDemo ? (
                <button type="button" data-testid="record-visit-btn" onClick={() => openRecordModal(null)} className="flex w-full items-center justify-center gap-2 rounded-md bg-brand px-3 py-2 text-[12px] font-medium text-white hover:bg-brand/90">
                  <ClipboardList className="h-4 w-4" /> Record visit
                </button>
              ) : (
                <p className="text-[11.5px] leading-relaxed text-sub">Only visits already assigned to your account can be completed. The connected database does not yet support creating visits or saving narrative notes.</p>
              )}
            </Card>

            {/* Problem reports */}
            <Card tour="agent-problems" title="Problem reports" subtitle="Escalated" bodyClassName="px-0 pb-0">
              <ul className="border-t border-hairline">
                {problems.map((p) => (
                  <li key={p.name} className="border-b border-hairline/70 px-5 py-2.5 last:border-0">
                    <p className="text-[12px] font-medium text-ink">{p.name}</p>
                    <p className="text-[10.5px] text-sub">{p.issue}</p>
                  </li>
                ))}
                {!isDemo && <li className="px-5 py-3 text-[11.5px] text-sub">Problem reports are not available in the connected database yet.</li>}
              </ul>
            </Card>
          </div>
        </div>
      </div>

      {/* Field visit modal */}
      <FieldVisitModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        visit={selectedVisit}
        onRecord={handleRecord}
        persisted={!isDemo}
      />
    </div>
  );
}
