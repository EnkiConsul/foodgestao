import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export type UnifiedTipo =
  | "contracheque"
  | "contracheque_13"
  | "contracheque_ferias"
  | "aviso_ferias"
  | "recibo_ferias"
  | "informe_rendimentos"
  | "adiantamento"
  | "ponto"
  | "atestado"
  | "disciplinar"
  | "act_cct"
  | "contrato"
  | "ferias"
  | "outros";

export type UnifiedOrigem = "dp" | "meu_envio" | "disciplinar" | "act_cct";

export type UnifiedDoc = {
  id: string;
  origem: UnifiedOrigem;
  tipo_key: UnifiedTipo;
  tipo_label: string;
  titulo: string;
  competencia_label: string; // MM/YYYY or —
  competencia_sort: string; // YYYY-MM or ""
  status_key: string;
  status_label: string;
  bucket: string;
  file_path: string | null;
  mime_type: string | null;
  created_at: string;
  observacao?: string | null;
  motivo_recusao?: string | null;
  /** null = não exige aceite; false = aguardando aceite; true = já aceito */
  aceite?: boolean | null;
  meta?: Record<string, any>;
};

const TIPO_LABEL: Record<UnifiedTipo, string> = {
  contracheque: "Contracheque",
  contracheque_13: "Contracheque 13º",
  contracheque_ferias: "Contracheque Férias",
  aviso_ferias: "Aviso de Férias",
  recibo_ferias: "Recibo de Férias",
  informe_rendimentos: "Informe de Rendimentos",
  adiantamento: "Adiantamento",
  ponto: "Folha de Ponto",
  atestado: "Atestado",
  disciplinar: "Disciplinar",
  act_cct: "ACT/CCT",
  contrato: "Contrato",
  ferias: "Férias",
  outros: "Outros",
};

const KNOWN = new Set<string>([
  "contracheque",
  "contracheque_13",
  "contracheque_ferias",
  "aviso_ferias",
  "recibo_ferias",
  "informe_rendimentos",
  "adiantamento",
  "ponto",
  "atestado",
  "contrato",
  "ferias",
]);

function fmtCompetencia(iso?: string | null): { label: string; sort: string } {
  if (!iso) return { label: "—", sort: "" };
  const s = String(iso);
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s);
  if (isNaN(d.getTime())) return { label: "—", sort: "" };
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return { label: `${mm}/${yyyy}`, sort: `${yyyy}-${mm}` };
}

function normalizeTipo(t: string | null | undefined): UnifiedTipo {
  const v = (t ?? "").toLowerCase();
  if (KNOWN.has(v)) return v as UnifiedTipo;
  return "outros";
}

export function useMeusDocumentos() {
  const { user } = useAuth();

  const ctx = useQuery({
    queryKey: ["dp_meu_ctx_docs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: cid } = await supabase.rpc("dp_colaborador_of", {
        _user_id: user!.id,
      });
      if (!cid) return null;
      const { data } = await supabase
        .from("dp_colaboradores")
        .select("id, company_id, nome, unidade_id, sindicato_id, possui_folha_ponto")
        .eq("id", cid as string)
        .maybeSingle();
      return data;
    },
  });

  const list = useQuery({
    queryKey: ["dp_meus_documentos_unified", ctx.data?.id],
    enabled: !!ctx.data?.id,
    queryFn: async (): Promise<UnifiedDoc[]> => {
      const colab = ctx.data!;
      const out: UnifiedDoc[] = [];

      // 1) dp_documentos (DP-sent + own uploads sob submetido_por_colaborador)
      const { data: docs } = await supabase
        .from("dp_documentos")
        .select(
          "id, titulo, tipo, referencia_data, file_path, mime_type, aprovacao_status, motivo_recusao, submetido_por_colaborador, descricao, created_at, exige_aceite"
        )
        .eq("colaborador_id", colab.id)
        .order("created_at", { ascending: false });

      const { data: aceites } = await supabase
        .from("dp_documento_aceites")
        .select("documento_id")
        .eq("colaborador_id", colab.id)
        .not("documento_id", "is", null);
      const aceitos = new Set((aceites ?? []).map((a: any) => a.documento_id as string));

      for (const d of (docs ?? []) as any[]) {
        const tipo = normalizeTipo(d.tipo);
        const comp = fmtCompetencia(d.referencia_data);
        const origem: UnifiedOrigem = d.submetido_por_colaborador ? "meu_envio" : "dp";
        const status_key = d.aprovacao_status || "aprovado";
        const status_label =
          status_key === "aprovado"
            ? origem === "dp"
              ? "Disponível"
              : "Aprovado"
            : status_key === "recusado"
              ? "Recusado"
              : "Pendente";
        out.push({
          id: `doc-${d.id}`,
          origem,
          tipo_key: tipo,
          tipo_label: TIPO_LABEL[tipo],
          titulo: d.titulo || TIPO_LABEL[tipo],
          competencia_label: comp.label,
          competencia_sort: comp.sort,
          status_key,
          status_label,
          bucket: "dp-documentos",
          file_path: d.file_path ?? null,
          mime_type: d.mime_type ?? null,
          created_at: d.created_at,
          observacao: d.descricao ?? null,
          motivo_recusao: d.motivo_recusao ?? null,
          aceite: d.exige_aceite && !d.submetido_por_colaborador ? aceitos.has(d.id) : null,
          meta: { originalId: d.id, submetido: d.submetido_por_colaborador },
        });
      }

      // 2) dp_solicitacoes atestado (meus envios explícitos)
      const { data: sols } = await supabase
        .from("dp_solicitacoes")
        .select("id, tipo, status, data_alvo, data_fim, arquivo_path, resposta_admin, motivo, created_at")
        .eq("colaborador_id", colab.id)
        .eq("tipo", "atestado")
        .order("created_at", { ascending: false });

      for (const s of (sols ?? []) as any[]) {
        const comp = fmtCompetencia(s.data_alvo);
        const status_key = s.status || "pendente";
        const map: Record<string, string> = {
          pendente: "Pendente",
          aprovada: "Aprovado",
          recusada: "Recusado",
          cancelada: "Cancelado",
        };
        out.push({
          id: `sol-${s.id}`,
          origem: "meu_envio",
          tipo_key: "atestado",
          tipo_label: TIPO_LABEL.atestado,
          titulo: `Atestado ${comp.label}`,
          competencia_label: comp.label,
          competencia_sort: comp.sort,
          status_key,
          status_label: map[status_key] ?? status_key,
          bucket: "dp-documentos",
          file_path: s.arquivo_path ?? null,
          mime_type: null,
          created_at: s.created_at,
          observacao: s.motivo ?? null,
          motivo_recusao: status_key === "recusada" ? s.resposta_admin : null,
          meta: { originalId: s.id, data_fim: s.data_fim, source: "solicitacao" },
        });
      }

      // 3) dp_registros_disciplinares
      const { data: disc } = await supabase
        .from("dp_registros_disciplinares")
        .select("id, tipo, motivo, descricao, data, storage_path, created_at")
        .eq("colaborador_id", colab.id)
        .order("data", { ascending: false });

      for (const r of (disc ?? []) as any[]) {
        const comp = fmtCompetencia(r.data);
        out.push({
          id: `disc-${r.id}`,
          origem: "disciplinar",
          tipo_key: "disciplinar",
          tipo_label: TIPO_LABEL.disciplinar,
          titulo: `${r.tipo ?? "Registro"}${r.motivo ? " — " + r.motivo : ""}`,
          competencia_label: comp.label,
          competencia_sort: comp.sort,
          status_key: r.tipo ?? "outro",
          status_label: r.tipo ?? "Registro",
          bucket: "dp-documentos",
          file_path: r.storage_path ?? null,
          mime_type: null,
          created_at: r.created_at,
          observacao: r.descricao ?? null,
        });
      }

      // 4) dp_sindicato_negociacoes (unidade/sindicato do colab)
      if (colab.sindicato_id) {
        const { data: neg } = await supabase
          .from("dp_sindicato_negociacoes")
          .select("id, tipo_documento, ano, mes, vigencia_inicio, vigencia_fim, pdf_path, observacoes, created_at")
          .eq("sindicato_id", colab.sindicato_id)
          .order("vigencia_inicio", { ascending: false });
        for (const n of (neg ?? []) as any[]) {
          const iso = n.vigencia_inicio ?? (n.ano ? `${n.ano}-${String(n.mes ?? 1).padStart(2, "0")}-01` : null);
          const comp = fmtCompetencia(iso);
          out.push({
            id: `act-${n.id}`,
            origem: "act_cct",
            tipo_key: "act_cct",
            tipo_label: TIPO_LABEL.act_cct,
            titulo: `${(n.tipo_documento ?? "ACT").toUpperCase()} ${comp.label}`,
            competencia_label: comp.label,
            competencia_sort: comp.sort,
            status_key: "disponivel",
            status_label: "Disponível",
            bucket: "dp-documentos",
            file_path: n.pdf_path ?? null,
            mime_type: "application/pdf",
            created_at: n.created_at,
            observacao: n.observacoes ?? null,
            meta: { vigencia_fim: n.vigencia_fim },
          });
        }
      }

      out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return out;
    },
  });

  return {
    colaborador: ctx.data ?? null,
    possuiPonto: !!ctx.data?.possui_folha_ponto,
    documentos: list.data ?? [],
    isLoading: ctx.isLoading || list.isLoading,
    refetch: list.refetch,
  };
}
