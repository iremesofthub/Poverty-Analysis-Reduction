import {
  BarChart3,
  Briefcase,
  Building2,
  ClipboardCheck,
  FileText,
  Landmark,
  Layers,
  Upload,
  Map as MapIcon,
  BrainCircuit,
  ShieldCheck,
  Target,
  Users,
  Smartphone,
  UserRound,
} from "lucide-react";

export const ROLES = {
  platform_admin: { label: "Platform Admin", panel: "Poverty Analysis", home: "/" },
  nisr_analyst: { label: "NISR Analyst", panel: "Poverty Analysis", home: "/" },
  programme_owner: { label: "Programme Account", panel: "Programme Management", home: "/programmes" },
  cooperative: { label: "Cooperative Account", panel: "Cooperative", home: "/cooperative" },
  gov_district: { label: "District Officer", panel: "Government", home: "/government" },
  gov_sector: { label: "Sector Leader", panel: "Government", home: "/government" },
  gov_cell: { label: "Cell Leader", panel: "Government", home: "/government" },
  field_agent: { label: "Field Agent", panel: "Agent Dashboard", home: "/agent" },
  beneficiary: { label: "Program Member", panel: "Program Member", home: "/beneficiary" },
  job_applicant: { label: "Job Applicant", panel: "Find a Job", home: "/jobs" },
};

// Demo sign-ins only. Real accounts need a server: this list lives in the browser bundle.
export const DEMO_PASSWORD = "Demo@2026";

export const DEMO_ACCOUNTS = [
  { email: "admin@platform.demo", role: "platform_admin", name: "Aline Keza", title: "Platform Administrator", scope: "All Rwanda, all programmes" },
  { email: "analyst@nisr.demo", role: "nisr_analyst", name: "Mugisha Eric", title: "NISR National Analyst", scope: "National statistics" },
  { email: "vup@programmes.demo", role: "programme_owner", programme: "VUP Direct Support", name: "VUP Secretariat", title: "VUP Direct Support, MINALOC", scope: "VUP Direct Support only" },
  { email: "girinka@programmes.demo", role: "programme_owner", programme: "Girinka Munyarwanda", name: "Girinka Office", title: "Girinka Munyarwanda, MINAGRI", scope: "Girinka Munyarwanda only" },
  { email: "epw@programmes.demo", role: "programme_owner", programme: "Expanded Public Works", name: "Public Works Office", title: "Expanded Public Works, LODA", scope: "Expanded Public Works only" },
  { email: "nsymibondo@programmes.demo", role: "programme_owner", programme: "Nsymibondo y'Icyaro", name: "Nsymibondo Office", title: "Nsymibondo y'Icyaro (pilot)", scope: "Nsymibondo y'Icyaro only" },
  { email: "district@gov.demo", role: "gov_district", name: "Mukamana Claire", title: "District Officer", scope: "Nyaruguru District" },
  { email: "sector@gov.demo", role: "gov_sector", name: "Habimana Jean", title: "Sector Leader", scope: "Kibingo, Nyaruguru" },
  { email: "cell@gov.demo", role: "gov_cell", name: "Uwase Diane", title: "Cell Leader", scope: "Rusenge, Kibingo" },
  { email: "agent@field.demo", role: "field_agent", name: "Nshuti Patrick", title: "Field Agent", scope: "VUP · Nyaruguru" },
  { email: "beneficiary@people.demo", role: "beneficiary", name: "Mukasine Beatrice", title: "Program Member", scope: "VUP Direct Support" },
  { email: "applicant@people.demo", role: "job_applicant", name: "Iradukunda Alex", title: "Job Applicant", scope: "Open positions" },
];

// What is stored in the browser after sign-in never includes the password.
export const publicAccount = ({ email, role, programme, cooperativeId, name, title, scope }) => ({ email, role, programme, cooperativeId, name, title, scope });

export const findDemoAccount = (email, password) =>
  DEMO_ACCOUNTS.find((account) => account.email === String(email || "").trim().toLowerCase() && password === DEMO_PASSWORD) || null;

export const NAV_GROUPS = [
  {
    label: "Analysis",
    items: [
      { label: "Poverty Analysis", to: "/", icon: BarChart3, roles: ["platform_admin", "nisr_analyst"] },
      { label: "Other Analysis", to: "/other-analysis", icon: BarChart3, sub: true, roles: ["platform_admin", "nisr_analyst"] },
      { label: "AI Engine", to: "/ai-engine", icon: BrainCircuit, roles: ["platform_admin", "nisr_analyst"] },
      { label: "National Goals", to: "/nst2", icon: Target, roles: ["platform_admin", "nisr_analyst"] },
      { label: "Financial Inclusion", to: "/financial-inclusion", icon: Landmark, roles: ["platform_admin", "nisr_analyst"] },
      { label: "Programme Results", to: "/evidence", icon: ClipboardCheck, roles: ["platform_admin"] },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Programme Management", to: "/programmes", icon: Layers, roles: ["platform_admin", "programme_owner"] },
      { label: "Cooperatives", to: "/cooperatives", icon: Users, roles: ["platform_admin", "beneficiary"] },
      { label: "Cooperative Panel", to: "/cooperative", icon: Users, roles: ["platform_admin", "cooperative"] },
      { label: "Government", to: "/government", icon: Building2, roles: ["platform_admin", "gov_district", "gov_sector", "gov_cell"] },
      { label: "Field Work", to: "/agent", icon: ShieldCheck, roles: ["platform_admin", "field_agent"] },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Program Member", to: "/beneficiary", icon: UserRound, roles: ["platform_admin", "beneficiary"] },
      { label: "Find a Job", to: "/jobs", icon: Briefcase, roles: ["platform_admin", "job_applicant"] },
      { label: "USSD Control", to: "/ussd-control", icon: Smartphone, roles: ["platform_admin"] },
      { label: "Account requests", to: "/account-requests", icon: Users, roles: ["platform_admin"] },
      { label: "Data upload", to: "/data-upload", icon: Upload, roles: ["platform_admin", "nisr_analyst"] },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "District Map", to: "/map", icon: MapIcon, roles: ["platform_admin", "nisr_analyst", "programme_owner", "gov_district", "gov_sector", "gov_cell"] },
    ],
  },
  {
    label: "Data",
    items: [
      { label: "Data & Methodology", to: "/datasets", icon: FileText, roles: ["platform_admin", "nisr_analyst"] },
    ],
  },
];

// The stable name of a menu item, used for its tour marker and its translation key.
export const navSlug = (to) => (to === "/" ? "poverty-analysis" : to.replace(/^\//, ""));

export const roleHome = (role) => ROLES[role]?.home ?? "/";

export const navForRole = (role) =>
  NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter(
    (g) => g.items.length > 0
  );
