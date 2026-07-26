import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

export type DpCadastroSolicitacao = Database["public"]["Tables"]["dp_cadastro_solicitacoes"]["Row"];

export type DecidirCadastroInput = {
  id: string;
  approve: boolean;
  motivo?: string;
};

/**
 * Dados e mutations da tela de Aprovações de cadastro (DP).
 */
export function useDpAprovacoes() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["dp_cadastro_solicitacoes", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_cadastro_solicitacoes")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .eq("status", "pendente")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DpCadastroSolicitacao[];
    },
  });

  const decidir = useMutation({
    mutationFn: async ({ id, approve, motivo }: DecidirCadastroInput) => {
      const sol = listQuery.data?.find((s) => s.id === id);
      if (!sol) throw new Error("Solicitação não encontrada");

      if (approve) {
        const { error: insErr } = await supabase.from("dp_colaboradores").insert({
          company_id: sol.company_id,
          nome: sol.nome,
          cpf: sol.cpf,
          cargo: sol.cargo ?? "",
          email: sol.email,
          telefone: sol.telefone,
          data_nascimento: sol.data_nascimento,
          observacoes: sol.observacoes,
          ativo: true,
          aprovacao_status: "aprovado",
        });
        if (insErr) throw insErr;
      }

      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("dp_cadastro_solicitacoes")
        .update({
          status: approve ? "aprovado" : "recusado",
          motivo_recusa: approve ? null : motivo ?? null,
          reviewed_by: userRes.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      toast({ title: vars.approve ? "Cadastro aprovado" : "Cadastro recusado" });
      qc.invalidateQueries({ queryKey: ["dp_cadastro_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const items = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  return {
    items,
    isLoading: listQuery.isLoading,
    decidir,
  };
}
