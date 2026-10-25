import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type ProfileChanges } from "./api";
import type { Me } from "./types";

interface AuthState {
  me: Me | null;
  loading: boolean;
  googleClientId: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signInWithGoogle: (credential: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (changes: ProfileChanges) => Promise<void>;
  deleteAccount: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const SIGNED_OUT: Me = {
  authenticated: false, is_guest: false, email: null, display_name: null, experience_level: "beginner",
  weekly_goal_days: 3, has_password: false, has_google: false, created_at: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setMe(await api.me().catch(() => SIGNED_OUT));
  }, []);

  useEffect(() => {
    void refresh();
    api.config().then((c) => setGoogleClientId(c.google_client_id)).catch(() => setGoogleClientId(null));
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      me,
      loading: me === null,
      googleClientId,
      refresh,
      signIn: async (email, password) => setMe(await api.logIn(email, password)),
      signUp: async (email, password, name) => setMe(await api.signUp(email, password, name)),
      signInWithGoogle: async (credential) => setMe(await api.google(credential)),
      signOut: async () => {
        await api.logOut();
        window.google?.accounts.id.disableAutoSelect();
        setMe(SIGNED_OUT);
      },
      updateProfile: async (changes) => setMe(await api.updateProfile(changes)),
      deleteAccount: async () => {
        await api.deleteAccount();
        setMe(SIGNED_OUT);
      },
    }),
    [me, googleClientId, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export const displayName = (me: Me | null) => me?.display_name || me?.email?.split("@")[0] || "Yogi";
export const initials = (me: Me | null) =>
  displayName(me)
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
