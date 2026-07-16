import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Wallet, FileSignature, Clock, HeartPulse, Palmtree, AlertOctagon, Users2, FolderOpen, ListChecks } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { TIPOS } from "./DpDocumentos";
import { NavigationCard } from "@/components/dp/NavigationCard";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";

const ICONS: Record<string, LucideIcon> = {
  contracheque: FileText,
  adiantamento: Wallet,
  contrato: FileSignature,
  ponto: Clock,
  atestado: HeartPulse,
  ferias: Palmtree,
  disciplinar: AlertOctagon,
  sindicato: Users2,
  outros: FolderOpen,
};

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
      const total: Record<string, number> = {};
      const pend: Record<string, number> = {};
      for (const row of (data ?? []) as any[]) {
        total[row.tipo] = (total[row.tipo] ?? 0) + 1;
        if (row.aprovacao_status === "pendente") pend[row.tipo] = (pend[row.tipo] ?? 0) + 1;
      }
      return { total, pend };
    },
  });

  return (
    <DpPage>
      <Helmet><title>Documentos — DP 360°</title></Helmet>
      <DpPageHeader
        icon={FolderOpen}
        title="Documentos por categoria"
        description="Organize contracheques, contratos, atestados e demais arquivos."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TIPOS.map((t) => {
          const Icon = ICONS[t.value] ?? FolderOpen;
          const count = counts.data?.total?.[t.value] ?? 0;
          const pend = counts.data?.pend?.[t.value] ?? 0;
          return (
            <NavigationCard
              key={t.value}
              title={t.label}
              to={`/dp/documentos/${t.value}`}
              icon={Icon}
              count={count}
              description={pend > 0 ? `⚠ ${pend} aguardando aprovação` : undefined}
            />
          );
        })}
        <NavigationCard
          title="Negociações Coletivas (ACT/CCT)"
          description="Acordos e convenções coletivas por sindicato"
          to="/dp/documentos/act-cct"
          icon={FileSignature}
        />
        <NavigationCard
          title="Histórico completo"
          description="Todos os documentos com filtros por colaborador, tipo e período"
          to="/dp/documentos/historico"
          icon={ListChecks}
        />
      </div>
    </DpPage>
  );
}
