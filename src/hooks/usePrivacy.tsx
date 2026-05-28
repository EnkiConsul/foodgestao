import { createContext, useContext, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface PrivacyContextType {
  privacyMode: boolean;
  togglePrivacy: () => Promise<void>;
  mask: (value: string) => string;
  maskBRL: (value: number) => string;
}

const PrivacyContext = createContext<PrivacyContextType>({
  privacyMode: false,
  togglePrivacy: async () => {},
  mask: (v) => v,
  maskBRL: (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
});

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["privacy-mode", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("privacy_mode")
        .eq("user_id", user!.id)
        .single();
      return data;
    },
    staleTime: 30_000,
  });

  const privacyMode = profile?.privacy_mode ?? false;

  const togglePrivacy = async () => {
    if (!user) return;
    const next = !privacyMode;
    queryClient.setQueryData(["privacy-mode", user.id], { privacy_mode: next });
    const { error } = await supabase
      .from("profiles")
      .update({ privacy_mode: next })
      .eq("user_id", user.id);
    if (error) {
      queryClient.setQueryData(["privacy-mode", user.id], { privacy_mode: !next });
    }
    queryClient.invalidateQueries({ queryKey: ["privacy-mode", user.id] });
  };

  const mask = (value: string) => (privacyMode ? "••••" : value);

  const maskBRL = (value: number) => {
    if (privacyMode) return "R$ ••••";
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  return (
    <PrivacyContext.Provider value={{ privacyMode, togglePrivacy, mask, maskBRL }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
