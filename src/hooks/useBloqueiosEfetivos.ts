import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { bloqueiosEfetivosUnidade, type BloqueioEfetivo, type DataBloqueadaRow, type RegraRow } from "@/lib/dp/bloqueio-rules";
import { parseYMD } from "@/lib/dp/bloqueios";

/** Datas bloqueadas + regras recorrentes da unidade, iguais ao Calendário de Folgas. */
export function useBloqueiosEfetivos(companyId: string | null | undefined, unidadeId: string | null, from?: string, to?: string) {
  return useQuery({
    queryKey: ["dp_bloqueios_efetivos", companyId, unidadeId, from, to],
    enabled: !!companyId && !!from && !!to,
    queryFn: async (): Promise<Map<string, BloqueioEfetivo>> => {
      const [datas, regras, vinc] = await Promise.all([
        supabase.from("dp_datas_bloqueadas")
          .select("id, data, motivo, liberada, liberada_por_solicitacao, unidade_id, regra_id")
          .eq("company_id", companyId!).gte("data", from!).lte("data", to!),
        supabase.from("dp_bloqueio_regras")
          .select("id, company_id, nome, tipo, mes, dia, regra_json, ativo")
          .eq("company_id", companyId!).eq("ativo", true),
        supabase.from("dp_bloqueio_regra_unidades").select("regra_id, unidade_id"),
      ]);
      if (datas.error) throw datas.error;
      if (regras.error) throw regras.error;
      const ids = new Set((regras.data ?? []).map((r) => r.id));
      return bloqueiosEfetivosUnidade({
        datas: (datas.data ?? []) as DataBloqueadaRow[],
        regras: (regras.data ?? []) as RegraRow[],
        vinculos: (vinc.data ?? []).filter((v) => ids.has(v.regra_id)),
        unidadeId,
        from: parseYMD(from!),
        to: parseYMD(to!),
      });
    },
  });
}
