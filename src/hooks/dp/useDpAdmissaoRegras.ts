/**
 * Regras de Admissão: a empresa define, para cada dado e cada documento da
 * ficha, uma regra padrão (vale para todo mundo) e quantas exceções quiser.
 * Cada exceção pode listar várias unidades, vários tipos de vínculo e vários
 * cargos ao mesmo tempo — lista vazia significa "todos".
 *
 * A tela só lê e grava (sempre pela rotina do servidor
 * `dp_admissao_regra_salvar`); quem decide o que vale em cada ficha é
 * `dp_admissao_regras_resolver`, usada também pelas funções de borda.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export type Exigencia = "obrigatorio" | "opcional" | "nao_pedir";
export type TipoRegra = "campo" | "documento";

export interface AdmissaoRegra {
  id: string;
  company_id: string;
  tipo: TipoRegra;
  chave: string;
  exigencia: Exigencia;
  padrao: boolean;
  unidades: string[];
  cargos: string[];
  regimes: string[];
  sexos: string[];
}

export interface AdmissaoParentesco {
  id: string;
  company_id: string;
  parentesco: string;
  permite_dependente: boolean;
  permite_sesc: boolean;
}

export interface RegraEntrada {
  id?: string | null;
  tipo: TipoRegra;
  chave: string;
  exigencia: Exigencia;
  padrao: boolean;
  unidades: string[];
  cargos: string[];
  regimes: string[];
  sexos: string[];
}

export function useDpAdmissaoRegras() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const regras = useQuery({
    queryKey: ["dp-admissao-regras", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<AdmissaoRegra[]> => {
      const [base, uni, car, reg, sex] = await Promise.all([
        supabase
          .from("dp_admissao_regras")
          .select("id, company_id, tipo, chave, exigencia, padrao")
          .eq("company_id", selectedCompanyId!),
        supabase.from("dp_admissao_regra_unidades").select("regra_id, unidade_id")
          .eq("company_id", selectedCompanyId!),
        supabase.from("dp_admissao_regra_cargos").select("regra_id, cargo_id")
          .eq("company_id", selectedCompanyId!),
        supabase.from("dp_admissao_regra_regimes").select("regra_id, regime")
          .eq("company_id", selectedCompanyId!),
        supabase.from("dp_admissao_regra_sexos").select("regra_id, sexo")
          .eq("company_id", selectedCompanyId!),
      ]);
      if (base.error) throw base.error;
      if (uni.error) throw uni.error;
      if (car.error) throw car.error;
      if (reg.error) throw reg.error;
      if (sex.error) throw sex.error;
      const porRegra = <T,>(rows: { regra_id: string }[], pick: (r: never) => T) => {
        const m = new Map<string, T[]>();
        rows.forEach((r) => {
          const lista = m.get(r.regra_id) ?? [];
          lista.push(pick(r as never));
          m.set(r.regra_id, lista);
        });
        return m;
      };
      const mu = porRegra(uni.data ?? [], (r: { unidade_id: string }) => r.unidade_id);
      const mc = porRegra(car.data ?? [], (r: { cargo_id: string }) => r.cargo_id);
      const mr = porRegra(reg.data ?? [], (r: { regime: string }) => r.regime);
      const ms = porRegra(sex.data ?? [], (r: { sexo: string }) => r.sexo);
      return (base.data ?? []).map((r) => ({
        ...(r as Omit<AdmissaoRegra, "unidades" | "cargos" | "regimes" | "sexos">),
        unidades: mu.get(r.id) ?? [],
        cargos: mc.get(r.id) ?? [],
        regimes: mr.get(r.id) ?? [],
        sexos: ms.get(r.id) ?? [],
      })) as AdmissaoRegra[];
    },
  });

  const parentescos = useQuery({
    queryKey: ["dp-admissao-parentescos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<AdmissaoParentesco[]> => {
      const { data, error } = await supabase
        .from("dp_admissao_regra_parentescos")
        .select("id, company_id, parentesco, permite_dependente, permite_sesc")
        .eq("company_id", selectedCompanyId!)
        .order("parentesco");
      if (error) throw error;
      return (data ?? []) as AdmissaoParentesco[];
    },
  });

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ["dp-admissao-regras", selectedCompanyId] });
    void qc.invalidateQueries({ queryKey: ["dp-admissao-parentescos", selectedCompanyId] });
  };

  /** Cria ou atualiza uma regra (padrão ou exceção) com suas seleções. */
  const salvar = useMutation({
    mutationFn: async (p: RegraEntrada) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const { data, error } = await supabase.rpc("dp_admissao_regra_salvar", {
        p_regra: {
          id: p.id ?? null,
          company_id: selectedCompanyId,
          tipo: p.tipo,
          chave: p.chave,
          exigencia: p.exigencia,
          padrao: p.padrao,
          unidades: p.padrao ? [] : p.unidades,
          cargos: p.padrao ? [] : p.cargos,
          regimes: p.padrao ? [] : p.regimes,
          sexos: p.padrao ? [] : (p.sexos ?? []),
        },
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidar,
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("dp_admissao_regra_excluir", { p_id: id });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  /** Marca/desmarca um grau de parentesco aceito na lista de familiares. */
  const definirParentesco = useMutation({
    mutationFn: async (p: { parentesco: string; dependente: boolean; sesc: boolean }) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      if (!p.dependente && !p.sesc) {
        const { error } = await supabase.from("dp_admissao_regra_parentescos").delete()
          .eq("company_id", selectedCompanyId).eq("parentesco", p.parentesco);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("dp_admissao_regra_parentescos")
        .upsert({
          company_id: selectedCompanyId,
          parentesco: p.parentesco,
          permite_dependente: p.dependente,
          permite_sesc: p.sesc,
        }, { onConflict: "company_id,parentesco" });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { regras, parentescos, salvar, excluir, definirParentesco };
}

/** "MASCULINO", "m", "Homem" → masculino; nada reconhecido → null. */
export function sexoCanonico(v?: string | null): "masculino" | "feminino" | null {
  const t = (v ?? "").trim().toLowerCase();
  if (t.startsWith("m") || t.startsWith("h")) return "masculino";
  if (t.startsWith("f")) return "feminino";
  return null;
}

/**
 * Mesma decisão do servidor: entre as regras que casam com a combinação,
 * vence a mais específica (cargo 8 + vínculo 4 + unidade 2 + sexo 1) e, no
 * empate, a última salva. Usada só para o simulador da tela.
 */
export function resolverExigencia(
  regras: AdmissaoRegra[],
  alvo: {
    unidade_id: string | null;
    cargo_id: string | null;
    regime: string | null;
    sexo?: string | null;
  },
): Exigencia | null {
  const sexo = sexoCanonico(alvo.sexo);
  let melhor: { peso: number; exigencia: Exigencia } | null = null;
  for (const r of regras) {
    if (r.unidades.length && (!alvo.unidade_id || !r.unidades.includes(alvo.unidade_id))) continue;
    if (r.cargos.length && (!alvo.cargo_id || !r.cargos.includes(alvo.cargo_id))) continue;
    if (r.regimes.length && (!alvo.regime || !r.regimes.includes(alvo.regime))) continue;
    if ((r.sexos ?? []).length && (!sexo || !r.sexos.includes(sexo))) continue;
    const peso = (r.cargos.length ? 8 : 0) + (r.regimes.length ? 4 : 0)
      + (r.unidades.length ? 2 : 0) + ((r.sexos ?? []).length ? 1 : 0);
    if (!melhor || peso > melhor.peso) melhor = { peso, exigencia: r.exigencia };
  }
  return melhor?.exigencia ?? null;
}
