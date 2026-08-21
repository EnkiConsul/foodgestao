import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { valeAlimentacaoDoMes } from "@/lib/dp/remuneracao";
import { calcularBeneficioMes, DIAS_BASE_PADRAO } from "@/lib/dp/beneficios-regras";

/**
 * Benefícios que ficam gravados no próprio cadastro do colaborador
 * (Vale-Alimentação e Vale-Transporte da aba Remuneração).
 * A tela de Benefícios mostra estes itens junto com as atribuições do catálogo,
 * para o gestor ver tudo o que a empresa paga em um único lugar.
 */
export interface BeneficioCadastroItem {
  /** Chave sintética — não existe registro na tabela de atribuições. */
  id: string;
  origem: "cadastro";
  colaborador_id: string;
  colaborador_nome: string;
  tipo: "vale_alimentacao" | "vale_transporte";
  nome: string;
  /** Valor concedido no mês. */
  bruto: number;
  /** Desconto do colaborador no mês. */
  desconto: number;
  /** Custo líquido da empresa no mês. */
  liquido: number;
  dias: number;
  diaPagamento: number | null;
  detalhe: string;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const COLUNAS = [
  "id",
  "nome",
  "salario_base",
  "forma_pagamento",
  "vale_alimentacao",
  "vale_alimentacao_valor",
  "vale_alimentacao_periodicidade",
  "vale_alimentacao_dias_base",
  "vale_alimentacao_dias_origem",
  "vale_alimentacao_desconto_tipo",
  "vale_alimentacao_desconto_valor",
  "vale_alimentacao_dia_pagamento",
  "vale_transporte",
  "vale_transporte_valor_dia",
  "vale_transporte_dia_pagamento",
].join(", ");

export function useDpBeneficiosCadastro(colaboradorFilter = "todos") {
  const { selectedCompanyId } = useCompanyContext();

  const query = useQuery({
    queryKey: ["dp_beneficios_cadastro", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select(COLUNAS)
        .eq("company_id", selectedCompanyId!)
        .is("deleted_at", null)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const itens = useMemo<BeneficioCadastroItem[]>(() => {
    const rows = query.data ?? [];
    const out: BeneficioCadastroItem[] = [];

    for (const c of rows) {
      if (colaboradorFilter !== "todos" && c.id !== colaboradorFilter) continue;

      if (c.vale_alimentacao) {
        const va = valeAlimentacaoDoMes(c);
        if (va.bruto > 0) {
          const diario = (c.vale_alimentacao_periodicidade ?? "mensal") === "diario";
          out.push({
            id: `cadastro-va-${c.id}`,
            origem: "cadastro",
            colaborador_id: c.id,
            colaborador_nome: c.nome,
            tipo: "vale_alimentacao",
            nome: "Vale-alimentação",
            bruto: va.bruto,
            desconto: va.desconto,
            liquido: va.liquido,
            dias: va.dias,
            diaPagamento: c.vale_alimentacao_dia_pagamento ?? null,
            detalhe: diario
              ? `${va.dias} dia(s) × valor diário`
              : "valor mensal fixo",
          });
        }
      }

      if (c.vale_transporte && num(c.vale_transporte_valor_dia) > 0) {
        const dias = num(c.vale_alimentacao_dias_base) || DIAS_BASE_PADRAO;
        const calc = calcularBeneficioMes({
          valor: c.vale_transporte_valor_dia,
          periodicidade: "diario",
          dias_base: dias,
          desconto_tipo: "nenhum",
        });
        out.push({
          id: `cadastro-vt-${c.id}`,
          origem: "cadastro",
          colaborador_id: c.id,
          colaborador_nome: c.nome,
          tipo: "vale_transporte",
          nome: "Vale-transporte",
          bruto: calc.bruto,
          desconto: calc.desconto,
          liquido: calc.liquido,
          dias,
          diaPagamento: c.vale_transporte_dia_pagamento ?? null,
          detalhe: `${dias} dia(s) × valor diário`,
        });
      }
    }

    return out.sort(
      (a, b) => a.colaborador_nome.localeCompare(b.colaborador_nome) || a.nome.localeCompare(b.nome),
    );
  }, [query.data, colaboradorFilter]);

  return { ...query, itens };
}
