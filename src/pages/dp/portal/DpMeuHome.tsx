import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bell, FileText, ClipboardList, Megaphone, User, Calendar,
  ArrowRight, Inbox, MessageSquare,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDpMeuResumo } from "@/hooks/useDpMeuResumo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AtalhosFavoritos } from "@/components/dp/home/AtalhosFavoritos";
import { MinhasPendenciasCard } from "@/components/dp/home/MinhasPendenciasCard";
import { AniversariantesCard } from "@/components/dp/home/AniversariantesCard";
import { DpPage } from "@/components/dp/DpPage";

export default function DpMeuHome() {
  const { user } = useAuth();
  const meu = useDpMeuResumo();

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

  // Avisos com marcação de lido/não-lido cruzando dp_avisos_leituras.
  const avisos = useQuery({
    queryKey: ["dp_meu_avisos", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("dp_avisos")
        .select("id, titulo, conteudo, prioridade, publicado_em, fixado")
        .order("fixado", { ascending: false })
        .order("publicado_em", { ascending: false })
        .limit(4);
      const ids = (rows ?? []).map((r) => r.id);
      let readIds = new Set<string>();
      if (ids.length) {
        const { data: leituras } = await supabase
          .from("dp_avisos_leituras")
          .select("aviso_id")
          .in("aviso_id", ids)
          .eq("user_id", user!.id);
        readIds = new Set((leituras ?? []).map((l) => l.aviso_id));
      }
      return (rows ?? []).map((r) => ({ ...r, lido: readIds.has(r.id) }));
    },
  });

  // Próxima folga confirmada / agendada.
  const proximaFolga = useQuery({
    queryKey: ["dp_meu_proxima_folga", colabId.data],
    enabled: !!colabId.data,
    queryFn: async () => {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("dp_folgas")
        .select("id, data, status")
        .eq("colaborador_id", colabId.data!)
        .gte("data", hoje)
        .order("data", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Últimos 3 documentos direcionados ao colaborador.
  const ultimosDocs = useQuery({
    queryKey: ["dp_meu_docs", colabId.data],
    enabled: !!colabId.data,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_documentos")
        .select("id, tipo, titulo, created_at")
        .eq("colaborador_id", colabId.data!)
        .order("created_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });

  // Mensagens não lidas (destinatário = user).
  const msgs = useQuery({
    queryKey: ["dp_meu_msgs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count } = await supabase
        .from("dp_mensagens")
        .select("id", { count: "exact", head: true })
        .eq("destinatario_user_id", user!.id)
        .is("lida_em", null);
      return count ?? 0;
    },
  });

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const dateStr = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const firstName =
    meu?.nome?.split(" ")[0] ?? user?.email?.split("@")[0]?.split(".")[0] ?? "";

  const proximaFolgaDias = (() => {
    if (!proximaFolga.data?.data) return null;
    const d = new Date(proximaFolga.data.data + "T00:00:00");
    const diff = Math.round((d.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
    return diff;
  })();

  return (
    <DpPage>
      <Helmet><title>Portal do Colaborador — Aveto 360</title></Helmet>

      <header className="dp-content-card rounded-2xl bg-card border border-[hsl(var(--dp-border))] p-5 md:p-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-2xl font-bold capitalize truncate">
              {greeting}{firstName ? `, ${firstName}` : ""} 👋
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground capitalize">{dateStr}</p>
          </div>
          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
            <Link to="/dp/meu/perfil"><User className="h-4 w-4 mr-2" /> Meu Cadastro</Link>
          </Button>
        </div>
      </header>

      {/* Resumo compacto: próxima folga · últimos docs · mensagens */}
      <div className="grid gap-4 md:grid-cols-3">
        <ResumoCard
          icon={Calendar}
          label="Próxima folga"
          value={
            proximaFolgaDias == null
              ? "—"
              : proximaFolgaDias === 0
                ? "Hoje"
                : `Em ${proximaFolgaDias} ${proximaFolgaDias === 1 ? "dia" : "dias"}`
          }
          hint={proximaFolga.data?.data ? new Date(proximaFolga.data.data + "T00:00:00").toLocaleDateString("pt-BR") : "Sem folga agendada"}
          to="/dp/meu/calendario"
        />
        <ResumoCard
          icon={FileText}
          label="Últimos documentos"
          value={String(ultimosDocs.data?.length ?? 0)}
          hint={ultimosDocs.data?.[0]?.titulo ?? "Nenhum documento recente"}
          to="/dp/meu/documentos"
        />
        <ResumoCard
          icon={MessageSquare}
          label="Mensagens não lidas"
          value={String(msgs.data ?? 0)}
          hint={(msgs.data ?? 0) > 0 ? "Você tem mensagens novas" : "Nenhuma mensagem nova"}
          to="/dp/meu/solicitacoes"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border-2 border-[hsl(var(--dp-pending-border))] bg-[hsl(var(--dp-pending-bg))] p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Minhas Solicitações Abertas</h2>
            <Badge className="bg-primary text-primary-foreground rounded-full h-6 min-w-6 px-2 ml-auto">
              {pend.data?.length ?? 0}
            </Badge>
          </div>
          <div className="space-y-2 max-h-[380px] overflow-y-auto flex-1">
            {(pend.data?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <Inbox className="h-8 w-8 opacity-40" />
                <p className="text-sm">Nenhuma solicitação em aberto.</p>
              </div>
            ) : pend.data!.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl bg-card border border-[hsl(var(--dp-border))] p-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <ClipboardList className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium capitalize truncate">{s.tipo}</p>
                  <p className="text-xs text-muted-foreground">
                    Enviada em {new Date(s.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <Badge variant="outline">Pendente</Badge>
              </div>
            ))}
          </div>
          <Button asChild variant="ghost" size="sm" className="mt-3 w-full">
            <Link to="/dp/meu/solicitacoes">Ver todas <ArrowRight className="h-4 w-4 ml-1" /></Link>
          </Button>
        </section>

        <section className="rounded-2xl border-2 border-[hsl(var(--dp-birthday-border))] bg-[hsl(var(--dp-birthday-bg))] p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Megaphone className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Últimos Avisos</h2>
          </div>
          <div className="space-y-3 max-h-[380px] overflow-y-auto flex-1">
            {(avisos.data?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <Megaphone className="h-8 w-8 opacity-40" />
                <p className="text-sm">Sem avisos no momento.</p>
              </div>
            ) : avisos.data!.map((a: any) => (
                <div
                  key={a.id}
                  className={`rounded-xl bg-card border p-3 ${
                    a.lido ? "border-[hsl(var(--dp-border))]" : "border-primary/40 ring-1 ring-primary/20"
                  }`}
                >
                <div className="flex items-center justify-between mb-1 gap-2">
                  <p className="text-sm font-medium truncate">{a.titulo}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    {!a.lido && <Badge className="bg-primary text-primary-foreground text-[10px]">Novo</Badge>}
                    <Badge variant="outline" className="text-[10px] capitalize">{a.prioridade}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{a.conteudo}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <MinhasPendenciasCard />
        <AniversariantesCard />
      </div>

      <AtalhosFavoritos />

    </DpPage>
  );
}

function ResumoCard({
  icon: Icon, label, value, hint, to,
}: { icon: any; label: string; value: string; hint: string; to: string }) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-[hsl(var(--dp-border))] bg-card p-4 hover:shadow-sm transition-shadow flex items-center gap-3"
    >
      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold leading-tight">{value}</p>
        <p className="text-[11px] text-muted-foreground truncate">{hint}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}
