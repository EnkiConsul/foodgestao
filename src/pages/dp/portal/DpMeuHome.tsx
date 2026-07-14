import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, FileText, ClipboardList, Repeat, Megaphone, User, Cake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AtalhosFavoritos } from "@/components/dp/home/AtalhosFavoritos";

export default function DpMeuHome() {
  const { user } = useAuth();

  const colabId = useQuery({
    queryKey: ["colab_of", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      return data as string | null;
    },
  });

  const pend = useQuery({
    queryKey: ["dp_meu_pend", colabId.data],
    enabled: !!colabId.data,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_solicitacoes")
        .select("id, tipo, status, created_at")
        .eq("colaborador_id", colabId.data!)
        .eq("status", "pendente")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const avisos = useQuery({
    queryKey: ["dp_meu_avisos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_avisos")
        .select("id, titulo, conteudo, prioridade, publicado_em, fixado")
        .order("fixado", { ascending: false })
        .order("publicado_em", { ascending: false })
        .limit(4);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <Helmet><title>Portal do Colaborador — 360°FOOD</title></Helmet>

      <header>
        <div className="flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Bem-vindo</h1>
        </div>
        <p className="text-muted-foreground text-sm ml-8">{user?.email}</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border-2 border-[hsl(var(--dp-pending-border))] bg-[hsl(var(--dp-pending-bg))] p-5">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Minhas Solicitações Abertas</h2>
            <Badge className="bg-primary text-primary-foreground rounded-full h-6 min-w-6 px-2">
              {pend.data?.length ?? 0}
            </Badge>
          </div>
          <div className="space-y-2 max-h-[380px] overflow-y-auto">
            {(pend.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma solicitação em aberto.</p>
            ) : pend.data!.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl bg-white border border-[hsl(var(--dp-border))] p-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <ClipboardList className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium capitalize">{s.tipo}</p>
                  <p className="text-xs text-muted-foreground">
                    Enviada em {new Date(s.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <Badge variant="outline">Pendente</Badge>
              </div>
            ))}
          </div>
          <Button asChild variant="ghost" size="sm" className="mt-3 w-full">
            <Link to="/dp/meu/solicitacoes">Ver todas</Link>
          </Button>
        </section>

        <section className="rounded-2xl border-2 border-[hsl(var(--dp-birthday-border))] bg-[hsl(var(--dp-birthday-bg))] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Megaphone className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Últimos Avisos</h2>
          </div>
          <div className="space-y-3 max-h-[380px] overflow-y-auto">
            {(avisos.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem avisos.</p>
            ) : avisos.data!.map((a: any) => (
              <div key={a.id} className="rounded-xl bg-white border border-[hsl(var(--dp-border))] p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium">{a.titulo}</p>
                  <Badge variant="outline" className="text-[10px] capitalize">{a.prioridade}</Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{a.conteudo}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <AtalhosFavoritos
        items={[
          { icon: FileText, label: "Documentos", to: "/dp/meu/documentos" },
          { icon: ClipboardList, label: "Solicitações", to: "/dp/meu/solicitacoes" },
          { icon: Repeat, label: "Trocas", to: "/dp/meu/trocas" },
          { icon: User, label: "Meus Dados", to: "/dp/meu/perfil" },
          { icon: Cake, label: "Avisos", to: "/dp/meu/solicitacoes" },
        ]}
      />
    </div>
  );
}
