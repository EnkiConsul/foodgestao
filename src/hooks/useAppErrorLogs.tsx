import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";

export type AppErrorLog = {
  id: string;
  fingerprint: string;
  company_id: string | null;
  user_name: string | null;
  surface: string | null;
  route: string | null;
  action: string | null;
  severity: "error" | "warning" | "info";
  source: "client" | "database" | "edge" | "import";
  code: string | null;
  message: string;
  user_message: string | null;
  details: Record<string, unknown> | null;
  status: "aberto" | "resolvido" | "ignorado";
  status_note: string | null;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
  reports?: AppErrorReport[];
};

export type AppErrorReport = {
  id: string;
  error_log_id: string;
  protocol: string;
  reporter_name: string | null;
  description: string;
  attempted_action: string | null;
  route: string | null;
  status: "aberto" | "em_analise" | "resolvido" | "ignorado";
  internal_note: string | null;
  created_at: string;
};

export type AppErrorFiltros = {
  /** Dias para trás. 0 = tudo. */
  dias: number;
  status: "todos" | "aberto" | "resolvido" | "ignorado";
  severity: "todos" | "error" | "warning" | "info";
  source: "todos" | "client" | "database" | "edge" | "import";
  busca: string;
  /** Quando true ignora o filtro de empresa (uso no backoffice). */
  todasEmpresas?: boolean;
};

export const FILTROS_ERRO_PADRAO: AppErrorFiltros = {
  dias: 30,
  status: "aberto",
  severity: "todos",
  source: "todos",
  busca: "",
};

/** Lista agrupada de erros do sistema, do mais recente para o mais antigo. */
export function useAppErrorLogs(filtros: AppErrorFiltros) {
  const { selectedCompanyId } = useCompanyContext();

  return useQuery({
    queryKey: ["app_error_logs", selectedCompanyId, filtros],
    enabled: filtros.todasEmpresas ? true : !!selectedCompanyId,
    staleTime: 30_000,
    queryFn: async (): Promise<AppErrorLog[]> => {
      let q = supabase
        .from("app_error_logs")
        .select("*")
        .order("last_seen_at", { ascending: false })
        .limit(300);

      if (!filtros.todasEmpresas && selectedCompanyId) q = q.eq("company_id", selectedCompanyId);
      if (filtros.status !== "todos") q = q.eq("status", filtros.status);
      if (filtros.severity !== "todos") q = q.eq("severity", filtros.severity);
      if (filtros.source !== "todos") q = q.eq("source", filtros.source);
      if (filtros.dias > 0) {
        const desde = new Date(Date.now() - filtros.dias * 86_400_000).toISOString();
        q = q.gte("last_seen_at", desde);
      }

      const { data, error } = await q;
      if (error) throw error;

      const termo = filtros.busca.trim().toLowerCase();
      const linhas = (data ?? []) as unknown as AppErrorLog[];
      const ids = linhas.map((linha) => linha.id);
      let reports: AppErrorReport[] = [];
      if (ids.length > 0) {
        const { data: reportData, error: reportError } = await supabase
          .from("app_error_reports")
          .select("id,error_log_id,protocol,reporter_name,description,attempted_action,route,status,internal_note,created_at")
          .in("error_log_id", ids)
          .order("created_at", { ascending: false });
        if (reportError) throw reportError;
        reports = (reportData ?? []) as AppErrorReport[];
      }
      const reportsByError = new Map<string, AppErrorReport[]>();
      reports.forEach((report) => {
        reportsByError.set(report.error_log_id, [...(reportsByError.get(report.error_log_id) ?? []), report]);
      });
      const enriched = linhas.map((linha) => ({ ...linha, reports: reportsByError.get(linha.id) ?? [] }));
      if (!termo) return enriched;
      return enriched.filter((l) =>
        [
          l.message, l.surface, l.action, l.route, l.code, l.user_name,
          ...(l.reports ?? []).flatMap((report) => [report.protocol, report.reporter_name, report.description, report.attempted_action]),
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(termo)),
      );
    },
  });
}

export function useAppErrorReportStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: AppErrorReport["status"]; nota?: string }) => {
      const { error } = await supabase.rpc("app_error_report_update_status", {
        _report_id: input.id,
        _status: input.status,
        _internal_note: input.nota?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app_error_logs"] });
      toast.success("Chamado atualizado.");
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o chamado."),
  });
}

/** Marca um erro como resolvido ou ignorado, com observação. */
export function useAppErrorStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: "aberto" | "resolvido" | "ignorado";
      nota?: string;
    }) => {
      const { error } = await supabase
        .from("app_error_logs")
        .update({ status: input.status, status_note: input.nota ?? null })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["app_error_logs"] });
      toast.success(
        vars.status === "resolvido"
          ? "Erro marcado como resolvido."
          : vars.status === "ignorado"
            ? "Erro ignorado."
            : "Erro reaberto.",
      );
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar o erro."),
  });
}
