import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export type PessoaApoioTipo = "teste" | "folguista";

export interface PessoaApoio {
  id: string;
  nome: string;
  telefone: string | null;
  tipo: PessoaApoioTipo;
  cargo_id: string | null;
  unidade_id: string | null;
  cpf: string | null;
  genero: string | null;
  data_nascimento: string | null;
  observacao: string | null;
  colaborador_id: string | null;
  ativo: boolean;
}

export interface PessoaApoioInput extends Omit<PessoaApoio, "id" | "ativo"> {
  id?: string;
  ativo?: boolean;
}

const COLS =
  "id, nome, telefone, tipo, cargo_id, unidade_id, cpf, genero, data_nascimento, observacao, colaborador_id, ativo";

/** Banco de folguistas e pessoas em teste reaproveitáveis na rotina do dia. */
export function useDpPessoasApoio(opts?: { apenasAtivos?: boolean }) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: ["dp_pessoas_apoio", selectedCompanyId, opts?.apenasAtivos ?? false],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_pessoas_apoio")
        .select(COLS)
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (opts?.apenasAtivos) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PessoaApoio[];
    },
  });
}

export function useSalvarDpPessoaApoio() {
  const { selectedCompanyId } = useCompany();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PessoaApoioInput): Promise<string> => {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        company_id: selectedCompanyId!,
        nome: input.nome.trim(),
        telefone: input.telefone?.trim() || null,
        tipo: input.tipo,
        cargo_id: input.cargo_id || null,
        unidade_id: input.unidade_id || null,
        cpf: input.cpf?.replace(/\D/g, "") || null,
        genero: input.genero || null,
        data_nascimento: input.data_nascimento || null,
        observacao: input.observacao?.trim() || null,
        colaborador_id: input.colaborador_id || null,
        ativo: input.ativo ?? true,
      };
      if (input.id) {
        const { data, error } = await supabase
          .from("dp_pessoas_apoio")
          .update(payload)
          .eq("id", input.id)
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      }
      const { data, error } = await supabase
        .from("dp_pessoas_apoio")
        .insert({ ...payload, criado_por: userData.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_pessoas_apoio"] }),
  });
}

export function useExcluirDpPessoaApoio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_pessoas_apoio").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_pessoas_apoio"] }),
  });
}
