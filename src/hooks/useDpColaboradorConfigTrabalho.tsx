import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";
import type { DiaConfig } from "@/lib/dp/config-trabalho";

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

/** Dia anterior a uma data ISO — usado para encerrar a vigência anterior sem sobreposição. */
function diaAnterior(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

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
   * Cria uma nova configuração vigente. A configuração anterior em aberto é
   * encerrada no dia anterior ao novo início, preservando o histórico.
   */
  const salvar = useMutation({
    mutationFn: async (form: ConfigTrabalhoForm) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      if (!colaboradorId) throw new Error("Colaborador não informado.");

      const aberta = (query.data ?? []).find((c) => !c.vigencia_fim);

      // Mesma vigência da configuração em aberto: corrige a versão atual em vez
      // de criar uma nova (evita histórico duplicado ao ajustar dias/turnos).
      if (aberta && aberta.vigencia_inicio === form.vigencia_inicio) {
        const { error } = await supabase
          .from("dp_colaborador_config_trabalho")
          .update({
            unidade_id: form.unidade_id,
            turno_padrao_id: form.turno_padrao_id,
            folga_variavel: form.folga_variavel,
            folga_fixa_dow: form.folga_variavel ? null : form.folga_fixa_dow,
            observacoes: form.observacoes,
          })
          .eq("id", aberta.id);
        if (error) throw error;

        const { error: errDel } = await supabase
          .from("dp_colaborador_config_dias")
          .delete()
          .eq("config_id", aberta.id);
        if (errDel) throw errDel;

        const { error: errDias } = await supabase.from("dp_colaborador_config_dias").insert(
          form.dias.map((d) => ({
            company_id: selectedCompanyId,
            config_id: aberta.id,
            dow: d.dow,
            trabalha: d.trabalha,
            turno_id: d.turno_id,
          })),
        );
        if (errDias) throw errDias;
        return { id: aberta.id };
      }

      if (aberta) {
        const fim = diaAnterior(form.vigencia_inicio);
        const { error } = await supabase
          .from("dp_colaborador_config_trabalho")
          .update({ vigencia_fim: fim < aberta.vigencia_inicio ? aberta.vigencia_inicio : fim })
          .eq("id", aberta.id);
        if (error) throw error;
      }


      const { data, error } = await supabase
        .from("dp_colaborador_config_trabalho")
        .insert({
          company_id: selectedCompanyId,
          colaborador_id: colaboradorId,
          unidade_id: form.unidade_id,
          turno_padrao_id: form.turno_padrao_id,
          folga_variavel: form.folga_variavel,
          folga_fixa_dow: form.folga_variavel ? null : form.folga_fixa_dow,
          observacoes: form.observacoes,
          vigencia_inicio: form.vigencia_inicio,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: errDias } = await supabase.from("dp_colaborador_config_dias").insert(
        form.dias.map((d) => ({
          company_id: selectedCompanyId,
          config_id: data.id,
          dow: d.dow,
          trabalha: d.trabalha,
          turno_id: d.turno_id,
        })),
      );
      if (errDias) throw errDias;
      return data;
    },
    onSuccess: invalidate,
  });

  const encerrar = useMutation({
    mutationFn: async ({ id, fim }: { id: string; fim?: string }) => {
      const { error } = await supabase
        .from("dp_colaborador_config_trabalho")
        .update({ vigencia_fim: fim ?? hoje() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_colaborador_config_trabalho").delete().eq("id", id);
      if (error) throw error;
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
