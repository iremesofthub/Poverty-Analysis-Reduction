import React, { createContext, useCallback, useContext, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { signOutOfDatabase, supabaseConfigured } from "@/lib/supabaseClient";
import { resolveRole } from "@/lib/roleResolution.js";

const KEY = "ireme_demo_user";
const DemoAuthContext = createContext(null);

export const DemoAuthProvider = ({ children }) => {
  const [demoUser, setDemoUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY));
    } catch {
      return null;
    }
  });

  const loginAs = useCallback((account) => {
    localStorage.setItem(KEY, JSON.stringify(account));
    setDemoUser(account);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(KEY);
    setDemoUser(null);
    signOutOfDatabase().finally(() => { window.location.href = `${import.meta.env.BASE_URL}login`; });
  }, []);

  return (
    <DemoAuthContext.Provider value={{ demoUser, loginAs, logout }}>{children}</DemoAuthContext.Provider>
  );
};

export const useDemoAuth = () => {
  const ctx = useContext(DemoAuthContext);
  if (!ctx) throw new Error("useDemoAuth must be used within DemoAuthProvider");
  return ctx;
};

export const useRole = () => {
  const { demoUser } = useDemoAuth();
  const { profile } = useAuth();
  // A browser-stored demo role is only consulted when no database is configured. Once Supabase is in play
  // the role comes from the signed-in account's profile row, so editing `ireme_demo_user` in devtools
  // cannot upgrade a hosted deployment's access. The rule itself lives in `roleResolution.js`, where
  // `roleResolution.test.mjs` proves both branches offline.
  return resolveRole({
    supabaseConfigured,
    profileRole: profile?.role ?? null,
    demoRole: demoUser?.role ?? null,
  });
};
