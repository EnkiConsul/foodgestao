import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isAlreadyRegisteredSignup } from "@/lib/authSignupSignals";
import { logAudit } from "@/lib/audit";
import { descreverAparelho, obterSessionIdLocal } from "@/lib/auth/deviceSession";

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

    // Sessão única: o aparelho que acabou de entrar assume a conta e derruba os outros.
    const assumirSessao = async () => {
      try {
        await supabase.rpc("auth_sessao_assumir", {
          _session_id: obterSessionIdLocal(),
          _device: descreverAparelho(),
        });
        await supabase.auth.signOut({ scope: "others" });
      } catch {
        /* não bloqueia a entrada se o registro do aparelho falhar */
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      applySession(session);
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        setTimeout(() => logResumeOnce(session), 0);
      }
      if (event === "SIGNED_IN") {
        setTimeout(() => void assumirSessao(), 0);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session);
      logResumeOnce(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Monitora, em tempo real, se outro aparelho assumiu esta conta.
  useEffect(() => {
    if (!user?.id) return;
    const local = obterSessionIdLocal();

    const derrubar = async () => {
      try {
        sessionStorage.removeItem(`audit_resume_${user.id}`);
      } catch {
        /* ignora */
      }
      await supabase.auth.signOut();
      queryClient.clear();
      toast.error("Sua conta foi desconectada porque foi feito login em outro aparelho.", {
        duration: 10000,
      });
      navigate("/auth", { replace: true });
    };

    const canal = supabase
      .channel(`sessao-unica-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "auth_user_security_state",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const ativa = (payload.new as { active_session_id?: string | null } | null)?.active_session_id;
          if (ativa && ativa !== local) void derrubar();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [user?.id, navigate, queryClient]);

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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      // registra a entrada no sistema na Auditoria (aba Acessos)
      if (data.user?.id) sessionStorage.setItem(`audit_resume_${data.user.id}`, "1");
      void logAudit("user_signed_in", "auth", null, { method: "password" });
    }
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await logAudit("user_signed_out", "auth");
    if (user?.id) sessionStorage.removeItem(`audit_resume_${user.id}`);
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
