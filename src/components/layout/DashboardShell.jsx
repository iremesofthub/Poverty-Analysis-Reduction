import React, { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { Menu, X } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import Brand from "@/components/layout/Brand";
import GuidedTour from "@/components/tour/GuidedTour";
import JudgeWalkthrough from "@/components/discovery/JudgeWalkthrough";
import { useAuth } from "@/lib/AuthContext";
import { useDemoAuth, useRole } from "@/lib/DemoAuthContext";
import { supabaseConfigured } from "@/lib/supabaseClient";
import { hackathonDemoEnabled, isHostedDemoSession } from "@/lib/hackathonDemo.js";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";

export default function DashboardShell() {
  const [open, setOpen] = useState(false);
  const [tourRequest, setTourRequest] = useState(0);
  const [judgeRequest, setJudgeRequest] = useState(0);
  
  const role = useRole();
  const { user, isAuthenticated } = useAuth();
  const { demoUser } = useDemoAuth();
  // A demo session on a deployment that does have Supabase configured must say so on every screen.
  const hostedDemo = isHostedDemoSession({ flagEnabled: hackathonDemoEnabled, supabaseConfigured, demoUser, isAuthenticated });
  const tourScope = `${demoUser ? `demo:${demoUser.role}` : user?.id || user?.email || "visitor"}:${role}`;
  const startTour = () => setTourRequest((request) => request + 1);
  // A second counter, so the judge walkthrough can start without disturbing the educational page tour.
  const startJudgeTour = () => setJudgeRequest((request) => request + 1);

  return (
    <div className="min-h-screen bg-canvas font-body text-ink antialiased">
      <div className="flex">
        <aside className="sticky top-0 z-40 hidden h-screen max-h-dvh w-[238px] self-start shrink-0 border-r border-hairline bg-white lg:block">
          <Sidebar onStartTour={startTour} onStartJudgeTour={startJudgeTour} />
        </aside>

        <div className="min-w-0 flex-1">
          <div className="flex h-14 items-center justify-between border-b border-hairline bg-white px-4 lg:hidden">
            <Brand />
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <button
                onClick={() => setOpen(true)}
                className="grid h-8 w-8 place-items-center rounded-md border border-hairline text-sub"
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" />
              </button>
            </div>
          </div>
          {hostedDemo && (
            <div className="border-b border-[#FEDF89] bg-[#FFFAEB] px-4 py-2 text-[12px] leading-relaxed text-[#93570A] sm:px-6" role="status">
              <strong className="font-semibold">Demonstration session.</strong>{" "}
              {demoUser?.name || "A panel role"} is browsing the published NISR statistics from the live data store; nothing here is a signed-in account, and uploads, approvals and household records stay closed.{" "}
              <Link to="/login" className="font-medium underline underline-offset-2">Sign in</Link> to use the whole platform.
            </div>
          )}
          <Outlet context={{ startTour, startJudgeTour }} />
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[#0A2540]/30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-[270px] flex-col bg-white shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 grid h-7 w-7 place-items-center rounded-md text-sub hover:bg-canvas"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <Sidebar onStartTour={startTour} onStartJudgeTour={startJudgeTour} />
          </div>
        </div>
      )}

      <GuidedTour key={tourScope} role={role} scope={tourScope} request={tourRequest} onMenuChange={setOpen} />
      <JudgeWalkthrough role={role} request={judgeRequest} />
    </div>
  );
}
