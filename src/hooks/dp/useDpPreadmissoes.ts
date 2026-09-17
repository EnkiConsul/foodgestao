/**
 * Pré-Admissão pelo Candidato — acesso do gestor.
 *
 * Tudo passa pelas rotinas do servidor (`dp-preadmissao-convite` e
 * `dp-preadmissao-gestor`): o aplicativo só consulta. A empresa é sempre a
 * empresa selecionada e é reconferida no servidor.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export type PreadmissaoStatus =
  | "aguardando_preenchimento"
  | "em_preenchimento"
  | "aguardando_revisao"
  | "correcao_solicitada"
  | "aguardando_nova_versao"
  | "pronto_contabilidade"
  | "enviado_contabilidade"
  | "aguardando_retorno_contabilidade"
  | "registro_recebido"
  | "concluido"
  | "expirado"
  | "cancelado";

/** Rótulos de tela (Primeira Maiúscula, como toda comunicação do sistema). */
export const PREADMISSAO_STATUS_LABEL: Record<PreadmissaoStatus, string> = {
  aguardando_preenchimento: "Aguardando O Candidato",
  em_preenchimento: "Candidato Preenchendo",
  aguardando_revisao: "Aguardando Sua Revisão",
  correcao_solicitada: "Correção Pedida Ao Candidato",
  aguardando_nova_versao: "Aguardando Nova Versão",
  pronto_contabilidade: "Pronta Para A Contabilidade",
  enviado_contabilidade: "Enviada À Contabilidade",
  aguardando_retorno_contabilidade: "Aguardando Retorno Da Contabilidade",
  registro_recebido: "Ficha Oficial Conferida",
  concluido: "Admissão Concluída",
  expirado: "Link Expirado",
  cancelado: "Cancelada",
};

export interface PreadmissaoResumo {
  id: string;
  company_id: string;
  candidato_nome: string;
  whatsapp: string;
  status: PreadmissaoStatus;
  cargo_previsto_id: string | null;
  unidade_prevista_id: string | null;
  trabalho_apos_22h: boolean;
  enviado_em: string | null;
  revisado_em: string | null;
  contabilidade_enviado_em: string | null;
  ficha_oficial_conferida_em: string | null;
  colaborador_id: string | null;
  created_at: string;
  updated_at: string;
  convite_expira_em: string | null;
}

export interface PreadmissaoPessoa {
  id: string;
  nome: string;
  parentesco: string | null;
  data_nascimento: string | null;
  cpf: string | null;
  rg: string | null;
  finalidade_dependente: boolean;
  finalidade_sesc: boolean;
}

export interface PreadmissaoDocumento {
  id: string;
  requisito_codigo: string;
  pessoa_id: string | null;
  file_name: string;
  status: "pendente" | "aprovado" | "recusado";
  motivo_recusa: string | null;
  versao: number;
  created_at: string;
  substituido_em: string | null;
}

export interface PreadmissaoDetalhe {
  preadmissao: PreadmissaoResumo & {
    dados: Record<string, unknown> | null;
    admin_dados: Record<string, unknown> | null;
    correcao_motivo: string | null;
  };
  pessoas: PreadmissaoPessoa[];
  documentos: PreadmissaoDocumento[];
  checklist: Array<{ key: string; codigo: string; titulo: string; pessoa_id?: string | null; pessoa_nome?: string | null; obrigatorio: boolean }>;
  pendencias: Array<{ key: string; titulo: string; pessoa_nome?: string | null }>;
  bloqueio: { situacao: "ok" | "bloqueado" | "pendente"; mensagem: string };
  eventos: Array<{ evento: string; detalhe: unknown; created_at: string }>;
}

async function chamar<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    // A rotina responde com uma frase pronta para a tela; nunca mostramos o
    // texto técnico do invoke.
    let detalhe = "";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const corpo = await ctx.json().catch(() => null) as { error?: string } | null;
      detalhe = corpo?.error ?? "";
    }
    if (!detalhe) detalhe = ((data as { error?: string } | null)?.error) ?? "";
    throw new Error(detalhe || "Não foi possível concluir agora. Tente novamente.");
  }
  const erro = (data as { error?: string } | null)?.error;
  if (erro) throw new Error(erro);
  return data as T;
}

export function useDpPreadmissoes() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_preadmissoes", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const r = await chamar<{ preadmissoes: PreadmissaoResumo[] }>("dp-preadmissao-gestor", {
        action: "listar",
        company_id: selectedCompanyId,
      });
      return r.preadmissoes ?? [];
    },
  });
}

export function useDpPreadmissao(id: string | null) {
  return useQuery({
    queryKey: ["dp_preadmissao", id],
    enabled: !!id,
    queryFn: async () =>
      await chamar<PreadmissaoDetalhe>("dp-preadmissao-gestor", { action: "ler", preadmissao_id: id }),
  });
}

/** Convite: criar, reenviar (renova a validade) e cancelar. */
export function useDpPreadmissaoConvite() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["dp_preadmissoes"] });
    qc.invalidateQueries({ queryKey: ["dp_preadmissao"] });
    qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
  };

  const criar = useMutation({
    mutationFn: async (entrada: {
      candidato_nome: string;
      whatsapp: string;
      cargo_previsto_id: string | null;
      unidade_prevista_id: string | null;
      trabalho_apos_22h: boolean;
      dias_validade?: number;
    }) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      return await chamar<{ preadmissao_id: string; link: string; expires_at: string }>(
        "dp-preadmissao-convite",
        { action: "criar", company_id: selectedCompanyId, ...entrada },
      );
    },
    onSuccess: invalidar,
  });

  const reenviar = useMutation({
    mutationFn: async (entrada: { preadmissao_id: string; dias_validade?: number }) =>
      await chamar<{ link: string; expires_at: string }>("dp-preadmissao-convite", {
        action: "reenviar",
        ...entrada,
      }),
    onSuccess: invalidar,
  });

  const revogar = useMutation({
    mutationFn: async (preadmissaoId: string) =>
      await chamar<{ status: string }>("dp-preadmissao-convite", {
        action: "revogar",
        preadmissao_id: preadmissaoId,
      }),
    onSuccess: invalidar,
  });

  return { criar, reenviar, revogar };
}

/** Ações de revisão do gestor. */
export function useDpPreadmissaoGestor(id: string | null) {
  const qc = useQueryClient();
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["dp_preadmissao", id] });
    qc.invalidateQueries({ queryKey: ["dp_preadmissoes"] });
    qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
  };
  const acao = <T,>(body: Record<string, unknown>) =>
    chamar<T>("dp-preadmissao-gestor", { preadmissao_id: id, ...body });

  return {
    solicitarCorrecao: useMutation({
      mutationFn: async (motivo: string) => await acao({ action: "solicitar_correcao", motivo }),
      onSuccess: invalidar,
    }),
    salvarAdmin: useMutation({
      mutationFn: async (admin_dados: Record<string, unknown>) =>
        await acao({ action: "salvar_admin", admin_dados }),
      onSuccess: invalidar,
    }),
    alterarPrevisto: useMutation({
      mutationFn: async (patch: Record<string, unknown>) => await acao({ action: "alterar_previsto", ...patch }),
      onSuccess: invalidar,
    }),
    prepararContabilidade: useMutation({
      mutationFn: async () => await acao({ action: "preparar_contabilidade" }),
      onSuccess: invalidar,
    }),
    avaliarDocumento: useMutation({
      mutationFn: async (entrada: { documento_id: string; status: "aprovado" | "recusado"; motivo?: string }) =>
        await acao({ action: "avaliar_documento", ...entrada }),
      onSuccess: invalidar,
    }),
    marcarStatus: useMutation({
      mutationFn: async (status: PreadmissaoStatus) => await acao({ action: "marcar_status", status }),
      onSuccess: invalidar,
    }),
  };
}

/** Link temporário para abrir um documento enviado pelo candidato. */
export async function abrirDocumentoPreadmissao(documentoId: string): Promise<string> {
  const r = await chamar<{ url: string }>("dp-preadmissao-arquivo", { action: "url", documento_id: documentoId });
  return r.url;
}

/** Anexa a ficha oficial devolvida pela contabilidade e registra a conferência. */
export async function anexarFichaOficial(
  preadmissaoId: string,
  arquivo: File,
  conferida: boolean,
): Promise<void> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
    fr.readAsDataURL(arquivo);
  });
  await chamar("dp-preadmissao-arquivo", {
    action: "ficha_oficial",
    preadmissao_id: preadmissaoId,
    file_name: arquivo.name,
    mime_type: arquivo.type || "application/pdf",
    content_base64: base64,
    conferida,
  });
}
