import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpValeCalculadora, type LinhaVale } from "@/hooks/useDpValeCalculadora";
import { valeAlimentacaoDoMes } from "@/lib/dp/remuneracao";

/** Benefício gravado diretamente no cadastro do colaborador. */
export interface BeneficioCadastroItem {
  id: string;
  origem: "cadastro";
  colaborador_id: string;
  colaborador_nome: string;
  tipo: "vale_alimentacao" | "vale_transporte";
  nome: string;
  bruto: number;
  desconto: number;
  liquido: number;
  dias: number;
  diasOrigem: "jornada" | "convocacao" | "fixo" | "padrao";
  diaPagamento: number | null;
  detalhe: string;
  aviso?: string;
}

const competenciaAtual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const COLUNAS = [
  "id", "nome", "regime", "vale_alimentacao", "vale_alimentacao_valor",
  "vale_alimentacao_periodicidade", "vale_alimentacao_dias_base", "vale_alimentacao_dias_origem",
  "vale_alimentacao_desconto_tipo", "vale_alimentacao_desconto_valor", "vale_alimentacao_dia_pagamento",
  "vale_transporte", "vale_transporte_valor_dia", "vale_transporte_dia_pagamento",
].join(", ");

const detalheLinha = (linha: LinhaVale) => {
  const origem = linha.origemPrevistos === "convocacao"
    ? "convocações aceitas"
    : linha.origemPrevistos === "escala"
      ? "escala publicada"
      : "jornada habitual";
  const partes = [`${linha.diasPrevistos} previsto(s) por ${origem}`];
  if (linha.folgasDescontadas > 0) partes.push(`− ${linha.folgasDescontadas} folga(s)`);
  if (linha.feriasDescontadas > 0) partes.push(`− ${linha.feriasDescontadas} dia(s) de férias`);
  if (linha.descontos.dias > 0) partes.push(`− ${linha.descontos.dias} diferença(s) anterior(es)`);
  partes.push(`= ${linha.deposito.diasPagos} dia(s)`);
  return partes.join(" ");
};

/**
 * Espelha na aba Por colaborador o mesmo motor das calculadoras de VA e VT.
 * Quantidades expressamente fixas e benefícios mensais permanecem inalterados.
 */
export function useDpBeneficiosCadastro(colaboradorFilter = "todos") {
  const { selectedCompanyId } = useCompanyContext();
  const competencia = useMemo(competenciaAtual, []);
  const va = useDpValeCalculadora("va", competencia);
  const vt = useDpValeCalculadora("vt", competencia);

  const query = useQuery({
    queryKey: ["dp_beneficios_cadastro", selectedCompanyId],
    enabled: Boolean(selectedCompanyId),
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select(COLUNAS)
        .eq("company_id", selectedCompanyId)
        .is("deleted_at", null)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const itens = useMemo<BeneficioCadastroItem[]>(() => {
    const vaPor = new Map(va.linhas.map((linha) => [linha.colaborador_id, linha]));
    const vtPor = new Map(vt.linhas.map((linha) => [linha.colaborador_id, linha]));
    const out: BeneficioCadastroItem[] = [];

    for (const c of query.data ?? []) {
      if (colaboradorFilter !== "todos" && c.id !== colaboradorFilter) continue;
      const intermitente = String(c.regime ?? "") === "intermitente";

      if (c.vale_alimentacao) {
        const diario = (c.vale_alimentacao_periodicidade ?? "mensal") === "diario";
        const quantidadeFixa = diario && c.vale_alimentacao_dias_origem === "fixo";
        const linha = vaPor.get(c.id);

        if (!diario || quantidadeFixa) {
          const calc = valeAlimentacaoDoMes(c);
          if (calc.bruto > 0) {
            out.push({
              id: `cadastro-va-${c.id}`, origem: "cadastro", colaborador_id: c.id,
              colaborador_nome: c.nome, tipo: "vale_alimentacao", nome: "Vale-alimentação",
              bruto: calc.bruto, desconto: calc.desconto, liquido: calc.liquido, dias: calc.dias,
              diasOrigem: "fixo", diaPagamento: c.vale_alimentacao_dia_pagamento ?? null,
              detalhe: diario ? `${calc.dias} dia(s) (quantidade fixa)` : "valor mensal fixo",
            });
          }
        } else if (linha) {
          out.push({
            id: `cadastro-va-${c.id}`, origem: "cadastro", colaborador_id: c.id,
            colaborador_nome: c.nome, tipo: "vale_alimentacao", nome: "Vale-alimentação",
            bruto: linha.deposito.bruto, desconto: linha.deposito.desconto,
            liquido: linha.deposito.depositar, dias: linha.deposito.diasPagos,
            diasOrigem: linha.origemPrevistos === "convocacao" ? "convocacao" : "jornada",
            diaPagamento: c.vale_alimentacao_dia_pagamento ?? null,
            detalhe: detalheLinha(linha), aviso: linha.aviso,
          });
        } else if (intermitente) {
          out.push({
            id: `cadastro-va-${c.id}`, origem: "cadastro", colaborador_id: c.id,
            colaborador_nome: c.nome, tipo: "vale_alimentacao", nome: "Vale-alimentação",
            bruto: 0, desconto: 0, liquido: 0, dias: 0, diasOrigem: "convocacao",
            diaPagamento: c.vale_alimentacao_dia_pagamento ?? null,
            detalhe: "0 dias — aguardando convocações",
            aviso: "Sem convocações aceitas no período — valor a confirmar.",
          });
        }
      }

      if (c.vale_transporte && Number(c.vale_transporte_valor_dia ?? 0) > 0) {
        const linha = vtPor.get(c.id);
        if (linha) {
          out.push({
            id: `cadastro-vt-${c.id}`, origem: "cadastro", colaborador_id: c.id,
            colaborador_nome: c.nome, tipo: "vale_transporte", nome: "Vale-transporte",
            bruto: linha.deposito.bruto, desconto: linha.deposito.desconto,
            liquido: linha.deposito.depositar, dias: linha.deposito.diasPagos,
            diasOrigem: linha.origemPrevistos === "convocacao" ? "convocacao" : "jornada",
            diaPagamento: c.vale_transporte_dia_pagamento ?? null,
            detalhe: detalheLinha(linha), aviso: linha.aviso,
          });
        }
      }
    }
    return out.sort((a, b) =>
      a.colaborador_nome.localeCompare(b.colaborador_nome) || a.nome.localeCompare(b.nome));
  }, [query.data, va.linhas, vt.linhas, colaboradorFilter]);

  return {
    ...query,
    isLoading: query.isLoading || va.isLoading || vt.isLoading,
    isError: query.isError || va.isError || vt.isError,
    itens,
    refetch: () => {
      void query.refetch();
      va.refetchAll();
      vt.refetchAll();
    },
  };
}