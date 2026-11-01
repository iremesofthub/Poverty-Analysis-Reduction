import { useCallback, useEffect, useMemo, useState } from "react";
import { AGENTS, AWARDS, BENEFICIARIES, JOBS, PAYMENTS, PROGRAMMES, SKILLS_CATALOG } from "@/data/programme";
import { useDemoAuth, useRole } from "@/lib/DemoAuthContext";
import { useAuth } from "@/lib/AuthContext";

// One programme account sees one programme. The platform admin sees all of them, or picks one to look at.
// In this demo the rule is enforced in the browser; real enforcement must happen on a server.
export const ALL_PROGRAMMES = "All programmes";
const KEY = "ireme_admin_programme";
const EVENT = "ireme-admin-programme";

const readChoice = () => {
  try { const value = window.localStorage.getItem(KEY); return PROGRAMMES.some((item) => item.name === value) ? value : ALL_PROGRAMMES; } catch { return ALL_PROGRAMMES; }
};

export function useProgrammeScope() {
  const role = useRole();
  const { demoUser } = useDemoAuth();
  const { profile } = useAuth();
  const isAdmin = role === "platform_admin";
  const [choice, setChoiceState] = useState(readChoice);
  useEffect(() => {
    const refresh = () => setChoiceState(readChoice());
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  const setChoice = useCallback((name) => {
    try { window.localStorage.setItem(KEY, name); } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  // An owner account that is not linked to a programme gets nothing, never everything.
  // In Supabase mode the programme lives on the protected profile row (profile.programme);
  // in local demo mode it lives on demoUser.programme.
  const own = role === "programme_owner"
    ? (() => {
        const programme = profile?.programme ?? demoUser?.programme ?? null;
        return PROGRAMMES.some((item) => item.name === programme) ? programme : null;
      })()
    : null;
  const programme = isAdmin ? choice : own;
  const everything = isAdmin && programme === ALL_PROGRAMMES;
  const linked = isAdmin || Boolean(own);

  const data = useMemo(() => {
    const allow = (item) => linked && (everything || item.programme === programme);
    const agents = AGENTS.filter(allow);
    const beneficiaries = BENEFICIARIES.filter(allow);
    const names = new Set(beneficiaries.map((person) => person.name));
    // Skills are counted from this programme's own people, not from the shared catalogue totals.
    const skills = SKILLS_CATALOG.map((skill) => {
      const learners = beneficiaries.filter((person) => person.skills.some((entry) => entry.name === skill.name));
      return { ...skill, beneficiaries: learners.length, agents: new Set(agents.filter((agent) => agent.skillsTaught?.includes(skill.name)).map((agent) => agent.id)).size, certified: learners.filter((person) => person.skills.some((entry) => entry.name === skill.name && entry.progress >= 85)).length };
    });
    return {
      agents, beneficiaries, skills,
      jobs: JOBS.filter(allow),
      payments: PAYMENTS.filter(allow),
      awards: AWARDS.filter((award) => names.has(award.beneficiary)),
      programmes: PROGRAMMES.filter((item) => linked && (everything || item.name === programme)),
    };
  }, [linked, everything, programme]);

  const owns = useCallback((itemProgramme) => linked && (everything || itemProgramme === programme), [linked, everything, programme]);

  return { programme, isAdmin, everything, linked, setChoice, owns, ...data };
}
