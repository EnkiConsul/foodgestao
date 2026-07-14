import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, ClipboardList, FolderOpen, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCompanyContext } from "@/hooks/useCompanyContext";

function StatCard({ icon: Icon, label, value, to }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; to: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <span className="text-2xl font-bold">{value}</span>
        </div>
        <p className="text-sm text-muted-foreground mb-3">{label}</p>
        <Button asChild variant="ghost" size="sm" className="p-0 h-auto text-primary hover:bg-transparent">
          <Link to={to}>Ver detalhes <ArrowRight className="h-3 w-3 ml-1" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function DpHome() {
  const { selectedCompanyId } = useCompanyContext();

  const stats = useQuery({
    queryKey: ["dp_home_stats", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const [colab, pend, docs] = await Promise.all([
        supabase.from("dp_colaboradores").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!).eq("ativo", true),
        supabase.from("dp_solicitacoes").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!).eq("status", "pendente"),
        supabase.from("dp_documentos").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!),
      ]);
      return {
        colaboradores: colab.count ?? 0,
        pendentes: pend.count ?? 0,
        documentos: docs.count ?? 0,
      };
    },
  });

  return (
    <div className="space-y-6">
      <Helmet><title>DP 360° — 360°FOOD</title></Helmet>
      <div>
        <h1 className="text-2xl font-bold">DP 360°</h1>
        <p className="text-muted-foreground">Gestão de departamento pessoal da sua empresa.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Users} label="Colaboradores ativos" value={stats.data?.colaboradores ?? "—"} to="/dp/colaboradores" />
        <StatCard icon={ClipboardList} label="Solicitações pendentes" value={stats.data?.pendentes ?? "—"} to="/dp/solicitacoes" />
        <StatCard icon={FolderOpen} label="Documentos armazenados" value={stats.data?.documentos ?? "—"} to="/dp/documentos" />
      </div>
    </div>
  );
}
