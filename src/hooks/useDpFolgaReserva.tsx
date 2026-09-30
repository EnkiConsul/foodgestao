import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "./useCompanyContext";

/** Pessoa convocável que informou indisponibilidade em um dia. */
export type ReservaPessoa = {
  id: string;
  nome: string;
  unidadeId: string | null;
  vinculo: string | null;
};

/**
 * Indisponibilidades ativas de convocáveis por dia.
 * Usada pelo calendário de folgas para reservar vagas quando a empresa
 * ativa a chave em Convocações → Regras.
 *
 * No painel administrativo a RLS permite ler todas as indisponibilidades
 * da empresa; no portal o colaborador vê apenas as próprias, portanto esta
 * contagem não é usada para o cálculo visual do portal (a validação final
 * ocorre no backend via dp_folga_limite_dia).
 *
 * `unidadeId` restringe a contagem e os nomes à unidade filtrada na tela;
 * `null` mantém todas as unidades da empresa.
 */
export function useDpFolgaReserva(cursor: Date, unidadeId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const inicio = format(startOfMonth(cursor), "yyyy-MM-dd");
  const fim = format(endOfMonth(cursor), "yyyy-MM-dd");
  const unidade = unidadeId ?? null;

  const query = useQuery({
    queryKey: ["dp_folga_reserva", selectedCompanyId, inicio, fim, unidade],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_indisponibilidades")
        .select(
          "data, colaborador_id, dp_colaboradores!inner(id, nome, nome_social, unidade_id, vinculo_label)",
        )
        .eq("company_id", selectedCompanyId!)
        .is("cancelada_em", null)
        .gte("data", inicio)
        .lte("data", fim);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  /** Nomes por dia, já filtrados pela unidade escolhida na tela. */
  const pessoasByDay = useMemo(() => {
    const map = new Map<string, ReservaPessoa[]>();
    for (const row of query.data ?? []) {
      const colab = row.dp_colaboradores;
      if (!colab) continue;
      const colabUnidade = colab.unidade_id ?? null;
      if (unidade && colabUnidade !== unidade) continue;
      const list = map.get(row.data) ?? [];
      list.push({
        id: colab.id,
        nome: colab.nome_social || colab.nome,
        unidadeId: colabUnidade,
        vinculo: colab.vinculo_label ?? null,
      });
      map.set(row.data, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    }
    return map;
  }, [query.data, unidade]);

  const reservasByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const [dia, pessoas] of pessoasByDay) {
      if (pessoas.length > 0) map.set(dia, pessoas.length);
    }
    return map;
  }, [pessoasByDay]);

  return { ...query, reservasByDay, pessoasByDay };
}
