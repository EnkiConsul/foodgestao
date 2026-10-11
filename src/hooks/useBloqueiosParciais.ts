import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { bloqueiosParciaisUnidade, type BloqueioParcial, type RegraRow } from "@/lib/dp/bloqueio-rules";
import { parseYMD } from "@/lib/dp/bloqueios";

/** Bloqueios parciais (por cargo, setor ou colaborador) da unidade no intervalo. */
export function useBloqueiosParciais(companyId: string | null | undefined, unidadeId: string | null, from?: string, to?: string) {
  return useQuery({
    queryKey: ["dp_bloqueios_efetivos", "parciais", companyId, unidadeId, from, to],
    enabled: !!companyId && !!from && !!to,
    queryFn: async (): Promise<Map<string, BloqueioParcial[]>> => {
      const [regras, vinc] = await Promise.all([
        supabase.from("dp_bloqueio_regras")
          .select("id, company_id, nome, tipo, mes, dia, regra_json, ativo")
          .eq("company_id", companyId!).eq("ativo", true),
        supabase.from("dp_bloqueio_regra_unidades").select("regra_id, unidade_id"),
      ]);
      if (regras.error) throw regras.error;
      const ids = new Set((regras.data ?? []).map((r) => r.id));
      return bloqueiosParciaisUnidade({
        regras: (regras.data ?? []) as RegraRow[],
        vinculos: (vinc.data ?? []).filter((v) => ids.has(v.regra_id)),
        unidadeId, from: parseYMD(from!), to: parseYMD(to!),
      });
    },
  });
}

/** Nomes de cargos, setores e colaboradores da empresa (para exibir o público). */
export function useNomesAlvo(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["dp_nomes_alvo", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const m = new Map<string, string>();
      const res = await Promise.all(["dp_cargos", "dp_setores", "dp_colaboradores"].map((t) =>
        supabase.from(t as "dp_cargos").select("id, nome").eq("company_id", companyId!)));
      for (const r of res) for (const x of (r.data ?? []) as { id: string; nome: string }[]) m.set(x.id, x.nome);
      return m;
    },
  });
}
