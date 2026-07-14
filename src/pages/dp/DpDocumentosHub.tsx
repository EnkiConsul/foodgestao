import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Wallet, FileSignature, Clock, HeartPulse, Palmtree, AlertOctagon, Users2, FolderOpen, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { TIPOS } from "./DpDocumentos";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
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
        .select("tipo")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) map[row.tipo] = (map[row.tipo] ?? 0) + 1;
      return map;
    },
  });

  return (
    <div className="space-y-4">
      <Helmet><title>Documentos — DP 360°</title></Helmet>
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FolderOpen className="h-6 w-6" /> Documentos por categoria
        </h1>
        <p className="text-muted-foreground">Organize contracheques, contratos, atestados e demais arquivos.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TIPOS.map((t) => {
          const Icon = ICONS[t.value] ?? FolderOpen;
          const count = counts.data?.[t.value] ?? 0;
          return (
            <Link key={t.value} to={`/dp/documentos/${t.value}`}>
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-2xl font-bold">{count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{t.label}</p>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
