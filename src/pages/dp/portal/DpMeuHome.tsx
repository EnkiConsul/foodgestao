import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileText, ClipboardList, Repeat, ArrowRight, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function useColabId() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["colab_of", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (error) throw error;
      return data as string | null;
    },
  });
}

export default function DpMeuHome() {
  const { data: colabId } = useColabId();
  const { user } = useAuth();

  const counts = useQuery({
    queryKey: ["dp_meu_counts", colabId],
    enabled: !!colabId,
    queryFn: async () => {
      const [docs, sols, trocas] = await Promise.all([
        supabase.from("dp_documentos").select("id", { count: "exact", head: true }).eq("colaborador_id", colabId!),
        supabase.from("dp_solicitacoes").select("id", { count: "exact", head: true }).eq("colaborador_id", colabId!),
        supabase.from("dp_trocas").select("id", { count: "exact", head: true })
          .or(`solicitante_id.eq.${colabId},destino_id.eq.${colabId}`),
      ]);
      return { docs: docs.count ?? 0, sols: sols.count ?? 0, trocas: trocas.count ?? 0 };
    },
  });

  const avisos = useQuery({
    queryKey: ["dp_meu_avisos", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_avisos")
        .select("id, titulo, conteudo, prioridade, publicado_em, fixado")
        .order("fixado", { ascending: false })
        .order("publicado_em", { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });

  const items = [
    { icon: FileText, label: "Meus documentos", value: counts.data?.docs ?? "—", to: "/dp/meu/documentos" },
    { icon: ClipboardList, label: "Minhas solicitações", value: counts.data?.sols ?? "—", to: "/dp/meu/solicitacoes" },
    { icon: Repeat, label: "Minhas trocas", value: counts.data?.trocas ?? "—", to: "/dp/meu/trocas" },
  ];

  return (
    <div className="space-y-6">
      <Helmet><title>Portal do Colaborador — 360°FOOD</title></Helmet>
      <div>
        <h1 className="text-2xl font-bold">Bem-vindo</h1>
        <p className="text-muted-foreground">{user?.email}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {items.map((it) => (
          <Link key={it.to} to={it.to}>
            <Card className="hover:border-primary/50 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <it.icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-2xl font-bold">{it.value}</span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm">{it.label}</p>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4" /> Últimos avisos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(avisos.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem avisos.</p>
          ) : avisos.data!.map((a) => (
            <div key={a.id} className="border-l-2 border-primary pl-3">
              <p className="text-sm font-medium">{a.titulo}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{a.conteudo}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
