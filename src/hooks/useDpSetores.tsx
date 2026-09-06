import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";

export type DpSetor = Database["public"]["Tables"]["dp_setores"]["Row"];
export type DpSetorInsert = Database["public"]["Tables"]["dp_setores"]["Insert"];

export type DpSetorComContagem = DpSetor & { colaboradores_count: number };

export type SetorInput = {
  id?: string;
  unidade_id: string;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
};

/** Setores da empresa ativa (opcionalmente filtrados por unidade), com a contagem de colaboradores. */
export function useDpSetores(unidadeId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();

  const query = useQuery({
    queryKey: ["dp_setores", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<DpSetorComContagem[]> => {
      const [setores, colaboradores] = await Promise.all([
        supabase
          .from("dp_setores")
          .select("*")
          .eq("company_id", selectedCompanyId!)
          .order("nome"),
        supabase
          .from("dp_colaboradores")
          .select("setor_id")
          .eq("company_id", selectedCompanyId!)
          .not("setor_id", "is", null),
      ]);
      if (setores.error) throw setores.error;
      if (colaboradores.error) throw colaboradores.error;

      const contagem = new Map<string, number>();
      (colaboradores.data ?? []).forEach((r) => {
        if (r.setor_id) contagem.set(r.setor_id, (contagem.get(r.setor_id) ?? 0) + 1);
      });

      return (setores.data ?? []).map((s) => ({
        ...s,
        colaboradores_count: contagem.get(s.id) ?? 0,
      }));
    },
  });

  const todos = query.data ?? [];
  const setores = useMemo(
    () => (unidadeId ? todos.filter((s) => s.unidade_id === unidadeId) : todos),
    [todos, unidadeId],
  );

  /** Nomes de setores cadastrados em outras unidades, para reaproveitar o nome. */
  const sugestoes = useMemo(() => {
    if (!unidadeId) return [];
    const usados = new Set(setores.map((s) => normalizarNomeSetor(s.nome)));
    const nomes = new Map<string, string>();
    todos
      .filter((s) => s.unidade_id !== unidadeId)
      .forEach((s) => {
        const chave = normalizarNomeSetor(s.nome);
        if (!usados.has(chave) && !nomes.has(chave)) nomes.set(chave, s.nome.trim());
      });
    return [...nomes.values()].sort((a, b) => a.localeCompare(b));
  }, [todos, setores, unidadeId]);

  return {
    setores,
    todos,
    ativos: setores.filter((s) => s.ativo),
    sugestoes,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** Espelha `public.dp_nome_normalizado`: minúsculas, sem acentos e sem espaços nas pontas. */
export function normalizarNomeSetor(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function useUpsertDpSetor() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (input: SetorInput): Promise<DpSetor> => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      if (!input.unidade_id) throw new Error("O setor precisa estar ligado a uma unidade.");
      const nome = input.nome.trim();
      if (!nome) throw new Error("Informe o nome do setor.");

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;

      if (input.id) {
        const { data, error } = await supabase
          .from("dp_setores")
          .update({
            nome,
            descricao: input.descricao?.trim() || null,
            ativo: input.ativo ?? true,
            updated_by: uid,
          })
          .eq("id", input.id)
          .select("*")
          .single();
        if (error) throw traduzirErroSetor(error);
        return data;
      }

      const { data, error } = await supabase
        .from("dp_setores")
        .insert({
          company_id: selectedCompanyId,
          unidade_id: input.unidade_id,
          nome,
          descricao: input.descricao?.trim() || null,
          ativo: input.ativo ?? true,
          created_by: uid,
          updated_by: uid,
        })
        .select("*")
        .single();
      if (error) throw traduzirErroSetor(error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_setores"] });
      qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
    },
  });
}

export function useToggleDpSetorAtivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("dp_setores").update({ ativo }).eq("id", id);
      if (error) throw traduzirErroSetor(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_setores"] }),
  });
}

export function useDeleteDpSetor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { count, error: countError } = await supabase
        .from("dp_colaboradores")
        .select("id", { count: "exact", head: true })
        .eq("setor_id", id);
      if (countError) throw countError;
      if ((count ?? 0) > 0) {
        throw new Error(
          "Este setor possui colaboradores vinculados. Você pode desativá-lo.",
        );
      }
      const { error } = await supabase.from("dp_setores").delete().eq("id", id);
      if (error) throw traduzirErroSetor(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_setores"] });
      qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
    },
  });
}

function traduzirErroSetor(error: { message?: string; code?: string }): Error {
  const msg = error?.message ?? "";
  if (error?.code === "23505" || /duplicate key|dp_setores_unidade_nome_uniq/i.test(msg)) {
    return new Error("Já existe um setor com esse nome nesta unidade.");
  }
  if (/SETOR_UNIDADE_INVALIDA/.test(msg)) {
    return new Error("O setor pertence a outra unidade.");
  }
  if (/SETOR_EMPRESA_INVALIDA/.test(msg)) {
    return new Error("O setor pertence a outra empresa.");
  }
  if (/dp_colaboradores_setor/.test(msg)) {
    return new Error("Este setor possui colaboradores vinculados. Você pode desativá-lo.");
  }
  return new Error(msg || "Não foi possível salvar o setor.");
}
