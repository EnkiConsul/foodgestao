import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, ClipboardList, FolderOpen, ArrowRight, Cake, Megaphone, Pin } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpAvisos, useAniversariantes } from "@/hooks/useDpComunicacao";

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
  const { data: avisos = [] } = useDpAvisos();
  const { data: aniv } = useAniversariantes();

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

  const avisosTop = avisos.slice(0, 3);

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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="h-4 w-4" /> Últimos avisos
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/dp/avisos">Ver todos <ArrowRight className="h-3 w-3 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {avisosTop.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum aviso publicado.</p>
            ) : avisosTop.map((a) => (
              <div key={a.id} className="border-l-2 border-primary pl-3">
                <div className="flex items-center gap-2">
                  {a.fixado && <Pin className="h-3 w-3 text-primary" />}
                  <p className="text-sm font-medium">{a.titulo}</p>
                  <Badge variant="outline" className="text-xs">{a.prioridade}</Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{a.conteudo}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Cake className="h-4 w-4" /> Aniversariantes do mês
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!aniv || aniv.list.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum aniversariante cadastrado neste mês.</p>
            ) : aniv.list.map((c: any) => {
              const isToday = c._dia === aniv.today;
              return (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                      {c._dia.toString().padStart(2, "0")}
                    </div>
                    <div>
                      <p className="font-medium">{c.nome}</p>
                      {c.cargo && <p className="text-xs text-muted-foreground">{c.cargo}</p>}
                    </div>
                  </div>
                  {isToday && <Badge className="bg-primary/10 text-primary">Hoje 🎉</Badge>}
                  {!isToday && (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(new Date().getFullYear(), aniv.currentMonth, c._dia), "dd 'de' MMM", { locale: ptBR })}
                    </span>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
