import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { aniversarioNoPeriodo } from "@/lib/dp/aniversarios-calendario";
import { aniversarioContratacao } from "@/lib/dp/aniversarios-contratacao";
import { useAuth } from "@/hooks/useAuth";

export type AnivItem = {
  id: string;
  colaboradorId: string;
  nome: string;
  cargo: string | null;
  email: string | null;
  unidade: string | null;
  unidadeId: string | null;
  tipo: "nascimento" | "contratacao";
  data: Date;
  diaMes: string; // "15/07"
  anosCompletos: number | null;
  faltamDias: number;
};

export function useDpAniversariantes30d(competencia?: string, variant: "admin" | "portal" = "admin") {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dp_aniv_30d", variant, variant === "portal" ? user?.id : selectedCompanyId, competencia ?? "proximos"],
    enabled: variant === "portal" ? !!user?.id : !!selectedCompanyId,
    queryFn: async (): Promise<AnivItem[]> => {
      if (variant === "portal") {
        const { data, error } = await supabase.rpc("dp_portal_aniversariantes" as never, { p_competencia: competencia ?? null } as never);
        if (error) throw error;
        const rows = (data ?? []) as unknown as Array<{ colaborador_id: string; nome: string; cargo: string | null; unidade_id: string | null; unidade_nome: string | null; tipo: AnivItem["tipo"]; data_evento: string; anos_casa: number | null; faltam_dias: number }>;
        return rows.map((r) => ({ id: `${r.colaborador_id}-${r.tipo}`, colaboradorId: r.colaborador_id, nome: r.nome, cargo: r.cargo, email: null, unidade: r.unidade_nome, unidadeId: r.unidade_id, tipo: r.tipo, data: new Date(`${r.data_evento}T00:00:00`), diaMes: `${r.data_evento.slice(8, 10)}/${r.data_evento.slice(5, 7)}`, anosCompletos: r.tipo === "contratacao" ? r.anos_casa : null, faltamDias: r.faltam_dias }));
      }
      if (!selectedCompanyId) return [];
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id, nome, cargo, email, unidade_id, data_nascimento, data_admissao, data_base_contagem, regime, vinculo_label, origem_cadastro, dp_unidades(nome)")
        .eq("company_id", selectedCompanyId)
        .eq("ativo", true)
        .is("deleted_at", null);
      if (error) throw error;

      const items: AnivItem[] = [];
      const today = new Date();

      (data ?? []).forEach((c: any) => {
        const push = (raw: string | null, tipo: AnivItem["tipo"]) => {
          if (!raw) return;
          const ocorrencia = tipo === "contratacao" ? aniversarioContratacao(c, competencia, today) : aniversarioNoPeriodo(raw, competencia, today);
          if (!ocorrencia) return;
          items.push({
            id: `${c.id}-${tipo}`,
            colaboradorId: c.id,
            nome: c.nome,
            cargo: c.cargo,
            email: c.email ?? c.email_contato ?? null,
            unidade: c.dp_unidades?.nome ?? null,
            unidadeId: c.unidade_id ?? null,
            tipo,
            ...ocorrencia,
          });
        };
        push(c.data_nascimento, "nascimento");
        push(c.data_admissao, "contratacao");
      });

      return items.sort((a, b) => a.faltamDias - b.faltamDias);
    },
  });
}
