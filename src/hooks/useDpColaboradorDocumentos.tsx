import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFilename } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { DP_DOCUMENTOS_BUCKET } from "@/hooks/useDpDocumentos";
import {
  resolverChecklist,
  resumirChecklist,
  type DpColaboradorDocumento,
  type DpDocumentoRequisito,
  type ItemChecklist,
} from "@/lib/dp/documentos-requisitos";

type Opcoes = {
  /** true quando o próprio colaborador está enviando (portal). */
  comoColaborador?: boolean;
};

/**
 * Checklist de documentos de um colaborador: requisitos da empresa resolvidos
 * contra o que já foi enviado, com upload, aprovação e dispensa.
 */
export function useDpColaboradorDocumentos(colaboradorId?: string | null, opcoes: Opcoes = {}) {
  const { comoColaborador = false } = opcoes;
  const { user } = useAuth();
  const qc = useQueryClient();

  const base = useQuery({
    queryKey: ["dp_colaborador_documentos", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async () => {
      const { data: colab, error: e1 } = await supabase
        .from("dp_colaboradores")
        .select(
          "id, company_id, data_nascimento, regime, estado_civil, veiculo_proprio, aprendiz, possui_folha_ponto, cargo_id, dp_cargos(exige_cnh, exige_epi)",
        )
        .eq("id", colaboradorId!)
        .maybeSingle();
      if (e1) throw e1;
      if (!colab) throw new Error("Colaborador não encontrado");

      const [reqs, vincs, deps, aso] = await Promise.all([
        supabase
          .from("dp_documento_requisitos")
          .select("*")
          .eq("company_id", colab.company_id)
          .order("ordem"),
        supabase
          .from("dp_colaborador_documentos")
          .select("*, dp_documentos(id, file_path, file_name, mime_type, aprovacao_status, motivo_recusao, created_at)")
          .eq("colaborador_id", colaboradorId!),
        supabase
          .from("dp_dependentes")
          .select("id, nome, data_nascimento, deficiencia, cessado_em")
          .eq("colaborador_id", colaboradorId!),
        supabase
          .from("dp_exames_aso")
          .select("id, tipo, resultado")
          .eq("colaborador_id", colaboradorId!)
          .eq("tipo", "admissional"),
      ]);
      if (reqs.error) throw reqs.error;
      if (vincs.error) throw vincs.error;
      if (deps.error) throw deps.error;

      const asoOk = (aso.data ?? []).some(
        (a: any) => a.resultado === "apto" || a.resultado === "apto_com_restricoes",
      );

      return {
        colaborador: {
          id: colab.id,
          company_id: colab.company_id,
          data_nascimento: colab.data_nascimento,
          regime: colab.regime as string | null,
          estado_civil: (colab as any).estado_civil as string | null,
          veiculo_proprio: (colab as any).veiculo_proprio as boolean | null,
          aprendiz: colab.aprendiz,
          possui_folha_ponto: colab.possui_folha_ponto,
          cargo_exige_cnh: (colab as any).dp_cargos?.exige_cnh ?? false,
          cargo_exige_epi: (colab as any).dp_cargos?.exige_epi ?? false,
        },
        requisitos: (reqs.data ?? []) as DpDocumentoRequisito[],
        vinculos: (vincs.data ?? []) as (DpColaboradorDocumento & { dp_documentos?: any })[],
        dependentes: (deps.data ?? []) as any[],
        asoAdmissionalOk: asoOk,
      };
    },
  });

  const itens: ItemChecklist[] = useMemo(() => {
    if (!base.data) return [];
    return resolverChecklist({
      requisitos: base.data.requisitos,
      colaborador: base.data.colaborador,
      dependentes: base.data.dependentes,
      vinculos: base.data.vinculos,
      asoAdmissionalOk: base.data.asoAdmissionalOk,
    });
  }, [base.data]);

  const resumo = useMemo(() => resumirChecklist(itens), [itens]);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["dp_colaborador_documentos"] });
    qc.invalidateQueries({ queryKey: ["dp_documentos"] });
    qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
    qc.invalidateQueries({ queryKey: ["dp_pendencias_colaborador"] });
  };

  const arquivoDoItem = (item: ItemChecklist) =>
    (item.vinculo as any)?.dp_documentos ?? null;

  /** Envia (ou reenvia) o arquivo de um requisito. */
  const enviar = useMutation({
    mutationFn: async ({
      item,
      file,
      validade,
    }: { item: ItemChecklist; file: File; validade?: string | null }) => {
      const ctx = base.data;
      if (!ctx) throw new Error("Checklist não carregado");
      const path = `${ctx.colaborador.company_id}/${ctx.colaborador.id}/requisitos/${Date.now()}-${sanitizeStorageFilename(file.name)}`;
      const up = await supabase.storage.from(DP_DOCUMENTOS_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (up.error) throw up.error;

      const titulo = item.dependente
        ? `${item.requisito.nome} — ${item.dependente.nome}`
        : item.requisito.nome;

      const { data: doc, error: eDoc } = await supabase
        .from("dp_documentos")
        .insert({
          company_id: ctx.colaborador.company_id,
          colaborador_id: ctx.colaborador.id,
          tipo: item.requisito.tipo_documento,
          titulo,
          descricao: item.requisito.descricao,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          uploaded_by: user?.id,
          submetido_por_colaborador: comoColaborador,
          aprovacao_status: comoColaborador ? "pendente" : "aprovado",
          ...(comoColaborador ? {} : { revisado_por: user?.id, revisado_em: new Date().toISOString() }),
        })
        .select("id")
        .single();
      if (eDoc) throw eDoc;

      const payload = {
        company_id: ctx.colaborador.company_id,
        colaborador_id: ctx.colaborador.id,
        dependente_id: item.dependente?.id ?? null,
        requisito_id: item.requisito.id,
        documento_id: doc.id,
        status: comoColaborador ? "enviado" : "aprovado",
        validade: validade ?? null,
        dispensado: false,
        motivo_dispensa: null,
      };

      if (item.vinculo) {
        const { error } = await supabase
          .from("dp_colaborador_documentos")
          .update(payload)
          .eq("id", item.vinculo.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_colaborador_documentos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(comoColaborador ? "Documento enviado para aprovação" : "Documento anexado");
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao enviar documento"),
  });

  const aprovar = useMutation({
    mutationFn: async ({ item, validade }: { item: ItemChecklist; validade?: string | null }) => {
      if (!item.vinculo) throw new Error("Nenhum documento enviado");
      const { error } = await supabase
        .from("dp_colaborador_documentos")
        .update({ status: "aprovado", validade: validade ?? item.vinculo.validade })
        .eq("id", item.vinculo.id);
      if (error) throw error;
      if (item.vinculo.documento_id) {
        await supabase
          .from("dp_documentos")
          .update({
            aprovacao_status: "aprovado",
            revisado_por: user?.id,
            revisado_em: new Date().toISOString(),
            motivo_recusao: null,
          })
          .eq("id", item.vinculo.documento_id);
      }
    },
    onSuccess: () => {
      toast.success("Documento aprovado");
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao aprovar"),
  });

  const recusar = useMutation({
    mutationFn: async ({ item, motivo }: { item: ItemChecklist; motivo: string }) => {
      if (!item.vinculo) throw new Error("Nenhum documento enviado");
      const { error } = await supabase
        .from("dp_colaborador_documentos")
        .update({ status: "recusado" })
        .eq("id", item.vinculo.id);
      if (error) throw error;
      if (item.vinculo.documento_id) {
        await supabase
          .from("dp_documentos")
          .update({
            aprovacao_status: "recusado",
            motivo_recusao: motivo,
            revisado_por: user?.id,
            revisado_em: new Date().toISOString(),
          })
          .eq("id", item.vinculo.documento_id);
      }
    },
    onSuccess: () => {
      toast.success("Documento recusado — o colaborador foi notificado na lista de pendências");
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao recusar"),
  });

  const dispensar = useMutation({
    mutationFn: async ({ item, motivo }: { item: ItemChecklist; motivo: string }) => {
      const ctx = base.data;
      if (!ctx) throw new Error("Checklist não carregado");
      const payload = {
        company_id: ctx.colaborador.company_id,
        colaborador_id: ctx.colaborador.id,
        dependente_id: item.dependente?.id ?? null,
        requisito_id: item.requisito.id,
        status: "dispensado" as const,
        dispensado: true,
        motivo_dispensa: motivo,
      };
      if (item.vinculo) {
        const { error } = await supabase
          .from("dp_colaborador_documentos")
          .update(payload)
          .eq("id", item.vinculo.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_colaborador_documentos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Documento dispensado com justificativa");
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao dispensar"),
  });

  const definirValidade = useMutation({
    mutationFn: async ({ item, validade }: { item: ItemChecklist; validade: string | null }) => {
      if (!item.vinculo) throw new Error("Nenhum documento enviado");
      const { error } = await supabase
        .from("dp_colaborador_documentos")
        .update({ validade })
        .eq("id", item.vinculo.id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar a validade"),
  });

  /** Gera link assinado e abre o arquivo. */
  const abrir = async (item: ItemChecklist) => {
    const doc = arquivoDoItem(item);
    if (!doc?.file_path) return toast.error("Sem arquivo anexado");
    const { data, error } = await supabase.storage
      .from(DP_DOCUMENTOS_BUCKET)
      .createSignedUrl(doc.file_path, 60);
    if (error || !data) return toast.error("Erro ao gerar link");
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return {
    isLoading: base.isLoading,
    error: base.error,
    contexto: base.data?.colaborador ?? null,
    itens,
    resumo,
    arquivoDoItem,
    enviar,
    aprovar,
    recusar,
    dispensar,
    definirValidade,
    abrir,
  };
}
