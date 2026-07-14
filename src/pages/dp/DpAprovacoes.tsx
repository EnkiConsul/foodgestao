import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Loader2, CheckCheck, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDpNotificacoes, useMarkNotifRead } from "@/hooks/useDpNotificacoes";
import type { Database } from "@/integrations/supabase/types";

type NotifTipo = Database["public"]["Enums"]["dp_notificacao_tipo"];

const REF_TO_PATH: Record<string, string> = {
  dp_solicitacoes: "/dp/solicitacoes",
  dp_trocas: "/dp/trocas",
  dp_registros_disciplinares: "/dp/disciplinar",
};

const TIPO_LABEL: Record<NotifTipo, string> = {
  solicitacao_nova: "Solicitação",
  solicitacao_respondida: "Solicitação respondida",
  troca_nova: "Nova troca",
  troca_resposta_colega: "Resposta colega",
  troca_resposta_gestor: "Resposta gestor",
  disciplinar_novo: "Disciplinar",
};

export default function DpAprovacoes() {
  const [tab, setTab] = useState<"pendentes" | "todas">("pendentes");
  const [filterTable, setFilterTable] = useState<string>("todas");
  const list = useDpNotificacoes();
  const mark = useMarkNotifRead();

  const rows = useMemo(() => {
    const base = list.data ?? [];
    return base
      .filter((n) => (tab === "pendentes" ? !n.lida_em : true))
      .filter((n) => (filterTable === "todas" ? true : n.ref_table === filterTable));
  }, [list.data, tab, filterTable]);

  const pendentesCount = (list.data ?? []).filter((n) => !n.lida_em).length;
  const markAll = () => mark.mutate(rows.filter((n) => !n.lida_em).map((n) => n.id));

  return (
    <div className="space-y-4">
      <Helmet><title>Aprovações & Notificações — DP 360°</title></Helmet>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Aprovações & Notificações</h2>
          <p className="text-sm text-muted-foreground">{pendentesCount} pendente(s)</p>
        </div>
        <Button variant="outline" onClick={markAll} disabled={mark.isPending || rows.every((n) => n.lida_em)}>
          <CheckCheck className="h-4 w-4 mr-2" /> Marcar tudo como lido
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
            <TabsTrigger value="todas">Todas</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-1">
          {[
            { v: "todas", l: "Tudo" },
            { v: "dp_solicitacoes", l: "Solicitações" },
            { v: "dp_trocas", l: "Trocas" },
            { v: "dp_registros_disciplinares", l: "Disciplinar" },
          ].map((f) => (
            <Button
              key={f.v}
              size="sm"
              variant={filterTable === f.v ? "default" : "outline"}
              onClick={() => setFilterTable(f.v)}
            >{f.l}</Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {list.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((n) => {
                  const path = REF_TO_PATH[n.ref_table] ?? "#";
                  return (
                    <TableRow key={n.id}>
                      <TableCell><Badge variant="outline">{TIPO_LABEL[n.tipo]}</Badge></TableCell>
                      <TableCell className="font-medium">{n.titulo}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{n.descricao ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(n.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        {n.lida_em
                          ? <Badge variant="outline">Lida</Badge>
                          : <Badge className="bg-primary">Nova</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          {!n.lida_em && (
                            <Button size="sm" variant="ghost" onClick={() => mark.mutate([n.id])}>
                              <CheckCheck className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" asChild>
                            <Link to={path} onClick={() => { if (!n.lida_em) mark.mutate([n.id]); }}>
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhuma notificação nesta visão.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
