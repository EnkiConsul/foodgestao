import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { History, ClipboardList, Repeat, HeartPulse, FileText, ShieldAlert, Search, X, Download } from "lucide-react";
import { baixarCsv } from "@/lib/dp/portal-csv";
import { isTipoAfastamento, labelAfastamento } from "@/lib/dp/licencas";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DpContentCard, DpEmptyState, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { CardListSkeleton } from "@/components/dp/DpSkeletons";


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
  const [busca, setBusca] = useState("");

  const colabQ = useQuery({
    queryKey: ["colab_of_hist", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_meu_colaborador");
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
        titulo: `Solicitação de ${labelAfastamento(s.tipo)}`, status: s.status,
        icon: isTipoAfastamento(s.tipo) ? HeartPulse : ClipboardList,
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
    let list = eventos.data ?? [];
    if (filtro !== "Todos") list = list.filter((e) => e.tipo === filtro);
    const termo = busca.trim().toLowerCase();
    if (termo) {
      list = list.filter((e) =>
        `${e.titulo} ${e.tipo} ${e.status ?? ""}`.toLowerCase().includes(termo),
      );
    }
    return list;
  }, [eventos.data, filtro, busca]);

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

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={filtrados.length === 0}
          onClick={() =>
            baixarCsv(
              `meu-historico-${new Date().toISOString().slice(0, 10)}`,
              ["Data", "Tipo", "Item", "Situação"],
              filtrados.map((e) => [
                new Date(e.data).toLocaleString("pt-BR"),
                e.tipo,
                e.titulo,
                e.status ?? "",
              ]),
            )
          }
        >
          <Download className="mr-2 h-4 w-4" /> Baixar meus dados
        </Button>
      </div>

      <Tabs value={filtro} onValueChange={(v) => { setFiltro(v as any); setVisiveis(PAGE); }}>
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList className="w-max">
            {TIPOS.map((t) => (
              <TabsTrigger key={t} value={t} className="whitespace-nowrap">
                {t} <span className="ml-1 text-[10px] opacity-70">({counts[t] ?? 0})</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setVisiveis(PAGE); }}
          placeholder="Buscar no histórico"
          aria-label="Buscar no histórico"
          className={cn("min-h-11 pl-9", busca && "pr-9")}
        />
        {busca && (
          <button
            type="button"
            onClick={() => setBusca("")}
            aria-label="Limpar busca"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>



      <DpContentCard contentClassName="p-2">
        {eventos.isError || colabQ.isError ? (
          <div className="p-2"><DpErrorState onRetry={() => { colabQ.refetch(); eventos.refetch(); }} /></div>
        ) : eventos.isLoading || colabQ.isLoading ? (
          <div className="p-2"><CardListSkeleton rows={4} /></div>
        ) : filtrados.length === 0 ? (
          <DpEmptyState icon={History}>
            {busca || filtro !== "Todos"
              ? "Nada encontrado com esses filtros. Tente limpar a busca ou escolher outro tipo."
              : "Você ainda não tem eventos. Suas solicitações, folgas e documentos aparecerão aqui."}
          </DpEmptyState>

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
                <Button variant="outline" className="min-h-11" onClick={() => setVisiveis((v) => v + PAGE)}>
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
