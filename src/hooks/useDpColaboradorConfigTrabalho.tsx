import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";
import type { DiaConfig } from "@/lib/dp/config-trabalho";
import {
  salvarConfigTrabalho,
  encerrarConfigTrabalho,
  excluirConfigTrabalho,
} from "@/lib/dp/colaborador-oficial";

type ConfigRow = Database["public"]["Tables"]["dp_colaborador_config_trabalho"]["Row"];
type DiaRow = Database["public"]["Tables"]["dp_colaborador_config_dias"]["Row"];

export interface ConfigTrabalhoRegistro extends ConfigRow {
  dias: DiaRow[];
}

export interface ConfigTrabalhoForm {
  unidade_id: string | null;
  turno_padrao_id: string | null;
  folga_variavel: boolean;
  folga_fixa_dow: number | null;
  observacoes: string | null;
  vigencia_inicio: string;
  dias: DiaConfig[];
}

const hoje = () => new Date().toISOString().slice(0, 10);

/** Configurações de trabalho do colaborador, com histórico por vigência. */
export function useDpColaboradorConfigTrabalho(colaboradorId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_colab_config_trabalho", selectedCompanyId, colaboradorId],
    enabled: !!selectedCompanyId && !!colaboradorId,
    queryFn: async (): Promise<ConfigTrabalhoRegistro[]> => {
      const { data, error } = await supabase
        .from("dp_colaborador_config_trabalho")
        .select("*, dias:dp_colaborador_config_dias(*)")
        .eq("company_id", selectedCompanyId!)
        .eq("colaborador_id", colaboradorId!)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((c) => ({
        ...(c as ConfigRow),
        dias: [...(((c as unknown as { dias?: DiaRow[] }).dias) ?? [])].sort((a, b) => a.dow - b.dow),
      }));
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_colab_config_trabalho"] });
  };

  /**
   * Salva a configuração vigente pela rotina oficial: o servidor encerra a
   * configuração anterior e grava os dias na mesma operação.
   */
  const salvar = useMutation({
    mutationFn: async (form: ConfigTrabalhoForm) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      if (!colaboradorId) throw new Error("Colaborador não informado.");

      const id = await salvarConfigTrabalho({
        colaboradorId,
        config: {
          vigencia_inicio: form.vigencia_inicio,
          unidade_id: form.unidade_id,
          turno_padrao_id: form.turno_padrao_id,
          folga_variavel: form.folga_variavel,
          folga_fixa_dow: form.folga_variavel ? null : form.folga_fixa_dow,
          observacoes: form.observacoes,
          dias: form.dias.map((d) => ({
            dow: d.dow,
            trabalha: d.trabalha,
            turno_id: d.turno_id ?? null,
            entrada: d.trabalha && d.entrada && d.saida ? d.entrada : null,
            saida: d.trabalha && d.entrada && d.saida ? d.saida : null,
            intervalo_minutos:
              d.trabalha && d.entrada && d.saida ? (d.intervalo_minutos ?? 0) : null,
            setor_id: d.trabalha ? (d.setor_id ?? null) : null,
          })),
        },
      });
      return { id };
    },
    onSuccess: invalidate,
  });

  const encerrar = useMutation({
    mutationFn: async ({ id, fim }: { id: string; fim?: string }) => {
      await encerrarConfigTrabalho(id, fim ?? hoje());
    },
    onSuccess: invalidate,
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      await excluirConfigTrabalho(id);
    },
    onSuccess: invalidate,
  });

  const configs = query.data ?? [];
  const vigente = configs.find((c) => !c.vigencia_fim || c.vigencia_fim >= hoje()) ?? null;

  return {
    ...query,
    configs,
    vigente,
    salvar,
    encerrar,
    remover,
    saving: salvar.isPending || encerrar.isPending || remover.isPending,
  };
}
