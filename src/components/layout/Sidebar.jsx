import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation, useSearchParams } from "react-router-dom";
import { LogOut, Settings, CircleHelp, Compass } from "lucide-react";
import Brand from "@/components/layout/Brand";
import { useAuth } from "@/lib/AuthContext";
import { useDemoAuth, useRole } from "@/lib/DemoAuthContext";
import { supabaseConfigured } from "@/lib/supabaseClient";
import { DEMO_PANEL_ROUTES, hackathonDemoEnabled, isHostedDemoSession } from "@/lib/hackathonDemo.js";
import { navForRole, navSlug, ROLES } from "@/lib/roles";
import { judgeTour } from "@/lib/judgeFeatureRegistry";
import { PM_TABS } from "@/data/programme";
import { GOV_TABS } from "@/lib/govArea";
import { MEMBER_TABS } from "@/lib/memberTabs";
import { requestStats, useActionRequests } from "@/lib/actionRequests";
import { useProgrammeScope } from "@/lib/programmeScope";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";

const SUB_TABS = { "/programmes": PM_TABS, "/government": GOV_TABS, "/beneficiary": MEMBER_TABS };

function RequestBadge() {
  const scope = useProgrammeScope();
  const { requests } = useActionRequests();
  const waiting = requestStats(requests.filter((item) => scope.owns(item.programme))).waiting;
  return waiting > 0 ? <span className="ml-auto rounded-full bg-[#FFFAEB] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[#B54708]">{waiting}</span> : null;
}

// The sections of a panel, listed under its name in the menu instead of as tabs on the page.
function SubNav({ to }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const tabs = SUB_TABS[to];
  if (!tabs || pathname !== to) return null;
  const current = tabs.some((item) => item.id === params.get("tab")) ? params.get("tab") : "overview";
  const namespace = to === "/programmes" ? "programme.tabs" : to === "/government" ? "gov.tabs" : "member.tabs";
  return <ul data-tour="sidebar-subnav" className="ml-[19px] mt-0.5 space-y-0.5 border-l border-hairline pl-2">{tabs.map((item) => <li key={item.id}><Link to={item.id === "overview" ? to : `${to}?tab=${item.id}`} className={`flex items-center rounded-md px-2.5 py-1.5 text-[12px] transition-colors ${current === item.id ? "bg-brand-soft font-medium text-brand" : "text-[#425466] hover:bg-canvas hover:text-ink"}`} aria-current={current === item.id ? "page" : undefined}>{t(`${namespace}.${item.id}`, { defaultValue: item.label })}{item.id === "requests" && to === "/programmes" && <RequestBadge />}</Link></li>)}</ul>;
}

export default function Sidebar({ onStartTour, onStartJudgeTour }) {
  const { t } = useTranslation();
  const role = useRole();
  const { demoUser, logout: demoLogout } = useDemoAuth();
  const { user, isAuthenticated, logout: realLogout } = useAuth();
  // In a hosted demo session the menu lists only the panels the visitor can actually open, so a judge
  // never clicks through to a sign-in wall. Writes, approvals and household panels stay login-only.
  const hostedDemo = isHostedDemoSession({ flagEnabled: hackathonDemoEnabled, supabaseConfigured, demoUser, isAuthenticated });
  const groups = navForRole(role)
    .map((group) => (hostedDemo ? { ...group, items: group.items.filter((item) => DEMO_PANEL_ROUTES.includes(String(item.to).split("?")[0])) } : group))
    .filter((group) => group.items.length > 0);
  // Only offer the walkthrough when this account can actually follow more than one step of it.
  const judgeSteps = judgeTour(role).filter((item) => item.available).length;
  const navRef = useRef(null);
  const { pathname, search } = useLocation();
  // On short screens the menu scrolls inside the sidebar; keep the open page's item in view.
  useEffect(() => {
    const active = navRef.current?.querySelector('a[aria-current="page"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [pathname, search]);
  const account = demoUser || { name: user?.full_name || user?.email || "Analyst", title: ROLES[role]?.label || "User", scope: "National" };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="px-5 pb-5 pt-5">
        <Brand />
      </div>
      <nav ref={navRef} data-tour="sidebar-nav" className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 pb-6">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#8A94A6]">
              {t(`navGroups.${group.label}`, { defaultValue: group.label })}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
              const Icon = item.icon;
              const tourKey = `nav-${navSlug(item.to)}`;
              return (
                <li key={item.label}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/"}
                    data-tour={tourKey}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors ${item.sub ? "ml-[19px] border-l border-hairline !rounded-l-none" : ""} ${
                          isActive && !SUB_TABS[item.to] ? "bg-brand-soft font-medium text-brand" : isActive ? "font-medium text-brand" : "text-[#425466] hover:bg-canvas hover:text-ink"
                        }`
                      }
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.9} />
                      <span>{t(`nav.${navSlug(item.to)}`, { defaultValue: item.label })}</span>
                    </NavLink>
                    <SubNav to={item.to} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-hairline px-3 py-3">
        <div className="mb-1"><LanguageSwitcher /></div>
        <button type="button" data-tour="take-tour" onClick={onStartTour} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[12.5px] text-sub hover:bg-canvas hover:text-ink">
          <CircleHelp className="h-4 w-4" strokeWidth={1.75} />
          <span>{t("common.takeTour")}</span>
        </button>
        {judgeSteps > 1 && onStartJudgeTour && (
          <button type="button" data-judge="sidebar-entry" onClick={onStartJudgeTour} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[12.5px] text-sub hover:bg-canvas hover:text-ink">
            <Compass className="h-4 w-4" strokeWidth={1.75} />
            <span>{t("discover.tourEntry")}</span>
          </button>
        )}
        <NavLink to="/settings" data-tour="nav-settings" className={({ isActive }) => `flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-canvas hover:text-ink ${isActive ? "font-medium text-brand" : "text-sub"}`}>
          <Settings className="h-4 w-4" strokeWidth={1.75} />
          <span>{t("common.settings")}</span>
        </NavLink>
        <div className="mt-1 flex items-center justify-between rounded-md px-2 py-1.5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-[#EFF2F7] text-[10px] font-semibold text-ink">
              {account.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </div>
            <div className="leading-tight">
              <p className="max-w-[120px] truncate text-[12px] font-medium text-ink">{account.name}</p>
              <p className="text-[10.5px] text-sub">{account.title}</p>
            </div>
          </div>
          <button
            onClick={() => (demoUser ? demoLogout() : realLogout())}
            className="grid h-7 w-7 place-items-center rounded-md text-sub hover:bg-canvas hover:text-ink"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </div>
  );
}
