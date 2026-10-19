import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { aniversarioNoPeriodo } from "@/lib/dp/aniversarios-calendario";

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
  anosCompletos: number;
  faltamDias: number;
};

export function useDpAniversariantes30d(competencia?: string) {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_aniv_30d", selectedCompanyId, competencia ?? "proximos"],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<AnivItem[]> => {
      if (!selectedCompanyId) return [];
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id, nome, cargo, email, unidade_id, data_nascimento, data_admissao, dp_unidades(nome)")
        .eq("company_id", selectedCompanyId)
        .eq("ativo", true);
      if (error) throw error;

      const items: AnivItem[] = [];
      const today = new Date();

      (data ?? []).forEach((c: any) => {
        const push = (raw: string | null, tipo: AnivItem["tipo"]) => {
          if (!raw) return;
          const ocorrencia = aniversarioNoPeriodo(raw, competencia, today);
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
