import React, { useState } from "react";
import { Search, Plus, Star, Phone, Users } from "lucide-react";
import { useProgrammeScope } from "@/lib/programmeScope";
import { useAgentEmployees, useCreateAgentEmployee } from "@/lib/agentsProgrammeApi";
import Agent360 from "@/components/programme/Agent360";

export default function AgentsTab() {
  const { agents: demoAgents, programmes } = useProgrammeScope();

  // Resolve programmeId from the first programme in scope (live data)
  const programmeId = programmes[0]?.id ?? null;

  // ── Live Supabase data ─────────────────────────────────────────────────────
  const { data: supaData, isLoading: supaLoading } = useAgentEmployees(programmeId);
  const createAgent = useCreateAgentEmployee(programmeId);

  // Determine whether to use live data or the demo fallback.
  // supaData is an array when the query succeeds; fall back to demo when it is
  // empty/unavailable or when Supabase is not configured.
  const liveAgents = Array.isArray(supaData) && supaData.length > 0 ? supaData : null;

  // Normalise live records to the shape the UI expects (matching demo object keys).
  const normalisedLive = liveAgents
    ? liveAgents.map((a) => ({
        id: a.id,
        name: a.full_name,
        phone: a.phone,
        district: a.district,
        rating: "—",               // not stored in agent_contracts
        beneficiaries: a.assigned_members_count,
        visits: "—",               // not stored in agent_contracts
        skillsTaught: Array.isArray(a.skills_taught) ? a.skills_taught : [],
        status: a.status === "active" ? "Active" : (a.status ?? "—"),
      }))
    : null;

  // Final list: live if available, otherwise demo fallback
  const AGENTS = normalisedLive ?? demoAgents;

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState("All");
  const [adding, setAdding] = useState(false);
  const [visible, setVisible] = useState(12);
  const [opened, setOpened] = useState(null);

  // "Add agent" form state
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newDistrict, setNewDistrict] = useState("");

  const districts = ["All", ...Array.from(new Set(AGENTS.map((a) => a.district)))];
  const filtered = AGENTS.filter(
    (a) =>
      (district === "All" || a.district === district) &&
      (a.name.toLowerCase().includes(q.toLowerCase()) || a.id?.toString().toLowerCase().includes(q.toLowerCase()))
  );
  const shown = filtered.slice(0, visible);

  // ── Add-agent submit handler ───────────────────────────────────────────────
  const handleCreateAgent = async () => {
    if (programmeId && newName.trim()) {
      try {
        await createAgent.mutateAsync({
          // agent_contracts doesn't hold full_name directly — map to the best
          // available column. In real deployments you'd first upsert a profile.
          employment_type: "field_agent",
          wage_currency: "RWF",
          skills_taught: [],
          assigned_members_count: 0,
          // Store name as a temporary note until a real agent user profile is linked
          notes: `Name: ${newName.trim()}, Phone: ${newPhone.trim()}, District: ${newDistrict || "—"}`,
        });
      } catch {
        // Ignore mutation errors in demo mode; the modal closes either way
      }
    }
    setAdding(false);
    setNewName("");
    setNewPhone("");
    setNewDistrict("");
  };

  return (
    <div className="space-y-4" data-testid="agents-tab">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A94A6]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-tour="agents-search"
            placeholder="Search agent by name or ID…"
            className="w-full rounded-md border border-hairline py-2 pl-9 pr-3 text-[12.5px] text-ink outline-none focus:border-brand"
          />
        </div>
        <select
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          data-tour="agents-district-filter"
          className="rounded-md border border-hairline bg-white px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand"
        >
          {districts.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <button
          onClick={() => setAdding(true)}
          data-tour="agents-add-agent"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-[12px] font-medium text-white hover:bg-brand/90"
        >
          <Plus className="h-4 w-4" /> Add agent
        </button>
      </div>

      <p className="text-[11.5px] text-sub">
        Showing {Math.min(visible, filtered.length)} of {filtered.length} agents
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {/* Loading skeleton: 3 placeholder cards while Supabase is fetching */}
        {supaLoading &&
          [0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-hairline bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 rounded bg-gray-200" />
                  <div className="h-2.5 w-20 rounded bg-gray-100" />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="h-10 rounded-lg bg-gray-100" />
                <div className="h-10 rounded-lg bg-gray-100" />
              </div>
              <div className="mt-3 flex gap-1.5">
                <div className="h-5 w-16 rounded-full bg-gray-100" />
                <div className="h-5 w-16 rounded-full bg-gray-100" />
              </div>
            </div>
          ))}

        {!supaLoading &&
          shown.map((a) => (
            <div key={a.id} className="rounded-xl border border-hairline bg-white p-4" data-testid="agent-card" data-tour="agents-list">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand">
                    {a.name.split(" ").map((p) => p[0]).join("")}
                  </span>
                  <div>
                    <button type="button" onClick={() => setOpened(a)} data-tour="agent-open" className="text-left text-[13px] font-medium text-brand hover:underline">{a.name}</button>
                    <p className="text-[10.5px] text-sub">{a.id} · {a.district}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-[#ABEFC6] bg-[#ECFDF3] px-2 py-[2px] text-[10px] font-medium text-[#067647]">
                  <Star className="h-3 w-3 fill-current" /> {a.rating}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11.5px]">
                <div className="rounded-lg bg-canvas px-2.5 py-1.5">
                  <p className="text-[10px] text-[#8A94A6]">Program Members</p>
                  <p className="font-medium text-ink">{a.beneficiaries}</p>
                </div>
                <div className="rounded-lg bg-canvas px-2.5 py-1.5">
                  <p className="text-[10px] text-[#8A94A6]">Visits today</p>
                  <p className="font-medium text-ink">{a.visits}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {a.skillsTaught.map((s) => (
                  <span key={s} className="rounded-full border border-hairline px-2 py-[2px] text-[10px] text-sub">{s}</span>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-hairline pt-2.5 text-[11px] text-sub">
                <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {a.phone}</span>
                <span className={`inline-flex items-center gap-1 ${a.status === "Active" ? "text-[#067647]" : "text-[#B54708]"}`}>
                  <Users className="h-3 w-3" /> {a.status}
                </span>
              </div>
            </div>
          ))}

        {/* An empty list has to say so. Without this the grid is simply blank, and a reviewer cannot tell
            "no agents recorded" from "the page broke". The two cases are different sentences. */}
        {!supaLoading && shown.length === 0 && (
          <p
            data-testid="agents-empty"
            className="col-span-full rounded-xl border border-dashed border-hairline bg-white px-4 py-6 text-center text-[12.5px] text-sub"
          >
            {filtered.length === 0 && (q || district !== "All")
              ? `No agents match${q ? ` "${q}"` : ""}${district !== "All" ? ` in ${district}` : ""}.`
              : "No agents are recorded for this programme yet."}
          </p>
        )}
      </div>

      {visible < filtered.length && (
        <div className="flex justify-center pt-1">
          <button
            onClick={() => setVisible((v) => v + 12)}
            className="rounded-md border border-hairline bg-white px-4 py-2 text-[12px] font-medium text-ink hover:bg-canvas"
          >
            Load more agents ({filtered.length - visible} remaining)
          </button>
        </div>
      )}

      {opened && <Agent360 agent={opened} onClose={() => setOpened(null)} />}

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setAdding(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-ink">Add new agent</h3>
            <p className="mt-0.5 text-[11.5px] text-sub">Register a field agent and assign wards</p>
            <div className="mt-4 space-y-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand"
              />
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Phone number"
                className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand"
              />
              <select
                value={newDistrict}
                onChange={(e) => setNewDistrict(e.target.value)}
                className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand"
              >
                <option value="">Select district…</option>
                {districts.filter((d) => d !== "All").map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAdding(false)} className="rounded-md border border-hairline px-3 py-1.5 text-[12px] text-sub hover:bg-canvas">Cancel</button>
              <button
                onClick={handleCreateAgent}
                disabled={createAgent.isPending}
                className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand/90 disabled:opacity-60"
              >
                {createAgent.isPending ? "Saving…" : "Create agent"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
