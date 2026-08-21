import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { ValeTipo } from "@/hooks/useDpValeCalculadora";

/**
 * Cálculo mensal dos vales pagos por dia (alimentação e transporte).
 *
 * Enquanto o ponto não está implantado, os dias do ciclo anterior são
 * informados pelo gestor: "dias pagos" vem do ciclo fechado anterior (quando
 * existe) e "dias trabalhados" é sempre digitado. Este hook lê e grava esses
 * números e fecha o ciclo, alimentando o histórico e o mês seguinte.
 */
export interface ApuracaoVale {
  id: string;
  colaborador_id: string;
  competencia: string;
  tipo: ValeTipo;
  dias_pagos_anterior: number;
  dias_trabalhados_anterior: number | null;
  dias_previstos: number;
  total_dias: number;
  valor_dia: number;
  valor_depositar: number;
  fechado_em: string | null;
}

/** Competência normalizada para o primeiro dia do mês. */
const mesIso = (competencia: string) => `${competencia.slice(0, 7)}-01`;

const mesAnterior = (competencia: string) => {
  const [ano, mes] = competencia.slice(0, 7).split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

const linhaDe = (row: any): ApuracaoVale => ({
  id: String(row.id),
  colaborador_id: String(row.colaborador_id),
  competencia: String(row.competencia),
  tipo: (row.tipo === "vt" ? "vt" : "va") as ValeTipo,
  dias_pagos_anterior: Number(row.dias_pagos_anterior ?? 0),
  dias_trabalhados_anterior:
    row.dias_trabalhados_anterior == null ? null : Number(row.dias_trabalhados_anterior),
  dias_previstos: Number(row.dias_previstos ?? 0),
  total_dias: Number(row.total_dias ?? 0),
  valor_dia: Number(row.valor_dia ?? 0),
  valor_depositar: Number(row.valor_depositar ?? 0),
  fechado_em: row.fechado_em ? String(row.fechado_em) : null,
});

const COLUNAS =
  "id, colaborador_id, competencia, tipo, dias_pagos_anterior, dias_trabalhados_anterior, dias_previstos, total_dias, valor_dia, valor_depositar, fechado_em";

export interface FecharLinha {
  colaborador_id: string;
  dias_pagos_anterior: number;
  dias_trabalhados_anterior: number | null;
  dias_previstos: number;
  total_dias: number;
  valor_dia: number;
  valor_depositar: number;
}

export function useDpValeApuracoes(tipo: ValeTipo, competencia: string) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const mes = mesIso(competencia);
  const anterior = mesAnterior(competencia);

  const key = ["dp_vale_apuracoes", selectedCompanyId, tipo, mes];

  const q = useQuery({
    queryKey: key,
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("dp_va_apuracoes") as any)
        .select(COLUNAS)
        .eq("company_id", selectedCompanyId!)
        .eq("tipo", tipo)
        .in("competencia", [mes, anterior]);
      if (error) throw error;
      return ((data ?? []) as any[]).map(linhaDe);
    },
  });

  const atual = useMemo(
    () => new Map((q.data ?? []).filter((r) => r.competencia === mes).map((r) => [r.colaborador_id, r])),
    [q.data, mes],
  );
  const anteriores = useMemo(
    () =>
      new Map(
        (q.data ?? []).filter((r) => r.competencia === anterior).map((r) => [r.colaborador_id, r]),
      ),
    [q.data, anterior],
  );

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ["dp_vale_apuracoes"] });
    void qc.invalidateQueries({ queryKey: ["dp_vale_historico"] });
  };

  /** Grava os dias informados de um colaborador (sem fechar o ciclo). */
  const salvarDias = useMutation({
    mutationFn: async (input: {
      colaborador_id: string;
      dias_pagos_anterior: number;
      dias_trabalhados_anterior: number | null;
      dias_previstos: number;
      total_dias: number;
      valor_dia: number;
      valor_depositar: number;
    }) => {
      const { error } = await (supabase.from("dp_va_apuracoes") as any).upsert(
        {
          company_id: selectedCompanyId,
          colaborador_id: input.colaborador_id,
          competencia: mes,
          tipo,
          dias_pagos_anterior: input.dias_pagos_anterior,
          dias_trabalhados_anterior: input.dias_trabalhados_anterior,
          dias_previstos: input.dias_previstos,
          dias_descontados: 0,
          total_dias: input.total_dias,
          valor_dia: input.valor_dia,
          valor_depositar: input.valor_depositar,
        },
        { onConflict: "colaborador_id,competencia,tipo" },
      );
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível salvar os dias informados."),
  });

  /** Fecha o ciclo: grava todas as linhas e marca a data do fechamento. */
  const fecharCiclo = useMutation({
    mutationFn: async (linhas: FecharLinha[]) => {
      if (linhas.length === 0) return;
      const agora = new Date().toISOString();
      const { error } = await (supabase.from("dp_va_apuracoes") as any).upsert(
        linhas.map((l) => ({
          company_id: selectedCompanyId,
          colaborador_id: l.colaborador_id,
          competencia: mes,
          tipo,
          dias_pagos_anterior: l.dias_pagos_anterior,
          dias_trabalhados_anterior: l.dias_trabalhados_anterior,
          dias_previstos: l.dias_previstos,
          dias_descontados: 0,
          total_dias: l.total_dias,
          valor_dia: l.valor_dia,
          valor_depositar: l.valor_depositar,
          fechado_em: agora,
        })),
        { onConflict: "colaborador_id,competencia,tipo" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Ciclo fechado. Os dias pagos já valem para o próximo mês.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível fechar o ciclo."),
  });

  return {
    atual,
    anteriores,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => void q.refetch(),
    salvarDias,
    fecharCiclo,
  };
}

export interface HistoricoVale {
  competencia: string;
  tipo: ValeTipo;
  colaboradores: number;
  totalDias: number;
  diferenca: number;
  valor: number;
  fechado_em: string | null;
}

/** Ciclos já fechados, agrupados por mês e tipo de vale. */
export function useDpValeHistorico() {
  const { selectedCompanyId } = useCompanyContext();

  const q = useQuery({
    queryKey: ["dp_vale_historico", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("dp_va_apuracoes") as any)
        .select(COLUNAS)
        .eq("company_id", selectedCompanyId!)
        .not("fechado_em", "is", null)
        .order("competencia", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map(linhaDe);
    },
  });

  const grupos = useMemo<HistoricoVale[]>(() => {
    const m = new Map<string, HistoricoVale>();
    for (const r of q.data ?? []) {
      const k = `${r.competencia}|${r.tipo}`;
      const g =
        m.get(k) ??
        {
          competencia: r.competencia,
          tipo: r.tipo,
          colaboradores: 0,
          totalDias: 0,
          diferenca: 0,
          valor: 0,
          fechado_em: r.fechado_em,
        };
      g.colaboradores += 1;
      g.totalDias += r.total_dias;
      g.diferenca +=
        r.dias_trabalhados_anterior == null
          ? 0
          : r.dias_trabalhados_anterior - r.dias_pagos_anterior;
      g.valor += r.valor_depositar;
      m.set(k, g);
    }
    return [...m.values()].sort(
      (a, b) => b.competencia.localeCompare(a.competencia) || a.tipo.localeCompare(b.tipo),
    );
  }, [q.data]);

  return {
    grupos,
    linhas: q.data ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => void q.refetch(),
  };
}
