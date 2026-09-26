import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { buscarLimites, type LimitesAssinatura } from "@/lib/billing/limites";
import { toast } from "sonner";
import { notifyError } from "@/lib/notifyError";

export type Modulo = "financeiro" | "pessoas";

export interface MinhaAssinatura {
  id: string;
  module: Modulo | null;
  status: string;
  is_exempt: boolean;
  exempt_until: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  company_id: string | null;
  plan: any;
  addons: any[];
  planCents: number;
  addonsCents: number;
  prorataCents: number;
  totalCents: number;
}

const ativo = (a: any) => a.status === "active";

/** Situações que não devem aparecer no painel do cliente. */
const STATUS_ENCERRADO = new Set(["canceled", "expired", "incomplete_expired"]);

/** Prioridade quando há mais de uma assinatura vigente no mesmo módulo. */
const PRIORIDADE: Record<string, number> = { active: 0, trialing: 1, past_due: 2 };

/** Mantém uma única assinatura vigente por módulo, descartando as encerradas. */
function vigentesPorModulo(lista: MinhaAssinatura[]): MinhaAssinatura[] {
  const melhor = new Map<string, MinhaAssinatura>();
  lista
    .filter((s) => !STATUS_ENCERRADO.has(s.status))
    .forEach((s) => {
      const chave = (s.module ?? (s.plan as any)?.module ?? "financeiro") as string;
      const atual = melhor.get(chave);
      if (!atual) {
        melhor.set(chave, s);
        return;
      }
      const a = PRIORIDADE[s.status] ?? 9;
      const b = PRIORIDADE[atual.status] ?? 9;
      if (a < b) melhor.set(chave, s);
    });
  return [...melhor.values()].sort((x, y) =>
    (x.module ?? "") < (y.module ?? "") ? -1 : 1,
  );
}

/** Assinaturas do titular conectado, com plano, adicionais e valores. */
export function useMinhasAssinaturas() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["minhas-assinaturas", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<MinhaAssinatura[]> => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select(
          "*, plan:plans(*), addons:subscription_addons(id, quantity, status, price_cents, is_exempt, prorata_cents, prorata_billed_at, addon:plan_addons(id, code, name, description, price_cents, max_quantity))",
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const todas = (data ?? []).map((s: any) => {
        const isento =
          !!s.is_exempt && (!s.exempt_until || new Date(s.exempt_until).getTime() > Date.now());
        const addons = (s.addons ?? []) as any[];
        const planCents = isento ? 0 : Number(s.plan?.price_cents ?? 0);
        const addonsCents = isento
          ? 0
          : addons
              .filter((a) => ativo(a) && !a.is_exempt)
              .reduce((t, a) => t + Number(a.price_cents ?? 0) * Number(a.quantity ?? 1), 0);
        const prorataCents = isento
          ? 0
          : addons
              .filter((a) => ativo(a) && !a.is_exempt && !a.prorata_billed_at)
              .reduce((t, a) => t + Number(a.prorata_cents ?? 0), 0);
        return {
          ...s,
          is_exempt: isento,
          addons,
          planCents,
          addonsCents,
          prorataCents,
          totalCents: planCents + addonsCents,
        } as MinhaAssinatura;
      });

      return vigentesPorModulo(todas);
    },
  });
}

/** Consumo de limites da empresa selecionada, por módulo. */
export function useLimitesEmpresa(modulo: Modulo) {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["limites-empresa", selectedCompanyId, modulo],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<LimitesAssinatura | null> =>
      buscarLimites(selectedCompanyId!, modulo),
  });
}

/** Catálogo de adicionais disponíveis para um módulo. */
export function useAdicionaisDisponiveis(modulo: Modulo, planSlug?: string | null) {
  return useQuery({
    queryKey: ["adicionais-disponiveis", modulo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_addons")
        .select("*")
        .eq("module", modulo)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data as any[]).filter(
        (a) => !a.allowed_plan_slugs?.length || !planSlug || a.allowed_plan_slugs.includes(planSlug),
      );
    },
  });
}

/** Minhas faturas (titular). */
export function useMinhasFaturas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["minhas-faturas", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(24);
      if (error) throw error;
      return data as any[];
    },
  });
}

type Acao =
  | { action: "contratar"; subscriptionId: string; addonId: string; quantity: number }
  | { action: "quantidade"; subscriptionId: string; itemId: string; quantity: number }
  | { action: "cancelar"; subscriptionId: string; itemId: string };

const MENSAGEM: Record<Acao["action"], string> = {
  contratar: "Adicional contratado",
  quantidade: "Quantidade atualizada",
  cancelar: "Adicional cancelado",
};

/** Contratar, ajustar ou cancelar um adicional da própria assinatura. */
export function useAdicionalDaMinhaAssinatura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Acao) => {
      const { data, error } = await supabase.functions.invoke("assinatura-adicional", {
        body: payload,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return payload.action;
    },
    onSuccess: (action) => {
      qc.invalidateQueries({ queryKey: ["minhas-assinaturas"] });
      qc.invalidateQueries({ queryKey: ["limites-empresa"] });
      qc.invalidateQueries({ queryKey: ["current-subscription"] });
      toast.success(MENSAGEM[action]);
    },
    onError: (e: any) =>
      notifyError(e, {
        surface: "Assinatura",
        action: "atualizar o adicional",
        fallback: "Não foi possível concluir a contratação",
      }),
  });
}
