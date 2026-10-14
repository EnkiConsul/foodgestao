import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { normalizarDias, type DiaConfig, type TurnoResolvido } from "@/lib/dp/config-trabalho";
import { configVigente, jornadasDaConfig, type ResultadoJornadas } from "@/lib/dp/compensacao/jornadasColaborador";

/**
 * Leitura (somente SELECT) da jornada vigente para a calculadora.
 * Gestor: filtra pela empresa ativa (RLS da empresa).
 * Colaborador: o id vem de `dp_meu_colaborador()` e a RLS "read_self" limita ao próprio cadastro.
 */
export type JornadasCalculadora = ResultadoJornadas & { semConfig: boolean };

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function carregar(colaboradorId: string, companyId: string | null): Promise<JornadasCalculadora> {
  let q = supabase
    .from("dp_colaborador_config_trabalho")
    .select("id, vigencia_inicio, vigencia_fim, turno_padrao_id, folga_fixa_dow, dias:dp_colaborador_config_dias(dow, trabalha, turno_id, entrada, saida, intervalo_minutos)")
    .eq("colaborador_id", colaboradorId);
  if (companyId) q = q.eq("company_id", companyId);
  const { data, error } = await q;
  if (error) throw error;
  type Linha = { vigencia_inicio: string; vigencia_fim: string | null; turno_padrao_id: string | null; folga_fixa_dow: number | null; dias: DiaConfig[] | null };
  const cfg = configVigente((data ?? []) as unknown as Linha[], hojeIso());
  if (!cfg || !(cfg.dias ?? []).length) return { jornadas: [], incompletos: [], semConfig: true };

  // Só usa os 7 dias realmente gravados; não completa a semana com dias inventados.
  const dias = normalizarDias(cfg.dias ?? [], cfg.folga_fixa_dow).filter((d) => (cfg.dias ?? []).some((x) => x.dow === d.dow));
  const ids = [...new Set([cfg.turno_padrao_id, ...dias.map((d) => d.turno_id)].filter(Boolean))] as string[];
  let turnos: TurnoResolvido[] = [];
  if (ids.length) {
    const { data: ts } = await supabase.from("dp_turnos").select("id, nome, entrada, saida, intervalo_minutos, cor").in("id", ids);
    turnos = ((ts ?? []) as { id: string; nome: string; entrada: string; saida: string; intervalo_minutos: number | null; cor: string | null }[])
      .map((t) => ({ ...t, entrada: String(t.entrada).slice(0, 5), saida: String(t.saida).slice(0, 5), intervalo_minutos: t.intervalo_minutos ?? 0 }));
  }
  return { ...jornadasDaConfig(dias, cfg.turno_padrao_id, turnos), semConfig: false };
}

export function useJornadasCalculadoraGestor(colaboradorId: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["calc_jornadas", "gestor", selectedCompanyId, colaboradorId],
    enabled: !!selectedCompanyId && !!colaboradorId,
    queryFn: () => carregar(colaboradorId!, selectedCompanyId!),
  });
}

export function useJornadasCalculadoraMinhas() {
  return useQuery({
    queryKey: ["calc_jornadas", "meu"],
    queryFn: async () => {
      const { data: id, error } = await supabase.rpc("dp_meu_colaborador");
      if (error) throw error;
      if (!id) return { semVinculo: true as const };
      return { semVinculo: false as const, id: id as string, ...(await carregar(id as string, null)) };
    },
  });
}
