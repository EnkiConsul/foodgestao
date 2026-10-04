import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export type SubstituicaoStatus =
  | "aguardando_colega"
  | "pendente_aprovacao"
  | "aprovada"
  | "rejeitada"
  | "recusada_colega"
  | "cancelada";

export interface Substituicao {
  id: string;
  company_id: string;
  convocacao_id: string;
  solicitante_id: string;
  tipo: "colega" | "terceiro";
  colega_id: string | null;
  terceiro_nome: string | null;
  terceiro_cpf: string | null;
  terceiro_telefone: string | null;
  banco_codigo: string | null;
  banco_nome: string | null;
  agencia: string | null;
  conta: string | null;
  conta_digito: string | null;
  conta_tipo: string | null;
  pix_tipo: string | null;
  pix_chave: string | null;
  documento_foto_path: string | null;
  motivo: string | null;
  status: SubstituicaoStatus;
  decisao_motivo: string | null;
  created_at: string;
  convocacao?: { data: string; entrada: string; saida: string; unidade_id: string | null } | null;
  solicitante?: { nome: string } | null;
  colega?: { nome: string } | null;
}

export const STATUS_SUBST: Record<SubstituicaoStatus, string> = {
  aguardando_colega: "Aguardando o colega",
  pendente_aprovacao: "Aguardando o gestor",
  aprovada: "Aprovada",
  rejeitada: "Recusada pelo gestor",
  recusada_colega: "Recusada pelo colega",
  cancelada: "Cancelada",
};

const COLS =
  "*, convocacao:dp_convocacoes!dp_convocacao_substituicoes_convocacao_id_fkey(data, entrada, saida, unidade_id), solicitante:dp_colaboradores!dp_convocacao_substituicoes_solicitante_id_fkey(nome), colega:dp_colaboradores!dp_convocacao_substituicoes_colega_id_fkey(nome)";

/** Traduz o código do erro do banco ("CODIGO: texto") para a mensagem da pessoa. */
export function mensagemErro(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as any)?.message ?? e);
  const partes = msg.split(/:\s(.+)/);
  return partes.length > 1 && /^[A-Z_]+$/.test(partes[0]) ? partes[1] : msg;
}

const chaves = ["dp_substituicoes", "dp_convocacoes_meu_cal", "dp_minhas_convocacoes", "dp_disponibilidade_painel", "dp_disponibilidade_dia", "dp_pessoas_apoio", "dp_convocacoes"];

function useInvalidar() {
  const qc = useQueryClient();
  return () => chaves.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

/** Pedidos de substituição visíveis para quem está logado (próprios, convites ou todos, se gestor). */
export function useDpSubstituicoes(opts: { companyId?: string | null; status?: SubstituicaoStatus[] } = {}) {
  return useQuery({
    queryKey: ["dp_substituicoes", opts.companyId ?? null, (opts.status ?? []).join(",")],
    queryFn: async () => {
      let q = (supabase.from as any)("dp_convocacao_substituicoes")
        .select(COLS)
        .order("created_at", { ascending: false })
        .limit(200);
      if (opts.companyId) q = q.eq("company_id", opts.companyId);
      if (opts.status?.length) q = q.in("status", opts.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Substituicao[];
    },
  });
}

export function useDpSubstituicoesGestor() {
  const { selectedCompanyId } = useCompanyContext();
  return useDpSubstituicoes({ companyId: selectedCompanyId, status: ["pendente_aprovacao"] });
}

export interface ColegaSubstituto {
  colaborador_id: string;
  nome: string;
  cargo_nome: string | null;
  unidade_nome: string | null;
}

export function useColegasSubstitutos(convocacaoId: string | null) {
  return useQuery({
    queryKey: ["dp_colegas_substitutos", convocacaoId],
    enabled: !!convocacaoId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("dp_convocacao_colegas_substitutos", {
        p_convocacao_id: convocacaoId,
      });
      if (error) throw error;
      return (data ?? []) as ColegaSubstituto[];
    },
  });
}

export function useSolicitarSubstituicao() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (input: {
      convocacaoId: string;
      tipo: "colega" | "terceiro";
      colegaId?: string | null;
      dados?: Record<string, unknown>;
    }) => {
      const { data, error } = await (supabase.rpc as any)("dp_convocacao_substituicao_solicitar", {
        p_convocacao_id: input.convocacaoId,
        p_tipo: input.tipo,
        p_colega_id: input.colegaId ?? null,
        p_dados: input.dados ?? {},
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_d, v) => {
      toast.success(
        v.tipo === "colega"
          ? "Convite enviado ao colega. O plantão passa para ele quando ele aceitar."
          : "Indicação enviada ao gestor. Até a aprovação, o plantão continua com você.",
      );
      invalidar();
    },
    onError: (e) => toast.error("Não foi possível enviar", { description: mensagemErro(e) }),
  });
}

export function useResponderConviteColega() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, aceitar }: { id: string; aceitar: boolean }) => {
      const { data, error } = await (supabase.rpc as any)("dp_convocacao_substituicao_responder_colega", {
        p_id: id,
        p_aceitar: aceitar,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (r) => {
      toast.success(r === "aprovada" ? "Plantão assumido. Ele já aparece no seu calendário." : "Convite recusado.");
      invalidar();
    },
    onError: (e) => toast.error("Não foi possível responder", { description: mensagemErro(e) }),
  });
}

export function useCancelarSubstituicao() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.rpc as any)("dp_convocacao_substituicao_cancelar", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido cancelado. O plantão continua com você.");
      invalidar();
    },
    onError: (e) => toast.error("Não foi possível cancelar", { description: mensagemErro(e) }),
  });
}

export function useDecidirSubstituicao() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, aprovar, motivo }: { id: string; aprovar: boolean; motivo?: string }) => {
      const { data, error } = await (supabase.rpc as any)("dp_convocacao_substituicao_decidir", {
        p_id: id,
        p_aprovar: aprovar,
        p_motivo: motivo ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (r) => {
      toast.success(
        r === "aprovada"
          ? "Substituição aprovada. O folguista foi cadastrado e o plantão passou para ele."
          : "Substituição recusada. O plantão segue com quem foi convocado.",
      );
      invalidar();
    },
    onError: (e) => toast.error("Não foi possível decidir", { description: mensagemErro(e) }),
  });
}

/** Envia o documento com foto para a pasta privada da empresa. */
export async function enviarDocumentoFoto(prefixo: string, file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error("O documento deve ter no máximo 10 MB.");
  if (!/^(image\/|application\/pdf)/.test(file.type)) {
    throw new Error("Envie uma foto (JPG/PNG) ou PDF do documento.");
  }
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${prefixo}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("dp-documentos").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`Não foi possível enviar o documento: ${error.message}`);
  return path;
}

export async function abrirDocumentoFoto(path: string) {
  const { data, error } = await supabase.storage.from("dp-documentos").createSignedUrl(path, 120);
  if (error || !data?.signedUrl) {
    toast.error("Não foi possível abrir o documento", { description: error?.message });
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}
