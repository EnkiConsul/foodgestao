import { supabase } from "@/integrations/supabase/client";
import { tabelaSalarioFamiliaVigente } from "@/lib/dp/salarioFamilia";

/**
 * Resolve a tabela do salário-família vigente HOJE direto do histórico.
 * Tabela futura passa a valer sozinha na data de início, sem ninguém salvar.
 */
export async function buscarSalarioFamiliaVigente(companyId: string) {
  const { data, error } = await supabase
    .from("dp_salario_familia_tabelas")
    .select("id, vigencia_inicio, cota, teto")
    .eq("company_id", companyId)
    .is("removido_em", null);
  if (error || !data?.length) return null;
  return tabelaSalarioFamiliaVigente(
    data.map((r) => ({ ...r, cota: Number(r.cota), teto: Number(r.teto) })),
  );
}
