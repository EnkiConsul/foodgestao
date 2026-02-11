import { createContext, useContext, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface PrivacyContextType {
  privacyMode: boolean;
  mask: (value: string) => string;
  maskBRL: (value: number) => string;
}

const PrivacyContext = createContext<PrivacyContextType>({
  privacyMode: false,
  mask: (v) => v,
  maskBRL: (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
});

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

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

  const mask = (value: string) => (privacyMode ? "••••" : value);

  const maskBRL = (value: number) => {
    if (privacyMode) return "R$ ••••";
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  return (
    <PrivacyContext.Provider value={{ privacyMode, mask, maskBRL }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
