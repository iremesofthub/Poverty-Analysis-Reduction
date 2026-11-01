import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2, Github } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { toast } from "@/components/ui/use-toast";
import { appAbsoluteUrl, safeReturnTo } from "@/lib/authReturnTo";
import { ROLES, roleHome } from "@/lib/roles";
import { SIGNUP_ACCOUNT_TYPES, validateSignupIntent } from "@/lib/signupIntent";

const googleOAuthConfigured = import.meta.env.VITE_SUPABASE_GOOGLE_ENABLED === "true";
const githubOAuthConfigured = import.meta.env.VITE_SUPABASE_GITHUB_ENABLED === "true";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [accountType, setAccountType] = useState("job_applicant");
  const [phone, setPhone] = useState("");
  const [organisationName, setOrganisationName] = useState("");
  const [reference, setReference] = useState("");
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    try {
      validateSignupIntent({ accountType, phone, organisationName, reference });
    } catch (intentError) {
      setError(intentError.message);
      return;
    }
    setLoading(true);
    try {
      if (!supabase) throw new Error("Sign-up is not configured.");
      if (!fullName.trim()) throw new Error("Enter your name to create an account.");
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (signUpError) throw signUpError;
      setShowOtp(true);
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      const { data: verification, error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token: otpCode, type: "signup" });
      if (verifyError) throw verifyError;
      const userId = verification.user?.id;
      if (!userId) throw new Error("Email verified, but we could not load the account session. Please sign in.");
      const intent = validateSignupIntent({ accountType, phone, organisationName, reference });
      if (intent.accountType !== "job_applicant") {
        const { error: requestError } = await supabase.rpc("submit_signup_access_request", {
          p_requested_role: intent.accountType,
          p_phone: intent.phone,
          p_organisation_name: intent.organisationName || null,
          p_reference: intent.reference || null,
        });
        if (requestError) throw new Error(requestError.message);
        await supabase.auth.signOut();
        setRequestSubmitted(true);
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) throw new Error("Email verified, but account access is not ready. Contact the platform administrator.");
      if (!profile?.role || !ROLES[profile.role]) {
        throw new Error("Email verified, but this account has no approved platform role yet. Contact the platform administrator.");
      }
      const requestedDestination = new URLSearchParams(window.location.search).has("returnTo");
      const returnTo = safeReturnTo();
      const destination = requestedDestination && returnTo !== "/" ? returnTo : roleHome(profile.role);
      window.location.href = appAbsoluteUrl(destination);
    } catch (err) {
      setError(err.message || "Invalid verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    try {
      const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
      if (resendError) throw resendError;
      toast({
        title: "Code sent",
        description: "Check your email for the new code.",
      });
    } catch (err) {
      setError(err.message || "Failed to resend code");
    }
  };

  const handleOAuth = async (provider) => {
    if (!supabase) {
      setError("Connect Supabase to enable social sign-in.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: appAbsoluteUrl(safeReturnTo()) },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err.message || "Social sign-in could not start. Check the provider configuration.");
      setLoading(false);
    }
  };

  if (showOtp) {
    if (requestSubmitted) {
      const type = SIGNUP_ACCOUNT_TYPES.find((item) => item.value === accountType)?.label || "account";
      return <AuthLayout icon={Mail} title="Request sent" subtitle={`Your ${type.toLowerCase()} request is waiting for review.`}>
        <p className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] p-3 text-sm text-[#92400E]">An administrator must match your request to the programme, cooperative, or member record before access is activated. We will not give staff or member access from the sign-up form alone.</p>
        <Link to="/login" className="mt-5 block text-center text-sm font-medium text-primary hover:underline">Back to sign in</Link>
      </AuthLayout>;
    }
    return (
      <AuthLayout
        icon={Mail}
        title="Verify your email"
        subtitle={`We sent a code to ${email}`}
      >
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}
        <div className="flex justify-center mb-6">
          <InputOTP
            maxLength={6}
            value={otpCode}
            onChange={setOtpCode}
            autoFocus
            autoComplete="one-time-code"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button
          className="w-full h-12 font-medium"
          onClick={handleVerify}
          disabled={loading || otpCode.length < 6}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifying...
            </>
          ) : (
            "Verify"
          )}
        </Button>
        <p className="text-center text-sm text-muted-foreground mt-4">
          Didn't receive the code?{" "}
          <button onClick={handleResend} className="text-primary font-medium hover:underline">
            Resend
          </button>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Sign up to get started"
      footer={
        <>
          Already have an account?{" "}
          <Link
            to={"/login" + (safeReturnTo() !== "/" ? "?returnTo=" + encodeURIComponent(safeReturnTo()) : "")}
            className="text-primary font-medium hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      {accountType === "job_applicant" && supabase && googleOAuthConfigured && <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-6"
        onClick={() => handleOAuth("google")}
        disabled={loading}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </Button>}

      {accountType === "job_applicant" && supabase && githubOAuthConfigured && <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-6"
        onClick={() => handleOAuth("github")}
        disabled={loading}
      >
        <Github className="mr-2 h-4 w-4" /> Continue with GitHub
      </Button>}

      {accountType === "job_applicant" && supabase && (googleOAuthConfigured || githubOAuthConfigured) && <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="account-type">I am signing up as</Label>
          <select id="account-type" value={accountType} onChange={(event) => setAccountType(event.target.value)} className="h-12 w-full rounded-md border border-input bg-background px-3 text-sm" disabled={loading}>
            {SIGNUP_ACCOUNT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">{SIGNUP_ACCOUNT_TYPES.find((item) => item.value === accountType)?.help}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="full-name">Full name</Label>
          <Input
            id="full-name"
            type="text"
            autoComplete="name"
            maxLength={120}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="h-12"
            required
          />
        </div>
        {accountType !== "job_applicant" && <>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone number on record</Label>
            <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0788 123 456" value={phone} onChange={(event) => setPhone(event.target.value)} className="h-12" required />
          </div>
          {accountType !== "beneficiary" && <div className="space-y-2">
            <Label htmlFor="organisation">{accountType === "cooperative" ? "Cooperative name" : "Organisation or programme name"}</Label>
            <Input id="organisation" type="text" maxLength={120} value={organisationName} onChange={(event) => setOrganisationName(event.target.value)} className="h-12" required />
          </div>}
          <div className="space-y-2">
            <Label htmlFor="reference">{accountType === "beneficiary" ? "Member number (if you have one)" : "Reference (optional)"}</Label>
            <Input id="reference" type="text" maxLength={80} value={reference} onChange={(event) => setReference(event.target.value)} className="h-12" />
          </div>
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">After email verification, your request is reviewed before this account can access a programme, cooperative, or member panel.</p>
        </>}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
