import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TERMO_PORTAL_PARAGRAFOS,
  TERMO_PORTAL_TITULO,
  TERMO_PORTAL_VERSAO,
} from "@/lib/dp/termoPortal";

async function chamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("dp-termo-portal", { body });
  if (error) throw error;
  return data as { aceito?: boolean };
}

/**
 * Portão do termo para quem já usava o portal: até aceitar a versão vigente,
 * o colaborador não acessa as telas. Falha na verificação não libera (fail-closed),
 * mas oferece nova tentativa.
 */
export function TermoPortalGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [marcado, setMarcado] = useState(false);
  const chave = ["dp_termo_portal", user?.id, TERMO_PORTAL_VERSAO];

  const status = useQuery({
    queryKey: chave,
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
    queryFn: () => chamar({ acao: "status" }),
  });

  const aceitar = useMutation({
    mutationFn: () => chamar({ acao: "aceitar", versao: TERMO_PORTAL_VERSAO }),
    onSuccess: () => {
      toast.success("Termo aceito", { description: "Registramos data, hora e dispositivo." });
      qc.setQueryData(chave, { aceito: true });
    },
    onError: () => toast.error("Não foi possível registrar o aceite. Tente novamente."),
  });

  if (status.isLoading) return <div className="p-8 text-muted-foreground">Carregando…</div>;
  if (status.data?.aceito) return <>{children}</>;

  if (status.isError) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-3">
        <p className="text-muted-foreground">Não foi possível verificar seu acesso agora.</p>
        <div className="flex flex-col gap-2">
          <Button onClick={() => status.refetch()}>Tentar Novamente</Button>
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>
            <LogOut className="mr-1.5 h-4 w-4" /> Sair da Conta
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background sm:items-center sm:justify-center sm:p-6">
      <div className="flex h-full w-full flex-col bg-card sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-lg sm:border">
        <header className="flex items-start gap-2 border-b p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h1 className="text-base font-semibold leading-snug">{TERMO_PORTAL_TITULO}</h1>
            <p className="text-xs text-muted-foreground">
              Versão {TERMO_PORTAL_VERSAO} · O termo foi atualizado. Para continuar usando o portal, leia e confirme.
            </p>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          <div className="space-y-3 text-[15px] leading-relaxed text-foreground/85">
            {TERMO_PORTAL_PARAGRAFOS.map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
        </div>
        <footer className="space-y-3 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <label className="flex min-h-11 items-start gap-2.5 text-sm">
            <Checkbox checked={marcado} onCheckedChange={(v) => setMarcado(v === true)} className="mt-0.5 h-5 w-5" />
            Li e concordo com o {TERMO_PORTAL_TITULO}, inclusive com o uso da assinatura eletrônica.
          </label>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between">
            <Button variant="outline" className="min-h-11" onClick={() => supabase.auth.signOut()}>
              <LogOut className="mr-1.5 h-4 w-4" /> Sair
            </Button>
            <Button
              className="min-h-11"
              disabled={!marcado || aceitar.isPending}
              onClick={() => aceitar.mutate()}
            >
              <Check className="mr-1.5 h-4 w-4" /> Aceitar e Continuar
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
