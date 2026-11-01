import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase, supabaseConfigured } from '@/lib/supabaseClient';

const AuthContext = createContext();
const PROFILE_FIELDS = 'id, role, programme, district, sector, cell, language, full_name, phone, member_id, agent_id, cooperative_id';

// Signed-in state comes from Supabase. A production role is loaded from the
// protected profiles row; editable auth metadata is never used for access.
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(supabaseConfigured);
  const [isLoadingProfile, setIsLoadingProfile] = useState(supabaseConfigured);
  const [authChecked, setAuthChecked] = useState(!supabaseConfigured);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setUser(error ? null : data.session?.user ?? null);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }).catch(() => {
      if (!active) return;
      setUser(null);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabaseConfigured || !supabase || !user?.id) {
      setProfile(null);
      setProfileError(null);
      setIsLoadingProfile(false);
      return undefined;
    }

    let active = true;
    setProfile(null);
    setProfileError(null);
    setIsLoadingProfile(true);

    supabase
      .from('profiles')
      .select(PROFILE_FIELDS)
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        setProfile(error ? null : data);
        setProfileError(error ?? null);
        setIsLoadingProfile(false);
      })
      .catch((error) => {
        if (!active) return;
        setProfile(null);
        setProfileError(error);
        setIsLoadingProfile(false);
      });

    return () => { active = false; };
  }, [user?.id]);

  const checkUserAuth = useCallback(async () => {
    if (!supabase) return null;
    setIsLoadingAuth(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      setUser(data.user ?? null);
      setAuthChecked(true);
      return data.user ?? null;
    } catch {
      setUser(null);
      setAuthChecked(true);
      return null;
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setProfile(null);
    const done = supabase ? supabase.auth.signOut() : Promise.resolve();
    done.finally(() => {
      if (shouldRedirect) window.location.href = `${import.meta.env.BASE_URL}login`;
    });
  };

  const navigateToLogin = () => {
    const base = import.meta.env.BASE_URL;
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `${base}login?returnTo=${encodeURIComponent(returnTo)}`;
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      profileError,
      isAuthenticated: Boolean(user),
      isLoadingAuth,
      isLoadingProfile,
      isLoadingPublicSettings: false,
      authError: null,
      appPublicSettings: null,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState: checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
