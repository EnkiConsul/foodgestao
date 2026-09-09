import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isAlreadyRegisteredSignup } from "@/lib/authSignupSignals";
import { logAudit } from "@/lib/audit";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean; alreadyRegistered?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Evita re-renders/refetch em cascata: só atualiza quando o user.id muda
    // (token refresh mantém o mesmo user, mas devolve um objeto novo).
    const applySession = (next: Session | null) => {
      setSession((prev) => (prev?.access_token === next?.access_token ? prev : next));
      setUser((prev) => {
        const nextUser = next?.user ?? null;
        if (prev?.id === nextUser?.id) return prev;
        return nextUser;
      });
      setLoading(false);
    };

    // Registra a retomada de sessão (usuário volta ao sistema já logado) uma
    // única vez por aba, para a aba "Acessos" da Auditoria.
    const logResumeOnce = (session: Session | null) => {
      if (!session?.user) return;
      const key = `audit_resume_${session.user.id}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      void logAudit("user_session_resumed", "auth");
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      applySession(session);
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        setTimeout(() => logResumeOnce(session), 0);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session);
      logResumeOnce(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    const alreadyRegistered = !error && isAlreadyRegisteredSignup(data);
    return {
      error: error as Error | null,
      alreadyRegistered,
      needsEmailConfirmation: !error && !alreadyRegistered && !data?.session,
    };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      // registra a entrada no sistema na Auditoria (aba Acessos)
      void logAudit("user_signed_in", "auth", null, { method: "password" });
    }
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await logAudit("user_signed_out", "auth");
    await supabase.auth.signOut();
    queryClient.clear();
    navigate("/auth", { replace: true });
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
