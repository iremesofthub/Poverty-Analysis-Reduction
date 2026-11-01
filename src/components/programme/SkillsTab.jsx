import React, { useState } from "react";
import { Award, Plus, TrendingUp, GraduationCap } from "lucide-react";
import Card from "@/components/analyst/Card";
import { useProgrammeScope } from "@/lib/programmeScope";

export default function SkillsTab() {
  const { skills: SKILLS_CATALOG, awards: AWARDS, beneficiaries: BENEFICIARIES } = useProgrammeScope();
  const [awarding, setAwarding] = useState(false);

  const totalTrained = BENEFICIARIES.reduce((s, b) => s + b.skills.length, 0);
  const certifiedCount = SKILLS_CATALOG.reduce((s, k) => s + k.certified, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3" data-tour="skills-kpis">
        <div className="rounded-xl border border-hairline bg-white px-4 py-3.5">
          <p className="flex items-center gap-1.5 text-[11px] text-[#8A94A6]"><GraduationCap className="h-3.5 w-3.5" /> Skills tracked</p>
          <p className="mt-1 text-[20px] font-semibold text-ink tabular-nums">{SKILLS_CATALOG.length}</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white px-4 py-3.5">
          <p className="flex items-center gap-1.5 text-[11px] text-[#8A94A6]"><TrendingUp className="h-3.5 w-3.5" /> Enrolments</p>
          <p className="mt-1 text-[20px] font-semibold text-ink tabular-nums">{totalTrained}</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white px-4 py-3.5">
          <p className="flex items-center gap-1.5 text-[11px] text-[#8A94A6]"><Award className="h-3.5 w-3.5" /> Certified</p>
          <p className="mt-1 text-[20px] font-semibold text-[#067647] tabular-nums">{certifiedCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Skills catalog" subtitle="Trained by field agents" data-tour="skills-catalog">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-[12px]">
              <thead>
                <tr className="border-y border-hairline bg-[#FAFBFD] text-[10px] uppercase tracking-[0.06em] text-[#8A94A6]">
                  <th className="py-2 pl-3 pr-2 text-left font-medium">Skill</th>
                  <th className="px-2 py-2 text-left font-medium">Category</th>
                  <th className="px-2 py-2 text-center font-medium">Ben.</th>
                  <th className="px-2 py-2 text-center font-medium">Agents</th>
                  <th className="py-2 pl-2 pr-3 text-center font-medium">Certified</th>
                </tr>
              </thead>
              <tbody>
                {SKILLS_CATALOG.map((s) => (
                  <tr key={s.name} className="border-b border-hairline/70 last:border-0 hover:bg-[#FAFBFD]">
                    <td className="py-2 pl-3 pr-2 font-medium text-ink">{s.name}</td>
                    <td className="px-2 py-2 text-sub">{s.category}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-ink">{s.beneficiaries}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-sub">{s.agents}</td>
                    <td className="py-2 pl-2 pr-3 text-center tabular-nums font-medium text-[#067647]">{s.certified}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title="Awards & achievements"
          subtitle="Recognising progress to motivate others"
          data-tour="skills-awards"
          action={
            <button onClick={() => setAwarding(true)} data-tour="skills-award-button" className="inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-brand/90">
              <Plus className="h-3.5 w-3.5" /> Award
            </button>
          }
          bodyClassName="px-0 pb-0"
        >
          <ul className="border-t border-hairline">
            {AWARDS.map((a, i) => (
              <li key={i} className="border-b border-hairline/70 px-5 py-3 last:border-0">
                <div className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ECFDF3] text-[#067647]">
                    <Award className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium text-ink">{a.beneficiary}</p>
                    <p className="text-[11px] text-sub">{a.type}</p>
                    <p className="mt-0.5 text-[10px] text-[#8A94A6]">{a.skill} · awarded by {a.agent} · {a.date}</p>
                  </div>
                  {a.cooperative && (
                    <span className="shrink-0 rounded-full border border-hairline px-2 py-[2px] text-[10px] text-sub">{a.cooperative}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="How it works" subtitle="Agent-led skills development">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { step: "1", title: "Agent teaches", desc: "Field agents deliver hands-on training during home visits and cooperative sessions." },
            { step: "2", title: "Program Member practices", desc: "Skills are tracked with progress bars until the program member reaches proficiency." },
            { step: "3", title: "Award & inspire", desc: "Achievements are recognised with certificates and public awards to motivate others." },
          ].map((s) => (
            <div key={s.step} className="rounded-lg border border-hairline p-3.5">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand">{s.step}</span>
              <p className="mt-2 text-[12.5px] font-medium text-ink">{s.title}</p>
              <p className="mt-0.5 text-[11px] text-sub">{s.desc}</p>
            </div>
          ))}
        </div>
      </Card>

      {awarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setAwarding(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-ink">Give an award</h3>
            <p className="mt-0.5 text-[11.5px] text-sub">Recognise a program member's achievement to motivate others</p>
            <div className="mt-4 space-y-3">
              <select className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand">
                <option>Select program member…</option>
                {BENEFICIARIES.map((b) => <option key={b.id}>{b.name}</option>)}
              </select>
              <select className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand">
                <option>Select skill…</option>
                {SKILLS_CATALOG.map((s) => <option key={s.name}>{s.name}</option>)}
              </select>
              <input placeholder="Award title (e.g. Best tailor — Sector award)" className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAwarding(false)} className="rounded-md border border-hairline px-3 py-1.5 text-[12px] text-sub hover:bg-canvas">Cancel</button>
              <button onClick={() => setAwarding(false)} className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand/90">Give award</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}