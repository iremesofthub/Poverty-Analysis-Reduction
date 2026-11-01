import { Eye, Sparkles, TriangleAlert } from "lucide-react";
import { navSlug } from "../../lib/roles.js";

// The guided tour is described here as data only. Three rules keep it from breaking again:
//   1. A step points at a stable marker, the data-tour="..." attribute (or the `tour` prop of <Card>). Never a CSS
//      class, a heading's text or a position, so renaming or moving things on a page cannot break it.
//   2. The menu steps are built from the menu the person actually sees (navForRole), so a hidden item is never shown.
//   3. All words live in the translation files: tour.steps.<id>.{title,text}, tour.intro.<page>, nav.<page>.
// A step whose marker is not on the screen (for example a card that is empty for this person) is skipped.

const step = (id, target = id, extra = {}) => ({ id, target, ...extra });
const inMenu = { menu: true };

const ANALYSIS_STEPS = [
  step("analysis-filter"), step("analysis-findings"), step("analysis-poverty-chart"),
  step("analysis-chart-eye", "analysis-poverty-chart", { selector: '[data-tour="chart-explanation"]', icon: Eye }),
  step("analysis-chart-ai", "analysis-poverty-chart", { selector: '[data-tour="chart-ai"]', icon: Sparkles }),
  step("analysis-certainty"),
  step("analysis-changes"),
  step("analysis-data-note", "analysis-trends", { selector: '[data-tour="data-note"]', icon: TriangleAlert }),
  step("analysis-sources"), step("analysis-export"),
];

const OTHER_ANALYSIS_STEPS = [
  step("analysis-filter"), step("analysis-support"), step("support-views"), step("support-scatter"),
  step("analysis-needs"), step("analysis-priority"),
];

export const PAGE_STEPS = {
  "/": ANALYSIS_STEPS,
  "/other-analysis": OTHER_ANALYSIS_STEPS,
  "/ai-engine": [step("inv-form"), step("inv-tabs"), step("inv-history")],
  "/nst2": [step("nst2-intro"), step("nst2-latest"), step("nst2-targets")],
  "/financial-inclusion": [step("financial-intro"), step("financial-guide"), step("financial-bnr"), step("financial-finscope")],
  "/evidence": [step("ev-payments"), step("ev-journey"), step("ev-mix"), step("ev-table")],
  "/programmes": [
    step("sidebar-subnav", "sidebar-subnav", { id: "programmes-subnav", ...inMenu }),
    step("pm-programme-select"),
    step("overview-review-requests"),
    step("overview-kpis"),
    step("overview-skills-chart"),
    step("overview-programmes"),
    step("overview-cooperatives"),
    step("overview-awards"),
    step("agents-search"),
    step("agents-district-filter"),
    step("agents-add-agent"),
    step("agents-list"),
    step("agent-open"),
    step("members-search"),
    step("members-district-filter"),
    step("members-health-filter"),
    step("members-table"),
    step("coops-kpis"),
    step("coops-filters"),
    step("coops-list"),
    step("jobs-post-job"),
    step("jobs-list"),
    step("payments-kpis"),
    step("payments-record-obligation"),
    step("payments-history"),
    step("skills-kpis"),
    step("skills-catalog"),
    step("skills-awards"),
    step("skills-award-button"),
    step("requests-kpis"),
    step("requests-filters"),
    step("requests-search"),
    step("requests-list"),
  ],
  "/cooperatives": [step("coop-mine"), step("coop-requests")],
  "/cooperative": [step("coopp-requests"), step("coopp-members"), step("coopp-about"), step("coopp-activity")],
  "/government": [step("sidebar-subnav", "sidebar-subnav", { id: "government-subnav", ...inMenu }), step("gov-content"), step("gov-members"), step("gov-coop-leaders")],
  "/agent": [step("agent-day"), step("agent-visits"), step("agent-record"), step("agent-problems")],
  "/beneficiary": [step("me-payment"), step("me-programmes"), step("me-complaint"), step("member-profile"), step("member-coop-switcher"), step("member-coop-360"), step("member-coop-members"), step("member-space"), step("member-vote"), step("member-announcements"), step("member-agent"), step("member-visits"), step("member-insurance")],
  "/jobs": [step("job-application"), step("job-open")],
  "/map": [step("map-layers"), step("map-canvas"), step("map-legend"), step("map-detail"), step("map-list")],
  "/ussd-control": [step("ussd-stats"), step("ussd-sessions"), step("ussd-errors"), step("ussd-blocked"), step("ussd-audit")],
  "/account-requests": [step("account-request-list")],
  "/data-upload": [step("upload-intro"), step("upload-form"), step("upload-preview"), step("upload-review")],
  "/datasets": [step("ds-intro"), step("ds-list"), step("ds-dictionary")],
};

export const hasTour = (pathname) => Boolean(PAGE_STEPS[pathname]);

// Translation key of the one-line description of a page (also used by the "i" icon in the page header).
export const introKey = (pathname) => `tour.intro.${navSlug(pathname)}`;

// Builds the whole tour for one page and one person: welcome, the page's own steps, the menu, then each menu item
// that person can see, and last the tour button. `navItems` is the person's own menu, so nothing hidden is shown.
export function buildTour(pathname, navItems) {
  const pageSteps = PAGE_STEPS[pathname];
  if (!pageSteps) return [];
  const slug = navSlug(pathname);
  const pages = navItems.filter((item) => item.to !== pathname);
  return [
    { id: "welcome", soft: true, target: "page-title", titleKey: "tour.welcome", titleValues: { page: `nav.${slug}` }, textKey: introKey(pathname) },
    ...pageSteps.map((item) => ({ ...item, titleKey: `tour.steps.${item.id}.title`, textKey: `tour.steps.${item.id}.text` })),
    { id: "menu", menu: true, target: "sidebar-nav", titleKey: "tour.menu.title", textKey: pages.length ? "tour.menu.text" : "tour.menu.textAlone" },
    ...pages.map((item) => ({ id: `nav-${navSlug(item.to)}`, menu: true, target: `nav-${navSlug(item.to)}`, titleKey: `nav.${navSlug(item.to)}`, textKey: introKey(item.to) })),
    { id: "again", menu: true, target: "take-tour", titleKey: "tour.again.title", textKey: "tour.again.text" },
  ];
}
