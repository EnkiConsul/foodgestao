import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { History, ClipboardList, Repeat, HeartPulse, FileText, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";

type EventoTipo = "Solicitação" | "Troca" | "Documento" | "Disciplinar";
type Evento = {
  id: string;
  data: string;
  tipo: EventoTipo;
  titulo: string;
  status?: string | null;
  icon: any;
};

const TIPOS: (EventoTipo | "Todos")[] = ["Todos", "Solicitação", "Troca", "Documento", "Disciplinar"];
const PAGE = 20;

export default function DpMeuHistorico() {
  const { user } = useAuth();
  const [filtro, setFiltro] = useState<(typeof TIPOS)[number]>("Todos");
  const [visiveis, setVisiveis] = useState(PAGE);

  const colabQ = useQuery({
    queryKey: ["colab_of_hist", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      return data as string | null;
    },
  });

  const colabId = colabQ.data ?? null;

  const eventos = useQuery({
    queryKey: ["dp_meu_historico", colabId],
    enabled: !!colabId,
    queryFn: async (): Promise<Evento[]> => {
      const [sols, trocas, docs, disc] = await Promise.all([
        supabase.from("dp_solicitacoes")
          .select("id, tipo, status, created_at")
          .eq("colaborador_id", colabId!).order("created_at", { ascending: false }).limit(50),
        supabase.from("dp_trocas")
          .select("id, status, created_at").or(`solicitante_id.eq.${colabId},destino_id.eq.${colabId}`)
          .order("created_at", { ascending: false }).limit(30),
        supabase.from("dp_documentos")
          .select("id, tipo, titulo, created_at")
          .eq("colaborador_id", colabId!).order("created_at", { ascending: false }).limit(50),
        supabase.from("dp_registros_disciplinares")
          .select("id, tipo, motivo, created_at")
          .eq("colaborador_id", colabId!).order("created_at", { ascending: false }).limit(20),
      ]);

      const out: Evento[] = [];
      (sols.data ?? []).forEach((s: any) => out.push({
        id: `s-${s.id}`, data: s.created_at, tipo: "Solicitação",
        titulo: `Solicitação de ${s.tipo}`, status: s.status,
        icon: s.tipo === "atestado" ? HeartPulse : ClipboardList,
      }));
      (trocas.data ?? []).forEach((t: any) => out.push({
        id: `t-${t.id}`, data: t.created_at, tipo: "Troca",
        titulo: "Troca de folga", status: t.status, icon: Repeat,
      }));
      (docs.data ?? []).forEach((d: any) => out.push({
        id: `d-${d.id}`, data: d.created_at, tipo: "Documento",
        titulo: d.titulo ?? d.tipo, icon: FileText,
      }));
      (disc.data ?? []).forEach((r: any) => out.push({
        id: `r-${r.id}`, data: r.created_at, tipo: "Disciplinar",
        titulo: `${r.tipo}: ${r.motivo ?? "-"}`, icon: ShieldAlert,
      }));
      return out.sort((a, b) => (a.data < b.data ? 1 : -1));
    },
  });

  const filtrados = useMemo(() => {
    const list = eventos.data ?? [];
    if (filtro === "Todos") return list;
    return list.filter((e) => e.tipo === filtro);
  }, [eventos.data, filtro]);

  const visiveisList = filtrados.slice(0, visiveis);

  const counts = useMemo(() => {
    const c: Record<string, number> = { Todos: eventos.data?.length ?? 0 };
    for (const e of eventos.data ?? []) c[e.tipo] = (c[e.tipo] ?? 0) + 1;
    return c;
  }, [eventos.data]);

  return (
    <DpPage narrow>
      <Helmet><title>Meu Histórico — Portal do Colaborador</title></Helmet>
      <DpPageHeader icon={History} title="Meu Histórico" description="Todos os eventos vinculados à sua conta." />

      <Tabs value={filtro} onValueChange={(v) => { setFiltro(v as any); setVisiveis(PAGE); }}>
        <TabsList className="flex-wrap h-auto">
          {TIPOS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {t} <span className="ml-1 text-[10px] opacity-70">({counts[t] ?? 0})</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DpContentCard contentClassName="p-2">
        {filtrados.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Sem eventos.</p>
        ) : (
          <>
            <ol className="relative border-l-2 border-[hsl(var(--dp-border))] ml-4 space-y-4 p-4">
              {visiveisList.map((e) => (
                <li key={e.id} className="ml-4">
                  <span className="absolute -left-[13px] mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 ring-4 ring-card">
                    <e.icon className="h-3.5 w-3.5 text-primary" />
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{e.titulo}</p>
                    <Badge variant="outline" className="text-[10px]">{e.tipo}</Badge>
                    {e.status && <Badge variant="outline" className="text-[10px] capitalize">{e.status}</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(e.data).toLocaleString("pt-BR")}
                  </p>
                </li>
              ))}
            </ol>
            {visiveis < filtrados.length && (
              <div className="p-4 pt-0 flex justify-center">
                <Button variant="outline" size="sm" onClick={() => setVisiveis((v) => v + PAGE)}>
                  Carregar mais ({filtrados.length - visiveis} restantes)
                </Button>
              </div>
            )}
          </>
        )}
      </DpContentCard>
    </DpPage>
  );
}
