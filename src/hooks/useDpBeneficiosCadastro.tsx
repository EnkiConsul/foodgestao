import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { valeAlimentacaoDoMes } from "@/lib/dp/remuneracao";
import {
  calcularBeneficioMes,
  descreverDiasJornada,
  diasTrabalhaveisNoMes,
  DIAS_BASE_PADRAO,
} from "@/lib/dp/beneficios-regras";

/**
 * Benefícios que ficam gravados no próprio cadastro do colaborador
 * (Vale-Alimentação e Vale-Transporte da aba Remuneração).
 * A tela de Benefícios mostra estes itens junto com as atribuições do catálogo,
 * para o gestor ver tudo o que a empresa paga em um único lugar.
 *
 * Os dias considerados vêm da jornada vigente do colaborador (dias da semana
 * marcados na configuração de trabalho) e, para intermitentes, das convocações
 * aceitas no mês de referência.
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
  /** De onde saíram os dias usados no cálculo. */
  diasOrigem: "jornada" | "convocacao" | "fixo" | "padrao";
  diaPagamento: number | null;
  detalhe: string;
  /** Alerta quando o número de dias é apenas uma referência provisória. */
  aviso?: string;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const COLUNAS = [
  "id",
  "nome",
  "regime",
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

/** Primeiro e último dia do mês de referência, em ISO. */
function limitesDoMes(ref: Date) {
  const ano = ref.getFullYear();
  const mes = ref.getMonth();
  const p = (n: number) => String(n).padStart(2, "0");
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  return {
    inicio: `${ano}-${p(mes + 1)}-01`,
    fim: `${ano}-${p(mes + 1)}-${p(ultimo)}`,
    competencia: `${ano}-${p(mes + 1)}`,
  };
}

export function useDpBeneficiosCadastro(colaboradorFilter = "todos") {
  const { selectedCompanyId } = useCompanyContext();
  const { inicio, fim, competencia } = useMemo(() => limitesDoMes(new Date()), []);

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

  /** Jornada vigente de todos os colaboradores da empresa, em lote. */
  const jornadasQ = useQuery({
    queryKey: ["dp_beneficios_cadastro_jornadas", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaborador_config_trabalho")
        .select("colaborador_id, vigencia_inicio, dias:dp_colaborador_config_dias(dow, trabalha)")
        .eq("company_id", selectedCompanyId!)
        .is("vigencia_fim", null)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      const map = new Map<string, { dow: number; trabalha: boolean }[]>();
      for (const row of (data ?? []) as any[]) {
        if (map.has(row.colaborador_id)) continue; // a mais recente vence
        map.set(row.colaborador_id, (row.dias ?? []) as { dow: number; trabalha: boolean }[]);
      }
      return map;
    },
  });

  /** Convocações aceitas no mês — base de dias para intermitentes. */
  const convocacoesQ = useQuery({
    queryKey: ["dp_beneficios_cadastro_convocacoes", selectedCompanyId, inicio, fim],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_convocacoes")
        .select("colaborador_id, data")
        .eq("company_id", selectedCompanyId!)
        .eq("status", "aceita")
        .gte("data", inicio)
        .lte("data", fim);
      if (error) throw error;
      const map = new Map<string, Set<string>>();
      for (const row of (data ?? []) as any[]) {
        const set = map.get(row.colaborador_id) ?? new Set<string>();
        set.add(row.data);
        map.set(row.colaborador_id, set);
      }
      return new Map([...map].map(([k, v]) => [k, v.size]));
    },
  });

  const itens = useMemo<BeneficioCadastroItem[]>(() => {
    const rows = query.data ?? [];
    const jornadas = jornadasQ.data;
    const convocacoes = convocacoesQ.data;
    const out: BeneficioCadastroItem[] = [];

    for (const c of rows) {
      if (colaboradorFilter !== "todos" && c.id !== colaboradorFilter) continue;

      const intermitente = (c.regime ?? "") === "intermitente";
      const diasJornadaCfg = jornadas?.get(c.id) ?? null;
      const diasConvocados = intermitente ? (convocacoes?.get(c.id) ?? 0) : null;
      const diasCalculados = intermitente
        ? diasConvocados
        : diasTrabalhaveisNoMes(diasJornadaCfg, competencia);

      const origemDias: BeneficioCadastroItem["diasOrigem"] = intermitente
        ? "convocacao"
        : diasCalculados != null
          ? "jornada"
          : "padrao";

      const aviso = intermitente
        ? !diasConvocados
          ? "Sem convocações aceitas neste mês — valor a confirmar."
          : undefined
        : diasCalculados == null
          ? `Horário de trabalho não cadastrado — usando ${DIAS_BASE_PADRAO} dias como referência.`
          : undefined;

      const rotuloDias = (dias: number) =>
        intermitente
          ? `${dias} dia(s) convocado(s)`
          : origemDias === "jornada"
            ? `${dias} dia(s) — ${descreverDiasJornada(diasJornadaCfg)}`
            : `${dias} dia(s) (referência)`;

      if (c.vale_alimentacao) {
        const va = valeAlimentacaoDoMes(c, { diasJornada: diasCalculados ?? undefined });
        const diario = (c.vale_alimentacao_periodicidade ?? "mensal") === "diario";
        if (va.bruto > 0 || (diario && intermitente)) {
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
            diasOrigem: diario
              ? va.diasOrigem === "fixo"
                ? "fixo"
                : origemDias
              : "fixo",
            diaPagamento: c.vale_alimentacao_dia_pagamento ?? null,
            detalhe: !diario
              ? "valor mensal fixo"
              : va.diasOrigem === "fixo"
                ? `${va.dias} dia(s) (quantidade fixa)`
                : rotuloDias(va.dias),
            aviso: diario && va.diasOrigem !== "fixo" ? aviso : undefined,
          });
        }
      }

      if (c.vale_transporte && num(c.vale_transporte_valor_dia) > 0) {
        const dias = diasCalculados ?? num(c.vale_alimentacao_dias_base) || DIAS_BASE_PADRAO;
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
          diasOrigem: origemDias,
          diaPagamento: c.vale_transporte_dia_pagamento ?? null,
          detalhe: rotuloDias(dias),
          aviso,
        });
      }
    }

    return out.sort(
      (a, b) => a.colaborador_nome.localeCompare(b.colaborador_nome) || a.nome.localeCompare(b.nome),
    );
  }, [query.data, jornadasQ.data, convocacoesQ.data, colaboradorFilter, competencia]);

  return {
    ...query,
    isLoading: query.isLoading || jornadasQ.isLoading || convocacoesQ.isLoading,
    itens,
  };
}
