import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FileText, FileWarning, ShieldAlert, Clock, Coins, ListChecks, Scale,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { cn } from "@/lib/utils";

type Modulo = {
  title: string;
  description: string;
  icon: LucideIcon;
  to: string;
  cor: string;
  bg: string;
  /** chave da contagem de pendências opcional (opcional) */
  pendKey?: string;
};

const MODULOS: Modulo[] = [
  {
    title: "Contracheques",
    description: "Importe e gerencie contracheques mensais dos colaboradores.",
    icon: FileText,
    to: "/dp/documentos/contracheque",
    cor: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
    pendKey: "contracheque",
  },
  {
    title: "Folhas de Ponto",
    description: "Importe e gerencie folhas de ponto mensais dos colaboradores.",
    icon: Clock,
    to: "/dp/documentos/ponto",
    cor: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    pendKey: "ponto",
  },
  {
    title: "Adiantamentos",
    description: "Importe e gerencie adiantamentos salariais dos colaboradores.",
    icon: Coins,
    to: "/dp/documentos/adiantamento",
    cor: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-500/10",
    pendKey: "adiantamento",
  },
  {
    title: "Histórico Completo",
    description: "Visualize todos os documentos de todos os colaboradores em uma única tela.",
    icon: ListChecks,
    to: "/dp/documentos/historico",
    cor: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-500/10",
  },
  {
    title: "Atestados",
    description: "Cadastre, aprove ou rejeite atestados médicos da equipe.",
    icon: FileWarning,
    to: "/dp/atestados",
    cor: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    title: "Registros Disciplinares",
    description: "Advertências e suspensões vinculadas a colaboradores.",
    icon: ShieldAlert,
    to: "/dp/disciplinar",
    cor: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10",
  },
  {
    title: "ACT/CCT",
    description: "Acordos e Convenções Coletivas de Trabalho.",
    icon: Scale,
    to: "/dp/documentos/act-cct",
    cor: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-500/10",
  },
];

export default function DpDocumentosHub() {
  const { selectedCompanyId } = useCompanyContext();

  const counts = useQuery({
    queryKey: ["dp_doc_counts", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_documentos")
        .select("tipo, aprovacao_status")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      const pend: Record<string, number> = {};
      for (const row of (data ?? []) as any[]) {
        if (row.aprovacao_status === "pendente") {
          pend[row.tipo] = (pend[row.tipo] ?? 0) + 1;
        }
      }
      return { pend };
    },
  });

  const bulkPending = useQuery({
    queryKey: ["dp_bulk_pending_counts", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_bulk_import_items" as any)
        .select("batch_id, status, matched_colaborador_id, dp_bulk_import_batches!inner(company_id, tipo)")
        .eq("status", "pending")
        .eq("dp_bulk_import_batches.company_id", selectedCompanyId!)
        .not("matched_colaborador_id", "is", null);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as any[]) {
        const t = row.dp_bulk_import_batches?.tipo;
        if (!t) continue;
        map[t] = (map[t] ?? 0) + 1;
      }
      return map;
    },
  });

  return (
    <DpPage>
      <Helmet><title>Documentos — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={FileText}
        title="Documentos"
        description="Gerencie todos os documentos dos colaboradores."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-5xl">
        {MODULOS.map((m) => {
          const pend = m.pendKey ? counts.data?.pend?.[m.pendKey] ?? 0 : 0;
          const bulk = m.pendKey ? bulkPending.data?.[m.pendKey] ?? 0 : 0;
          const Icon = m.icon;
          return (
            <Link key={m.to} to={m.to} className="block group">
              <div className="relative bg-card border-2 border-border rounded-2xl p-6 shadow-sm hover:shadow-lg hover:border-primary/50 transition-all duration-200 h-full">
                <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                  {pend > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-semibold px-2 py-0.5 border border-amber-500/40">
                      ⚠ {pend} pendente{pend > 1 ? "s" : ""}
                    </span>
                  )}
                  {bulk > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 text-xs font-semibold px-2 py-0.5 border border-blue-500/40">
                      {bulk} vínculo{bulk > 1 ? "s" : ""} p/ aprovar
                    </span>
                  )}
                </div>
                <div className={cn("size-12 rounded-xl flex items-center justify-center mb-4", m.bg, m.cor)}>
                  <Icon className="size-6" />
                </div>
                <div className={cn("text-lg font-semibold mb-1", m.cor)}>{m.title}</div>
                <p className="text-sm text-muted-foreground">{m.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </DpPage>
  );
}

