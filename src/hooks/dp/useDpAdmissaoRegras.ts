/**
 * Regras de Admissão: a empresa define quais dados e documentos são
 * obrigatórios, opcionais ou não pedidos, por empresa, unidade, tipo de
 * vínculo e cargo. Também define quais graus de parentesco podem ser
 * incluídos na lista de familiares.
 *
 * A tela só lê e grava; quem decide o que vale em cada ficha é a rotina do
 * servidor (dp_admissao_regras_resolver), usada também pelas funções de borda.
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
  unidade_id: string | null;
  cargo_id: string | null;
  regime: string | null;
}

export interface AdmissaoParentesco {
  id: string;
  company_id: string;
  parentesco: string;
  permite_dependente: boolean;
  permite_sesc: boolean;
}

export interface EscopoRegra {
  unidade_id: string | null;
  cargo_id: string | null;
  regime: string | null;
}

export function useDpAdmissaoRegras() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const regras = useQuery({
    queryKey: ["dp-admissao-regras", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<AdmissaoRegra[]> => {
      const { data, error } = await supabase
        .from("dp_admissao_regras")
        .select("id, company_id, tipo, chave, exigencia, unidade_id, cargo_id, regime")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return (data ?? []) as AdmissaoRegra[];
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

  /** Define (ou remove) a exigência de um campo/documento em um escopo. */
  const definir = useMutation({
    mutationFn: async (
      p: { tipo: TipoRegra; chave: string; exigencia: Exigencia | null; escopo: EscopoRegra },
    ) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const alvo = {
        company_id: selectedCompanyId,
        tipo: p.tipo,
        chave: p.chave,
        unidade_id: p.escopo.unidade_id,
        cargo_id: p.escopo.cargo_id,
        regime: p.escopo.regime,
      };
      if (p.exigencia === null) {
        let q = supabase.from("dp_admissao_regras").delete()
          .eq("company_id", alvo.company_id).eq("tipo", alvo.tipo).eq("chave", alvo.chave);
        q = alvo.unidade_id ? q.eq("unidade_id", alvo.unidade_id) : q.is("unidade_id", null);
        q = alvo.cargo_id ? q.eq("cargo_id", alvo.cargo_id) : q.is("cargo_id", null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        q = alvo.regime ? q.eq("regime", alvo.regime as any) : q.is("regime", null);
        const { error } = await q;
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("dp_admissao_regras")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ ...alvo, exigencia: p.exigencia } as any, {
          onConflict: "company_id,tipo,chave,unidade_id,cargo_id,regime",
        });
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any, { onConflict: "company_id,parentesco" });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { regras, parentescos, definir, definirParentesco };
}
