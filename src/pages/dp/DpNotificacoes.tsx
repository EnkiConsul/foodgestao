import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { Bell, Search, CheckCheck } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDpNotificacoes, useMarkNotifRead } from "@/hooks/useDpNotificacoes";
import { DpContentCard, DpEmptyState, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const REF_TO_PATH: Record<string, string> = {
  dp_solicitacoes: "/dp/solicitacoes",
  dp_trocas: "/dp/trocas",
  dp_registros_disciplinares: "/dp/disciplinar",
  dp_atestados: "/dp/atestados",
  dp_documentos: "/dp/documentos",
  dp_avisos: "/dp/avisos",
};

export default function DpNotificacoes() {
  const { data = [], isLoading } = useDpNotificacoes();
  const markRead = useMarkNotifRead();
  const [tab, setTab] = useState<"todas" | "nao_lidas" | "lidas">("todas");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return (data ?? []).filter((n) => {
      if (tab === "nao_lidas" && n.lida_em) return false;
      if (tab === "lidas" && !n.lida_em) return false;
      if (s && !`${n.titulo} ${n.descricao ?? ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [data, tab, search]);

  const counts = useMemo(() => {
    let lidas = 0, naoLidas = 0;
    for (const n of data ?? []) { if (n.lida_em) lidas++; else naoLidas++; }
    return { lidas, naoLidas, todas: data?.length ?? 0 };
  }, [data]);

  const markAll = () => {
    const ids = (data ?? []).filter((n) => !n.lida_em).map((n) => n.id);
    if (ids.length) markRead.mutate(ids);
  };

  return (
    <DpPage>
      <Helmet><title>Notificações — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={Bell}
        title="Central de Notificações"
        description="Histórico dos alertas do sistema (aprovações, atestados, comunicados)."
        actions={
          <Button variant="outline" onClick={markAll} disabled={counts.naoLidas === 0}>
            <CheckCheck className="h-4 w-4 mr-1" /> Marcar todas como lidas
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="todas">Todas ({counts.todas})</TabsTrigger>
            <TabsTrigger value="nao_lidas">
              Não lidas ({counts.naoLidas})
              {counts.naoLidas > 0 && <Badge className="ml-1 h-4 px-1 text-[10px]">{counts.naoLidas}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="lidas">Lidas ({counts.lidas})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
      </div>

      {isLoading ? (
        <DpContentCard contentClassName="p-6"><p className="text-sm text-muted-foreground">Carregando…</p></DpContentCard>
      ) : filtered.length === 0 ? (
        <DpContentCard><DpEmptyState icon={Bell}>Nenhuma notificação encontrada.</DpEmptyState></DpContentCard>
      ) : (
        <>
        <DpContentCard contentClassName="overflow-x-auto hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Quando</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((n) => {
                const path = REF_TO_PATH[n.ref_table] ?? "/dp/aprovacoes";
                return (
                  <TableRow key={n.id} className={n.lida_em ? "opacity-70" : ""}>
                    <TableCell>
                      <div className="font-medium">{n.titulo}</div>
                      {n.descricao && <div className="text-xs text-muted-foreground">{n.descricao}</div>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{n.ref_table}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(n.created_at), "dd 'de' MMM yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      {n.lida_em ? <Badge variant="outline">Lida</Badge> : <Badge>Nova</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost" onClick={() => { if (!n.lida_em) markRead.mutate([n.id]); }}>
                        <Link to={path}>Abrir</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DpContentCard>

        {/* Mobile: lista de cards */}
        <div className="md:hidden space-y-3">
          {filtered.map((n) => {
            const path = REF_TO_PATH[n.ref_table] ?? "/dp/aprovacoes";
            return (
              <div key={n.id} className={"rounded-2xl border border-border bg-card p-4 space-y-2 active:scale-[0.98] transition-transform " + (n.lida_em ? "opacity-70" : "")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{n.titulo}</div>
                    {n.descricao && <div className="text-xs text-muted-foreground">{n.descricao}</div>}
                  </div>
                  {n.lida_em ? <Badge variant="outline" className="text-[10px]">Lida</Badge> : <Badge className="text-[10px]">Nova</Badge>}
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">{n.ref_table}</Badge>
                  <span>{format(new Date(n.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                </div>
                <Button asChild size="sm" variant="outline" className="w-full min-h-11" onClick={() => { if (!n.lida_em) markRead.mutate([n.id]); }}>
                  <Link to={path}>Abrir</Link>
                </Button>
              </div>
            );
          })}
        </div>
        </>

      )}
    </DpPage>
  );
}
