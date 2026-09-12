import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { tituloDocumento } from "@/lib/dp/documento-titulo";

export type DocParaAssinar = {
  id: string;
  titulo: string;
  tipo: string;
  tipo_label: string;
  competencia_label: string;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  created_at: string;
};

const TIPO_LABEL: Record<string, string> = {
  contracheque: "Contracheque",
  contracheque_13: "Contracheque 13º",
  contracheque_ferias: "Contracheque Férias",
  aviso_ferias: "Aviso de Férias",
  recibo_ferias: "Recibo de Férias",
  informe_rendimentos: "Informe de Rendimentos",
  adiantamento: "Adiantamento",
  ponto: "Folha de Ponto",
  contrato: "Contrato",
  ferias: "Férias",
  outros: "Documento",
};

function fmtCompetencia(iso?: string | null): string {
  if (!iso) return "—";
  const s = String(iso);
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s);
  if (isNaN(d.getTime())) return "—";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/**
 * Seleciona apenas documentos enviados pela empresa que exigem assinatura e
 * ainda não foram aceitos, do mais antigo para o mais novo.
 */
export function selecionarPendentesAssinatura(
  docs: any[],
  aceites: { documento_id: string | null }[],
): DocParaAssinar[] {
  const aceitos = new Set((aceites ?? []).map((a) => a.documento_id).filter(Boolean) as string[]);
  return (docs ?? [])
    .filter(
      (d) =>
        !!d.exige_aceite &&
        !d.submetido_por_colaborador &&
        (d.aprovacao_status ?? "aprovado") === "aprovado" &&
        !aceitos.has(d.id),
    )
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((d) => {
      const tipo = String(d.tipo ?? "outros");
      const tipoLabel = TIPO_LABEL[tipo] ?? "Documento";
      const competencia = fmtCompetencia(d.referencia_data);
      return {
        id: d.id,
        titulo:
          d.titulo ||
          tituloDocumento({
            tipoLabel,
            competenciaLabel: competencia,
            createdAt: d.created_at,
          }),
        tipo,
        tipo_label: tipoLabel,
        competencia_label: competencia,
        file_path: d.file_path ?? null,
        file_name: d.file_name ?? null,
        mime_type: d.mime_type ?? null,
        created_at: d.created_at,
      };
    });
}

/** Documentos do colaborador logado que estão parados esperando assinatura. */
export function useDocumentosAguardandoAssinatura() {
  const { user } = useAuth();

  const colab = useQuery({
    queryKey: ["dp_colab_assinatura_ctx", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: cid } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (!cid) return null;
      const { data } = await supabase
        .from("dp_colaboradores")
        .select("id, company_id, nome, nome_social")
        .eq("id", cid as string)
        .maybeSingle();
      return (data as any) ?? null;
    },
  });

  const lista = useQuery({
    queryKey: ["dp_docs_aguardando_assinatura", colab.data?.id],
    enabled: !!colab.data?.id,
    queryFn: async (): Promise<DocParaAssinar[]> => {
      const [{ data: docs }, { data: aceites }] = await Promise.all([
        supabase
          .from("dp_documentos")
          .select(
            "id, titulo, tipo, referencia_data, file_path, file_name, mime_type, aprovacao_status, submetido_por_colaborador, exige_aceite, created_at",
          )
          .eq("colaborador_id", colab.data!.id)
          .eq("exige_aceite", true),
        supabase
          .from("dp_documento_aceites")
          .select("documento_id")
          .eq("colaborador_id", colab.data!.id)
          .not("documento_id", "is", null),
      ]);
      return selecionarPendentesAssinatura((docs ?? []) as any[], (aceites ?? []) as any[]);
    },
  });

  return {
    colaborador: colab.data ?? null,
    documentos: lista.data ?? [],
    isLoading: colab.isLoading || lista.isLoading,
  };
}
