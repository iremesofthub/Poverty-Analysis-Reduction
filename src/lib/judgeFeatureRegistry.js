// Judge-visible feature registry (UPG-12).
//
// This module is the single place that decides what a discovery card may promise. It is deliberately
// dependency-free plain JavaScript so `node --test` can import it without the Vite `@/` alias.
//
// Rules that the unit tests enforce:
//   1. Every destination is a route the router really guards, and every `?tab=` / `?section=` value is a real
//      tab or section id. A card can never offer a page the guard would refuse.
//   2. A feature only claims what is actually implemented in this build. Nothing here says "verified", "live",
//      "production-ready" or "real-world impact", and nothing carries a number: counts and figures stay on the
//      pages that compute them, where their source and uncertainty travel with them.
//   3. No credentials, no sample passwords, no licensed microdata paths, no person, household or account values.
//      Copy lives in the translation files; this file holds ids, routes and short English labels only.
//
// The planning contract is CODEX_IREME_UPGRADE/02_CONTRACTS/JUDGE_FEATURE_REGISTRY.json. It is a plan, not
// evidence that a feature works; the capability states below describe the application as it is now.

export const JUDGE_FEATURE_IDS = [
  "evidence-check",
  "support-compare",
  "resilience",
  "action-tracking",
  "vup-rules",
  "referral-followup",
  "quality-checks",
  "model-evaluation",
];

export const ANALYST_DASHBOARD_FEATURES = ["evidence-check", "support-compare", "resilience", "action-tracking"];

// Roles allowed by each route guard, transcribed from src/App.jsx. The unit test re-reads App.jsx and fails if
// this table and the router ever disagree, so a card cannot outlive a guard change unnoticed.
export const ROUTE_ACCESS = {
  "/": ["platform_admin", "nisr_analyst"],
  "/other-analysis": ["platform_admin", "nisr_analyst"],
  // The governed research workspace is reserved for the analysts and the platform admin (matches the router in src/App.jsx).
  "/ai-engine": ["platform_admin", "nisr_analyst"],
  // The legacy investigation link is a redirect to the AI Engine, kept so old bookmarks still land somewhere honest.
  "/investigations": ["platform_admin", "nisr_analyst"],
  "/nst2": ["platform_admin", "nisr_analyst"],
  "/financial-inclusion": ["platform_admin", "nisr_analyst"],
  "/data-upload": ["platform_admin", "nisr_analyst"],
  "/datasets": ["platform_admin", "nisr_analyst"],
  "/programmes": ["platform_admin", "programme_owner"],
  "/evidence": ["platform_admin"],
  "/cooperative": ["platform_admin", "cooperative"],
  "/cooperatives": ["platform_admin", "beneficiary"],
  "/government": ["platform_admin", "gov_district", "gov_sector", "gov_cell"],
  "/agent": ["platform_admin", "field_agent"],
  "/beneficiary": ["platform_admin", "beneficiary"],
  "/jobs": ["platform_admin", "job_applicant"],
  "/map": ["platform_admin", "nisr_analyst", "programme_owner", "gov_district", "gov_sector", "gov_cell"],
  "/ussd-control": ["platform_admin"],
  "/account-requests": ["platform_admin"],
  "/settings": ["platform_admin", "nisr_analyst", "programme_owner", "cooperative", "gov_district", "gov_sector", "gov_cell", "field_agent", "beneficiary", "job_applicant"],
};

// Sub-navigation ids that the pages themselves accept, from PM_TABS, GOV_TABS and MEMBER_TABS.
export const ROUTE_TABS = {
  "/programmes": ["overview", "requests", "agents", "beneficiaries", "cooperatives", "jobs", "payments", "skills"],
  "/government": ["overview", "beneficiaries", "problems", "reports", "requests", "cooperatives"],
  "/beneficiary": ["overview", "profile", "cooperatives", "space", "agent", "insurance"],
};

// Workspace sections accepted by `/ai-engine?section=`, from the SECTIONS list in src/pages/AIEngine.jsx.
export const AI_ENGINE_SECTIONS = ["overview", "evidence", "hypotheses", "agents", "reports", "access"];

export const ALL_ROLES = Object.keys(ROUTE_ACCESS["/settings"]);

// What each feature can honestly say in this build.
//   state "calculated"  - numbers are computed here from a named official source, review still outstanding.
//   state "published"   - published aggregates from another official publisher are shown, unchanged.
//   state "partial"     - part of the promise exists, the rest is missing and is named.
//   state "demo"        - the workflow runs on records that are labelled demonstration data.
//   state "unavailable" - the capability is not implemented; the destination is an explanation, not a result.
const FEATURES = [
  {
    id: "evidence-check",
    surface: "analyst-dashboard-primary",
    state: "calculated",
    reviewOutstanding: true,
    dependsOnApi: true,
    destinations: {
      default: { href: "/ai-engine?section=evidence", kind: "route" },
    },
    proof: [
      { label: "Survey evidence for one district", href: "/ai-engine?district=Gisagara" },
      { label: "Data & Methodology", href: "/datasets" },
    ],
  },
  {
    id: "support-compare",
    surface: "analyst-dashboard-primary",
    state: "unavailable",
    reviewOutstanding: true,
    destinations: {
      platform_admin: { href: "/other-analysis#support-compare", kind: "explain" },
      nisr_analyst: { href: "/other-analysis#support-compare", kind: "explain" },
    },
    fallback: { reason: "discover.blocked.supportCompareNotBuilt" },
    proof: [{ label: "What a same-budget comparison needs", href: "/other-analysis#support-compare" }],
  },
  {
    id: "resilience",
    surface: "analyst-dashboard-primary",
    state: "partial",
    reviewOutstanding: false,
    destinations: {
      default: { href: "/financial-inclusion", kind: "route" },
    },
    proof: [
      { label: "FinScope survey evidence", href: "/financial-inclusion" },
      { label: "How the two financial measures differ", href: "/datasets" },
    ],
  },
  {
    id: "action-tracking",
    surface: "analyst-dashboard-primary",
    state: "demo",
    reviewOutstanding: false,
    destinations: {
      platform_admin: { href: "/programmes?tab=requests", kind: "route" },
      programme_owner: { href: "/programmes?tab=requests", kind: "route" },
      field_agent: { href: "/agent", kind: "route" },
      gov_district: { href: "/government?tab=requests", kind: "route" },
      gov_sector: { href: "/government?tab=requests", kind: "route" },
      gov_cell: { href: "/government?tab=requests", kind: "route" },
      beneficiary: { href: "/beneficiary", kind: "route" },
      // A national analyst has no programme panel: the guard does not allow it, so the honest destination is the
      // delivery view on the analyst's own page, which shows the same requests without letting them be actioned.
      nisr_analyst: { href: "/other-analysis#programme-delivery", kind: "explain" },
    },
    fallback: { reason: "discover.blocked.noProgrammeAccess" },
    proof: [
      { label: "Programme delivery beside poverty", href: "/other-analysis#programme-delivery" },
      { label: "Programme Management", href: "/programmes?tab=requests" },
    ],
  },
  {
    id: "vup-rules",
    surface: "programme-context",
    state: "unavailable",
    reviewOutstanding: true,
    destinations: {
      platform_admin: { href: "/programmes?tab=beneficiaries", kind: "explain" },
      programme_owner: { href: "/programmes?tab=beneficiaries", kind: "explain" },
    },
    fallback: { reason: "discover.blocked.noRulesLoaded" },
    proof: [{ label: "Program members on record", href: "/programmes?tab=beneficiaries" }],
  },
  {
    id: "referral-followup",
    surface: "programme-context",
    state: "demo",
    reviewOutstanding: false,
    destinations: {
      platform_admin: { href: "/programmes?tab=jobs", kind: "route" },
      programme_owner: { href: "/programmes?tab=jobs", kind: "route" },
      job_applicant: { href: "/jobs", kind: "route" },
      beneficiary: { href: "/beneficiary", kind: "route" },
      field_agent: { href: "/agent", kind: "route" },
    },
    fallback: { reason: "discover.blocked.noReferralView" },
    proof: [{ label: "Jobs and recruitment records", href: "/programmes?tab=jobs" }],
  },
  {
    id: "quality-checks",
    surface: "method-context",
    state: "calculated",
    reviewOutstanding: true,
    dependsOnApi: true,
    destinations: {
      // The checks live in the governed workspace, which the analysts and the platform admin own;
      // every other role is refused there and this feature says why instead of redirecting.
      default: { href: "/datasets", kind: "route" },
    },
    proof: [
      { label: "Official source register", href: "/datasets" },
      { label: "Survey evidence for one district", href: "/ai-engine?district=Gisagara" },
    ],
  },
  {
    id: "model-evaluation",
    surface: "method-context",
    state: "unavailable",
    reviewOutstanding: true,
    dependsOnApi: true,
    destinations: {
      platform_admin: { href: "/ai-engine?section=agents", kind: "explain" },
      nisr_analyst: { href: "/ai-engine?section=agents", kind: "explain" },
    },
    fallback: { reason: "discover.blocked.noValidatedModel" },
    proof: [{ label: "AI research workspace", href: "/ai-engine?section=agents" }],
  },
];

export const JUDGE_FEATURES = FEATURES;

export const featureById = (id) => FEATURES.find((item) => item.id === id) || null;

const parseHref = (href) => {
  const [pathAndQuery, hash = ""] = String(href || "").split("#");
  const [pathname, query = ""] = pathAndQuery.split("?");
  const params = new URLSearchParams(query);
  return { pathname, tab: params.get("tab"), section: params.get("section"), hash };
};

// A destination is only valid when the guard allows the route, the page accepts the tab or section it is given,
// and no hash points at an anchor the application does not render.
export function isKnownHref(href) {
  const { pathname, tab, section, hash } = parseHref(href);
  if (!ROUTE_ACCESS[pathname]) return false;
  if (tab && !(ROUTE_TABS[pathname] || []).includes(tab)) return false;
  if (section && !AI_ENGINE_SECTIONS.includes(section)) return false;
  if (hash && !["support-compare", "programme-delivery"].includes(hash)) return false;
  return true;
}

export const routeAllows = (role, href) => {
  const { pathname } = parseHref(href);
  return Boolean(ROUTE_ACCESS[pathname]?.includes(role));
};

// The one function the UI is allowed to use before it shows a link.
// Returns { available, href, kind, feature } or, when the role cannot reach any compliant screen,
// { available: false, feature, reason } with a short reason key instead of a redirect.
export function resolveFeature(id, role) {
  const feature = featureById(id);
  if (!feature) return { available: false, feature: null, reason: "discover.blocked.unknownFeature" };
  const entry = feature.destinations[role] || feature.destinations.default;
  if (!entry || !isKnownHref(entry.href) || !routeAllows(role, entry.href)) {
    return { available: false, feature, reason: feature.fallback?.reason || "discover.blocked.roleNotPermitted", kind: entry?.kind };
  }
  return { available: true, feature, href: entry.href, kind: entry.kind };
}

export const featuresForSurface = (surface) => FEATURES.filter((item) => item.surface === surface);

export const dashboardFeatures = (role) =>
  ANALYST_DASHBOARD_FEATURES.map((id) => resolveFeature(id, role)).filter((item) => item.available);

// Whether the governed research API is reachable in this build. When it is not, screens that depend on it must say
// so; nothing here invents a run, a report or a validation result.
export const governedApiConfigured = () => Boolean(import.meta.env?.VITE_IREME_API_URL);

// The judge walkthrough: five durable steps. Anchors are `data-judge` markers, never text or position, so a
// renamed heading cannot break the tour. Availability is decided with the same guard table the cards use.
const TOUR_STEPS = [
  { id: "problem", anchor: "headline-findings", featureId: "evidence-check", roleHrefs: { default: "/" } },
  { id: "evidence", anchor: "survey-evidence", featureId: "evidence-check", roleHrefs: { default: "/ai-engine?district=Gisagara" } },
  { id: "compare", anchor: "support-compare", featureId: "support-compare", roleHrefs: { default: "/other-analysis#support-compare" } },
  {
    id: "action",
    anchor: "requests",
    featureId: "action-tracking",
    roleHrefs: {
      platform_admin: "/programmes?tab=requests",
      programme_owner: "/programmes?tab=requests",
      field_agent: "/agent",
      gov_district: "/government?tab=requests",
      gov_sector: "/government?tab=requests",
      gov_cell: "/government?tab=requests",
      nisr_analyst: "/other-analysis#programme-delivery",
    },
    altAnchors: {
      nisr_analyst: "programme-delivery",
      field_agent: "agent-day",
      // A district, sector or cell officer works the same queue inside their own panel, under its own marker.
      gov_district: "gov-requests",
      gov_sector: "gov-requests",
      gov_cell: "gov-requests",
    },
  },
  { id: "report", anchor: "reports", featureId: "quality-checks", roleHrefs: { default: "/ai-engine?section=reports" } },
];

export function judgeTour(role) {
  return TOUR_STEPS.map((step) => {
    const href = step.roleHrefs[role] || step.roleHrefs.default;
    const anchor = step.altAnchors?.[role] || step.anchor;
    if (!href || !routeAllows(role, href)) {
      return { ...step, available: false, anchor, href: null, feature: step.feature || null, reason: "discover.blocked.roleNotPermitted" };
    }
    return { ...step, available: true, anchor, href, reason: null };
  });
}
