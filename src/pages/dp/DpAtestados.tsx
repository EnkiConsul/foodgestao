import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HeartPulse, Check, X, FileText, Eye, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { DocumentPreview } from "@/components/dp/DocumentPreview";
import { DpContentCard, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { RecusaDialog } from "@/components/dp/RecusaDialog";
import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["dp_solicitacao_status"];
type Row = Database["public"]["Tables"]["dp_solicitacoes"]["Row"] & {
  dp_colaboradores: { nome: string } | null;
};

const STATUS_BADGE: Record<Status, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-500 text-white" },
  aprovada: { label: "Aprovada", className: "bg-primary text-primary-foreground" },
  recusada: { label: "Recusada", className: "bg-destructive text-destructive-foreground" },
  cancelada: { label: "Cancelada", className: "bg-muted text-muted-foreground" },
};

export default function DpAtestados() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Status | "todas">("pendente");
  const [preview, setPreview] = useState<{ title: string; path: string } | null>(null);
  const [recusaId, setRecusaId] = useState<string | null>(null);

  const counts = useQuery({
    queryKey: ["dp_atestados_counts", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("dp_solicitacoes")
        .select("status").eq("company_id", selectedCompanyId!).eq("tipo", "atestado");
      if (error) throw error;
      const acc: Record<string, number> = { pendente: 0, aprovada: 0, recusada: 0, cancelada: 0, todas: 0 };
      for (const r of data ?? []) { acc[r.status as string] = (acc[r.status as string] ?? 0) + 1; acc.todas += 1; }
      return acc;
    },
  });

  const list = useQuery({
    queryKey: ["dp_atestados_admin", selectedCompanyId, tab],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_solicitacoes")
        .select("*, dp_colaboradores(nome)")
        .eq("company_id", selectedCompanyId!)
        .eq("tipo", "atestado")
        .order("created_at", { ascending: false });
      if (tab !== "todas") q = q.eq("status", tab);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const respond = useMutation({
    mutationFn: async ({ id, status, resposta }: { id: string; status: Status; resposta?: string }) => {
      const { error } = await supabase.from("dp_solicitacoes").update({
        status,
        respondido_por: user?.id,
        respondido_em: new Date().toISOString(),
        resposta_admin: resposta ?? null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.status === "aprovada" ? "Atestado aprovado" : "Atestado recusado");
      qc.invalidateQueries({ queryKey: ["dp_atestados_admin"] });
      qc.invalidateQueries({ queryKey: ["dp_atestados_pendentes"] });
      qc.invalidateQueries({ queryKey: ["dp_atestados_counts"] });
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      setRecusaId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const openArquivo = async (path: string, titulo: string) => {
    setPreview({ title: titulo, path });
  };

  const rows = list.data ?? [];
  const pendentesCount = rows.filter((r) => r.status === "pendente").length;

  return (
    <DpPage>
      <Helmet><title>Atestados — DP 360°</title></Helmet>
      <DpPageHeader
        icon={HeartPulse}
        title="Atestados"
        description="Aprovação centralizada de atestados médicos enviados pelos colaboradores."
        actions={tab !== "pendente" && pendentesCount > 0 ? (
          <Badge className="bg-amber-500 text-white">
            {pendentesCount} pendente(s)
          </Badge>
        ) : undefined}
      />

      <DpFilterCard>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Status | "todas")}>
        <TabsList>
          <TabsTrigger value="pendente">Pendentes {typeof counts.data?.pendente === "number" && <span className="ml-1.5 text-[10px] rounded-full bg-muted px-1.5 py-0.5 font-semibold">{counts.data.pendente}</span>}</TabsTrigger>
          <TabsTrigger value="aprovada">Aprovados {typeof counts.data?.aprovada === "number" && <span className="ml-1.5 text-[10px] rounded-full bg-muted px-1.5 py-0.5 font-semibold">{counts.data.aprovada}</span>}</TabsTrigger>
          <TabsTrigger value="recusada">Recusados {typeof counts.data?.recusada === "number" && <span className="ml-1.5 text-[10px] rounded-full bg-muted px-1.5 py-0.5 font-semibold">{counts.data.recusada}</span>}</TabsTrigger>
          <TabsTrigger value="todas">Todos {typeof counts.data?.todas === "number" && <span className="ml-1.5 text-[10px] rounded-full bg-muted px-1.5 py-0.5 font-semibold">{counts.data.todas}</span>}</TabsTrigger>
        </TabsList>
      </Tabs>
      </DpFilterCard>

      <DpContentCard contentClassName="overflow-x-auto">
          {list.isLoading ? (
            <TableSkeleton
              columns={5}
              headers={["Colaborador", "Data alvo", "Motivo", "Status", "Ações"]}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Data alvo</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-40 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const arquivo = (r as any).arquivo_path as string | null;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.dp_colaboradores?.nome ?? "—"}</TableCell>
                      <TableCell>
                        {r.data_alvo ?? "—"}
                        {r.data_fim ? ` → ${r.data_fim}` : ""}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{r.motivo ?? "—"}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_BADGE[r.status].className}>
                          {STATUS_BADGE[r.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          {arquivo && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Pré-visualizar"
                              onClick={() => openArquivo(arquivo, `Atestado — ${r.dp_colaboradores?.nome ?? ""}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          {r.status === "pendente" && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Aprovar"
                                onClick={() => respond.mutate({ id: r.id, status: "aprovada" })}
                              >
                                <Check className="h-4 w-4 text-primary" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Recusar"
                                onClick={() => {
                                  const resposta = window.prompt("Motivo da recusa (opcional):") ?? undefined;
                                  respond.mutate({ id: r.id, status: "recusada", resposta });
                                }}
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      Nenhum atestado {tab === "pendente" ? "pendente" : `nesta categoria`}.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
      </DpContentCard>

      <DocumentPreview
        open={!!preview}
        onOpenChange={(v) => { if (!v) setPreview(null); }}
        title={preview?.title}
        bucket="dp-documentos"
        path={preview?.path}
      />
    </DpPage>
  );
}
