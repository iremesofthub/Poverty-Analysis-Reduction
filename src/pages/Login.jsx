import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase, supabaseConfigured } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Github, LogIn, Smartphone, LayoutDashboard, BarChart3, Layers, Users,
  Building2, MapPin, Home, ShieldCheck, UserRound, Briefcase,
} from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { appAbsoluteUrl, safeReturnTo } from "@/lib/authReturnTo";
import { useDemoAuth } from "@/lib/DemoAuthContext";
import { ROLES, findDemoAccount, publicAccount, roleHome } from "@/lib/roles";
import { findCooperativeAccount } from "@/lib/cooperatives";
import { signInToDatabase } from "@/lib/supabaseClient";

const googleOAuthConfigured = import.meta.env.VITE_SUPABASE_GOOGLE_ENABLED === "true";
const githubOAuthConfigured = import.meta.env.VITE_SUPABASE_GITHUB_ENABLED === "true";

// One password for every competition account, chosen by the team running the event.
// The judge link is private and each button signs in for real against Supabase; the
// role each account actually holds is still loaded from the protected profile row.
const PANEL_PASSWORD = "AisLQYCY54!ZUauVQi77";

// Hackathon panel identities are real Supabase accounts. Each shortcut performs a real
// sign-in with the shared competition password, then still loads the protected profile role.
const SUPABASE_PANEL_SHORTCUTS = [
  { label: "Platform Admin", email: "admin@platform.demo", icon: LayoutDashboard, description: "Every panel, account and setting" },
  { label: "NISR Analyst", email: "analyst@nisr.demo", icon: BarChart3, description: "Published NISR statistics and the AI Engine" },
  { label: "Programme Account", email: "vup@programmes.demo", icon: Layers, description: "Programme, members, agents and payments" },
  { label: "Cooperative", email: "twiyubake-cooperative@coops.demo", icon: Users, description: "Run one cooperative" },
  { label: "District Officer", email: "district@gov.demo", icon: Building2, description: "Figures for the district" },
  { label: "Sector Leader", email: "sector@gov.demo", icon: MapPin, description: "Figures for the sector" },
  { label: "Cell Leader", email: "cell@gov.demo", icon: Home, description: "Figures for the cell" },
  { label: "Field Agent", email: "agent@field.demo", icon: ShieldCheck, description: "Visits and problem reports" },
  { label: "Program Member", email: "beneficiary@people.demo", icon: UserRound, description: "Benefits, payments and complaints" },
  { label: "Job Applicant", email: "applicant@people.demo", icon: Briefcase, description: "Open positions and applications" },
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();
  const { demoUser, loginAs } = useDemoAuth();

  if (!supabaseConfigured && demoUser) {
    return <Navigate to={roleHome(demoUser.role)} replace />;
  }

  const finishDatabaseLogin = async (emailAddress, passwordValue) => {
    if (!supabase) throw new Error("Sign-in is not configured.");
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: emailAddress,
      password: passwordValue,
    });
    if (signInError) throw signInError;
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", signInData.user.id)
      .maybeSingle();
    if (profileError || !profile?.role || !ROLES[profile.role]) {
      await supabase.auth.signOut();
      throw new Error(profileError
        ? "We could not load access for this account. Please try again or contact the platform administrator."
        : "This account does not have an approved platform role yet. Contact the platform administrator.");
    }
    const hasRequestedDestination = new URLSearchParams(window.location.search).has("returnTo");
    const destination = hasRequestedDestination && returnTo !== "/" ? returnTo : roleHome(profile.role);
    navigate(destination, { replace: true });
  };

  const ROLE_MAP = {
    "Platform Admin": "platform_admin",
    "NISR Analyst": "nisr_analyst",
    "Programme Account": "programme_owner",
    "Cooperative": "cooperative",
    "District Officer": "gov_district",
    "Sector Leader": "gov_sector",
    "Cell Leader": "gov_cell",
    "Field Agent": "field_agent",
    "Program Member": "beneficiary",
    "Job Applicant": "job_applicant",
  };

  // Every panel button always appears: on a hosted build each one signs in for real with
  // that role's own account, and only the local preview falls back to a browser-stored role.
  const panelShortcuts = SUPABASE_PANEL_SHORTCUTS;

  const handlePanelShortcut = async (account) => {
    setError("");
    setLoading(true);
    try {
      if (supabaseConfigured) {
        // Real Supabase sign-in; the destination is the role the profile row actually holds.
        await finishDatabaseLogin(account.email, PANEL_PASSWORD);
      } else {
        // Unconfigured local preview: a browser-stored demo identity, no Supabase involved.
        const role = ROLE_MAP[account.label];
        if (!role) throw new Error("Unknown role: " + account.label);
        loginAs(publicAccount({
          ...account,
          role,
          name: account.label,
          title: ROLES[role]?.label ?? account.label,
        }));
        navigate(roleHome(role), { replace: true });
      }
    } catch (err) {
      setError(err.message || "Panel access could not be started.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    // Browser-stored demo roles are available only in an unconfigured local preview.
    const demo = supabaseConfigured ? null : findDemoAccount(email, password) || findCooperativeAccount(email, password);
    if (demo) {
      await signInToDatabase(demo.email, password);
      loginAs(publicAccount(demo));
      navigate(roleHome(demo.role), { replace: true });
      setLoading(false);
      return;
    }
    try {
      if (!supabase) throw new Error("Sign-in is not configured.");
      await finishDatabaseLogin(email, password);
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider) => {
    setError("");
    if (!supabase) {
      setError("Connect Supabase to enable Google and GitHub sign-in.");
      return;
    }
    setLoading(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: appAbsoluteUrl(returnTo) },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      const providerName = provider === "github" ? "GitHub" : "Google";
      setError(err.message || `${providerName} sign-in could not start. Check its Supabase OAuth configuration.`);
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Sign in"
      subtitle="Use your Ireme Insight account"
      wide
      footer={
        <>
          Don't have an account?{" "}
          <Link to={"/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "")} className="text-primary font-medium hover:underline">
            Create account
          </Link>
        </>
      }
    >
      <div className="mb-5 rounded-lg border border-[#dcefe0] bg-[#f5fbf3] px-3.5 py-3">
        <p className="text-[12.5px] font-semibold text-ink">Sign in with your account</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-sub">Use your registered email and password.</p>
      </div>
      <Link to="/ussd-sim" className="mb-5 flex items-center gap-3 rounded-lg border border-[#D9D6FE] bg-[#F5F3FF] px-3.5 py-3 transition-colors hover:bg-[#F0EEFF]">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-white text-brand"><Smartphone className="h-4 w-4" aria-hidden="true" /></span>
        <span><span className="block text-[12px] font-semibold text-ink">Test the USSD mobile simulator</span><span className="mt-0.5 block text-[11px] text-sub">Open the basic-phone demo without signing in.</span></span>
      </Link>
      {supabaseConfigured && googleOAuthConfigured && <Button
        variant="outline"
        className="mb-3 h-10 w-full border-[#e2e4e1] bg-[#f4f5f3] text-sm font-normal text-ink hover:bg-[#eceeeb]"
        onClick={() => handleOAuth("google")}
        disabled={loading}
      >
        <GoogleIcon className="mr-2 h-4 w-4" />
        Sign in with Google
      </Button>}

      {supabaseConfigured && githubOAuthConfigured && <Button
        variant="outline"
        className="h-10 w-full border-[#e2e4e1] bg-[#f4f5f3] text-sm font-normal text-ink hover:bg-[#eceeeb]"
        onClick={() => handleOAuth("github")}
        disabled={loading}
      >
        <Github className="mr-2 h-4 w-4 text-[#414750]" />
        Sign in with GitHub
      </Button>}

      {supabaseConfigured && (googleOAuthConfigured || githubOAuthConfigured) && <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#e2e4e1]" /></div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-3 text-sub">OR</span>
        </div>
      </div>}

      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-[13px] font-normal text-ink"><span aria-hidden="true" className="text-[#dc5248]">*</span> Email</Label>
          <div>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-md border-[#dfe2df] bg-[#f4f5f3] pl-3 text-[13px] shadow-none placeholder:text-[#8b918d] focus-visible:ring-brand"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-[13px] font-normal text-ink"><span aria-hidden="true" className="text-[#dc5248]">*</span> Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 rounded-md border-[#dfe2df] bg-[#f4f5f3] pl-3 text-[13px] shadow-none placeholder:text-[#8b918d] focus-visible:ring-brand"
              required
            />
          </div>
        </div>
        <Button type="submit" className="mt-1 h-10 w-full bg-[#78c66b] font-medium text-white hover:bg-[#69b95d]" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            supabaseConfigured ? "Continue" : "Log in"
          )}
        </Button>
      </form>

      {/* Competition panel accounts — every card performs a real sign-in on hosted builds */}
      <div className="mt-6 border-t border-border pt-5">
        <p className="text-[12.5px] font-semibold text-ink">Open a panel</p>
        <p className="mb-3 mt-0.5 text-[11px] leading-relaxed text-sub">
          {supabaseConfigured
            ? "Each card signs in with its own competition account — one click and the panel opens."
            : "Choose a role to continue without signing in."}
        </p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {panelShortcuts.map((account) => {
            const Icon = account.icon;
            return (
              <button
                key={account.email}
                type="button"
                onClick={() => handlePanelShortcut(account)}
                disabled={loading}
                className="group flex items-center gap-2.5 rounded-lg border border-border bg-white px-2.5 py-2 text-left transition-colors hover:border-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-canvas text-sub transition-colors group-hover:bg-white group-hover:text-brand">
                  <Icon className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-semibold leading-tight text-foreground">{account.label}</span>
                  <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-muted-foreground">{account.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </AuthLayout>
  );
}
