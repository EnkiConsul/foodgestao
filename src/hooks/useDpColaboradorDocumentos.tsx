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

type Anexo = DpColaboradorDocumento & { dp_documentos?: any };

/** SHA-256 do arquivo enviado, usado como prova de integridade no aceite. */
async function hashArquivo(file: File): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Checklist de documentos de um colaborador: requisitos da empresa resolvidos
 * contra o que já foi enviado, com upload (um ou vários arquivos por item),
 * aprovação, dispensa e aceite eletrônico opcional.
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
          "id, company_id, data_nascimento, regime, vinculo_label, estado_civil, veiculo_proprio, aprendiz, possui_folha_ponto, cargo_id, dp_cargos(exige_cnh, exige_epi)",
        )
        .eq("id", colaboradorId!)
        .maybeSingle();
      if (e1) throw e1;
      if (!colab) throw new Error("Colaborador não encontrado");

      const [reqs, vincs, deps] = await Promise.all([
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
      ]);
      if (reqs.error) throw reqs.error;
      if (vincs.error) throw vincs.error;
      if (deps.error) throw deps.error;

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
        vinculos: (vincs.data ?? []) as Anexo[],
        dependentes: (deps.data ?? []) as any[],
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
    });
  }, [base.data]);

  const resumo = useMemo(() => resumirChecklist(itens), [itens]);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["dp_colaborador_documentos"] });
    qc.invalidateQueries({ queryKey: ["dp_documentos"] });
    qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
    qc.invalidateQueries({ queryKey: ["dp_pendencias_colaborador"] });
  };

  const arquivoDoAnexo = (anexo?: DpColaboradorDocumento | null) =>
    (anexo as any)?.dp_documentos ?? null;

  const arquivoDoItem = (item: ItemChecklist) => arquivoDoAnexo(item.vinculo);

  /** Anexa um arquivo ao requisito. Itens com vários arquivos criam nova linha. */
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

      const hash = await hashArquivo(file);

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
        conteudo_hash: hash,
        dispensado: false,
        motivo_dispensa: null,
        aceite_solicitado_em: null,
        aceito_em: null,
      };

      // Substitui a linha existente apenas quando o item aceita um único arquivo.
      const substituir = !item.multiplos && item.vinculo;
      if (substituir) {
        const { error } = await supabase
          .from("dp_colaborador_documentos")
          .update(payload)
          .eq("id", item.vinculo!.id);
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
    mutationFn: async ({
      item,
      anexo,
      validade,
    }: { item: ItemChecklist; anexo?: DpColaboradorDocumento | null; validade?: string | null }) => {
      const alvo = anexo ?? item.vinculo;
      if (!alvo) throw new Error("Nenhum documento enviado");
      const { error } = await supabase
        .from("dp_colaborador_documentos")
        .update({ status: "aprovado", validade: validade ?? alvo.validade })
        .eq("id", alvo.id);
      if (error) throw error;
      if (alvo.documento_id) {
        await supabase
          .from("dp_documentos")
          .update({
            aprovacao_status: "aprovado",
            revisado_por: user?.id,
            revisado_em: new Date().toISOString(),
            motivo_recusao: null,
          })
          .eq("id", alvo.documento_id);
      }
    },
    onSuccess: () => {
      toast.success("Documento aprovado");
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao aprovar"),
  });

  const recusar = useMutation({
    mutationFn: async ({
      item,
      anexo,
      motivo,
    }: { item: ItemChecklist; anexo?: DpColaboradorDocumento | null; motivo: string }) => {
      const alvo = anexo ?? item.vinculo;
      if (!alvo) throw new Error("Nenhum documento enviado");
      const { error } = await supabase
        .from("dp_colaborador_documentos")
        .update({ status: "recusado" })
        .eq("id", alvo.id);
      if (error) throw error;
      if (alvo.documento_id) {
        await supabase
          .from("dp_documentos")
          .update({
            aprovacao_status: "recusado",
            motivo_recusao: motivo,
            revisado_por: user?.id,
            revisado_em: new Date().toISOString(),
          })
          .eq("id", alvo.documento_id);
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
    mutationFn: async ({
      item,
      anexo,
      validade,
    }: { item: ItemChecklist; anexo?: DpColaboradorDocumento | null; validade: string | null }) => {
      const alvo = anexo ?? item.vinculo;
      if (!alvo) throw new Error("Nenhum documento enviado");
      const { error } = await supabase
        .from("dp_colaborador_documentos")
        .update({ validade })
        .eq("id", alvo.id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar a validade"),
  });

  /** Remove um anexo (arquivo) do requisito. */
  const excluirAnexo = useMutation({
    mutationFn: async ({ anexo }: { anexo: DpColaboradorDocumento }) => {
      const { error } = await supabase
        .from("dp_colaborador_documentos")
        .delete()
        .eq("id", anexo.id);
      if (error) throw error;
      const doc = arquivoDoAnexo(anexo);
      if (doc?.file_path) {
        await supabase.storage.from(DP_DOCUMENTOS_BUCKET).remove([doc.file_path]);
      }
      if (anexo.documento_id) {
        await supabase.from("dp_documentos").delete().eq("id", anexo.documento_id);
      }
    },
    onSuccess: () => {
      toast.success("Anexo removido");
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover o anexo"),
  });

  /** Envia um anexo já existente para o aceite eletrônico do colaborador (opcional). */
  const pedirAceite = useMutation({
    mutationFn: async ({ anexo }: { anexo: DpColaboradorDocumento }) => {
      const { error } = await supabase
        .from("dp_colaborador_documentos")
        .update({ aceite_solicitado_em: new Date().toISOString(), aceito_em: null })
        .eq("id", anexo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Enviado para o aceite do colaborador no portal");
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao enviar para aceite"),
  });

  /** Cancela a solicitação de aceite ainda não assinada. */
  const cancelarAceite = useMutation({
    mutationFn: async ({ anexo }: { anexo: DpColaboradorDocumento }) => {
      const { error } = await supabase
        .from("dp_colaborador_documentos")
        .update({ aceite_solicitado_em: null })
        .eq("id", anexo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação de aceite cancelada");
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao cancelar"),
  });

  /** Aceite eletrônico do colaborador, com hash e trilha de auditoria. */
  const aceitar = useMutation({
    mutationFn: async ({
      item,
      anexo,
    }: { item: ItemChecklist; anexo?: DpColaboradorDocumento | null }) => {
      const ctx = base.data;
      const alvo = anexo ?? item.vinculo;
      if (!ctx || !alvo) throw new Error("Documento não disponível para aceite");

      const { error: eAceite } = await supabase.from("dp_documento_aceites").insert({
        company_id: ctx.colaborador.company_id,
        colaborador_id: ctx.colaborador.id,
        requisito_id: item.requisito.id,
        documento_id: alvo.documento_id,
        modelo: item.requisito.tipo_documento,
        modelo_versao: "anexo",
        conteudo_hash: (alvo as any).conteudo_hash ?? "",
        aceito_por: user?.id ?? null,
        user_agent: navigator.userAgent.slice(0, 500),
      });
      if (eAceite) throw eAceite;

      const { error } = await supabase
        .from("dp_colaborador_documentos")
        .update({ aceito_em: new Date().toISOString() })
        .eq("id", alvo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aceite registrado com data, hora e dispositivo");
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao registrar o aceite"),
  });

  /** Gera link assinado e abre o arquivo. */
  const abrirArquivo = async (anexo?: DpColaboradorDocumento | null) => {
    const doc = arquivoDoAnexo(anexo);
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

  const abrir = async (item: ItemChecklist) => abrirArquivo(item.vinculo);

  return {
    isLoading: base.isLoading,
    error: base.error,
    contexto: base.data?.colaborador ?? null,
    itens,
    resumo,
    arquivoDoItem,
    arquivoDoAnexo,
    enviar,
    aprovar,
    recusar,
    dispensar,
    definirValidade,
    excluirAnexo,
    pedirAceite,
    cancelarAceite,
    aceitar,
    abrir,
    abrirArquivo,
  };
}
