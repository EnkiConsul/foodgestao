import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { DpDocumentoRequisito } from "@/lib/dp/documentos-requisitos";

type RequisitoUpdate = Partial<
  Pick<
    DpDocumentoRequisito,
    | "nome"
    | "descricao"
    | "obrigatoriedade"
    | "aplica_a"
    | "categoria"
    | "periodicidade"
    | "meses_validade"
    | "dias_aviso"
    | "ordem"
    | "permite_multiplos"
    | "exige_aceite"

  >
>;

/**
 * Catálogo de documentos exigidos da empresa. A lista padrão é semeada no
 * banco; aqui a empresa só ajusta obrigatoriedade, prazos e itens próprios.
 */
export function useDpDocumentoRequisitos() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["dp_documento_requisitos"] });
    qc.invalidateQueries({ queryKey: ["dp_colaborador_documentos"] });
    qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
  };

  const list = useQuery({
    queryKey: ["dp_documento_requisitos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_documento_requisitos")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as DpDocumentoRequisito[];
    },
  });

  const semear = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const { data, error } = await supabase.rpc("dp_documento_requisitos_seed", {
        _company_id: selectedCompanyId,
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: (qtd) => {
      toast.success(qtd > 0 ? `${qtd} documento(s) padrão adicionados` : "A lista padrão já está completa");
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao restaurar a lista padrão"),
  });

  const salvar = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: RequisitoUpdate }) => {
      const { error } = await supabase.from("dp_documento_requisitos").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const criar = useMutation({
    mutationFn: async (input: {
      nome: string;
      descricao?: string | null;
      categoria?: string;
      aplica_a?: string;
      obrigatoriedade?: string;
      periodicidade?: string;
      meses_validade?: number | null;
      dias_aviso?: number;
    }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const codigo = `custom_${Date.now()}`;
      const { error } = await supabase.from("dp_documento_requisitos").insert({
        company_id: selectedCompanyId,
        codigo,
        nome: input.nome,
        descricao: input.descricao ?? null,
        categoria: input.categoria ?? "admissao",
        aplica_a: input.aplica_a ?? "todos",
        obrigatoriedade: input.obrigatoriedade ?? "obrigatorio",
        periodicidade: input.periodicidade ?? "unica",
        meses_validade: input.meses_validade ?? null,
        dias_aviso: input.dias_aviso ?? 30,
        tipo_documento: "admissao",
        ordem: 900,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento adicionado à lista da empresa");
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao adicionar"),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_documento_requisitos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento removido da lista");
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover"),
  });

  return {
    requisitos: list.data ?? [],
    isLoading: list.isLoading,
    semear,
    salvar,
    criar,
    remover,
  };
}
