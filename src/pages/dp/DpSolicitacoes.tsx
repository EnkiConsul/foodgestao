import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Check, X, FileText, ClipboardList, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useAuth } from "@/hooks/useAuth";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { DpContentCard, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { RecusaDialog } from "@/components/dp/RecusaDialog";
import type { Database } from "@/integrations/supabase/types";

type Tipo = Database["public"]["Enums"]["dp_solicitacao_tipo"];
type Status = Database["public"]["Enums"]["dp_solicitacao_status"];
type Row = Database["public"]["Tables"]["dp_solicitacoes"]["Row"];

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "folga", label: "Folga" },
  { value: "ferias", label: "Férias" },
  { value: "atestado", label: "Atestado" },
  { value: "adiantamento", label: "Adiantamento" },
  { value: "outros", label: "Outros" },
];

const STATUS_BADGE: Record<Status, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-500 text-white" },
  aprovada: { label: "Aprovada", className: "bg-primary text-primary-foreground" },
  recusada: { label: "Recusada", className: "bg-destructive text-destructive-foreground" },
  cancelada: { label: "Cancelada", className: "bg-muted text-muted-foreground" },
};

export default function DpSolicitacoes() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  const colabs = useDpColaboradores();
  const [tab, setTab] = useState<Status | "todas">("pendente");
  const [tipoFiltro, setTipoFiltro] = useState<Tipo | "todos">("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [recusaId, setRecusaId] = useState<string | null>(null);
  const [confirmAdiantamento, setConfirmAdiantamento] = useState<Row | null>(null);

  const [form, setForm] = useState({ colaborador_id: "", tipo: "folga" as Tipo, data_alvo: "", data_fim: "", motivo: "" });

  const counts = useQuery({
    queryKey: ["dp_solicitacoes_counts", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("dp_solicitacoes").select("status").eq("company_id", selectedCompanyId!);
      if (error) throw error;
      const acc: Record<string, number> = { pendente: 0, aprovada: 0, recusada: 0, cancelada: 0, todas: 0 };
      for (const r of data ?? []) {
        acc[r.status as string] = (acc[r.status as string] ?? 0) + 1;
        acc.todas += 1;
      }
      return acc;
    },
  });

  const list = useQuery({
    queryKey: ["dp_solicitacoes", selectedCompanyId, tab],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase.from("dp_solicitacoes").select("*, dp_colaboradores(nome)").eq("company_id", selectedCompanyId!).order("created_at", { ascending: false });
      if (tab !== "todas") q = q.eq("status", tab);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as (Row & { dp_colaboradores: { nome: string } | null })[];
    },
  });

  const filteredRows = useMemo(() => {
    const rows = list.data ?? [];
    if (tipoFiltro === "todos") return rows;
    return rows.filter((r) => r.tipo === tipoFiltro);
  }, [list.data, tipoFiltro]);

  const create = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Sem empresa");
      if (!form.colaborador_id) throw new Error("Selecione um colaborador");
      const { error } = await supabase.from("dp_solicitacoes").insert({
        company_id: selectedCompanyId,
        colaborador_id: form.colaborador_id,
        tipo: form.tipo,
        data_alvo: form.data_alvo || null,
        data_fim: form.data_fim || null,
        motivo: form.motivo.trim() || null,
        criado_por: user?.id,
        status: "pendente",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação criada");
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes_counts"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      setDialogOpen(false);
      setForm({ colaborador_id: "", tipo: "folga", data_alvo: "", data_fim: "", motivo: "" });
    },
    onError: (e) => toast.error("Erro", { description: e instanceof Error ? e.message : String(e) }),
  });

  const respond = useMutation({
    mutationFn: async ({ id, status, resposta }: { id: string; status: Status; resposta?: string }) => {
      const { error } = await supabase.from("dp_solicitacoes").update({
        status, respondido_por: user?.id, respondido_em: new Date().toISOString(),
        resposta_admin: resposta ?? null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.status === "aprovada" ? "Aprovada" : "Recusada");
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes_counts"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      setRecusaId(null);
      setConfirmAdiantamento(null);
    },
    onError: (e) => toast.error("Erro", { description: e instanceof Error ? e.message : String(e) }),
  });

  const openArquivo = async (path: string) => {
    const { data, error } = await supabase.storage.from("dp-documentos").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  const c = counts.data ?? {};
  const tabLabel = (label: string, key: string) => (
    <span className="flex items-center gap-1.5">
      {label}
      {typeof c[key] === "number" && (
        <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 font-semibold">{c[key]}</span>
      )}
    </span>
  );

  const handleAprovar = (r: Row & { dp_colaboradores: { nome: string } | null }) => {
    if (r.tipo === "adiantamento") {
      setConfirmAdiantamento(r);
      return;
    }
    respond.mutate({ id: r.id, status: "aprovada" });
  };

  return (
    <DpPage>
      <Helmet><title>Solicitações — DP 360°</title></Helmet>
      <DpPageHeader
        icon={ClipboardList}
        title="Solicitações"
        description="Folgas, atestados, adiantamentos e outros pedidos."
        actions={<Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> Nova solicitação</Button>}
      />

      <DpFilterCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Status | "todas")}>
            <TabsList>
              <TabsTrigger value="pendente">{tabLabel("Pendentes", "pendente")}</TabsTrigger>
              <TabsTrigger value="aprovada">{tabLabel("Aprovadas", "aprovada")}</TabsTrigger>
              <TabsTrigger value="recusada">{tabLabel("Recusadas", "recusada")}</TabsTrigger>
              <TabsTrigger value="todas">{tabLabel("Todas", "todas")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Tipo:</Label>
            <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as Tipo | "todos")}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </DpFilterCard>

      <DpContentCard contentClassName="overflow-x-auto">
          {list.isLoading ? (
            <TableSkeleton columns={6} headers={["Colaborador", "Tipo", "Data alvo", "Motivo", "Status", ""]} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Data alvo</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.dp_colaboradores?.nome ?? "—"}</TableCell>
                    <TableCell className="capitalize">{r.tipo}</TableCell>
                    <TableCell>{r.data_alvo ?? "—"}{r.data_fim ? ` → ${r.data_fim}` : ""}</TableCell>
                    <TableCell className="max-w-xs truncate">{r.motivo ?? "—"}</TableCell>
                    <TableCell><Badge className={STATUS_BADGE[r.status].className}>{STATUS_BADGE[r.status].label}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        {(r as any).arquivo_path && (
                          <Button size="icon" variant="ghost" onClick={() => openArquivo((r as any).arquivo_path)} title="Ver arquivo">
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        {r.status === "pendente" && (
                          <>
                            <Button size="icon" variant="ghost" title="Aprovar" onClick={() => handleAprovar(r)}>
                              <Check className="h-4 w-4 text-primary" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Recusar" onClick={() => setRecusaId(r.id)}>
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma solicitação.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
      </DpContentCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova solicitação</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Colaborador *</Label>
              <Select value={form.colaborador_id} onValueChange={(v) => setForm({ ...form, colaborador_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {(colabs.data ?? []).filter(c => c.ativo).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Data alvo</Label>
                <Input type="date" value={form.data_alvo} onChange={(e) => setForm({ ...form, data_alvo: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Data fim (opcional)</Label>
                <Input type="date" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Motivo</Label>
              <Textarea rows={3} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Salvando..." : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecusaDialog
        open={!!recusaId}
        onOpenChange={(v) => !v && setRecusaId(null)}
        title="Recusar solicitação"
        loading={respond.isPending}
        onConfirm={(motivo) => recusaId && respond.mutate({ id: recusaId, status: "recusada", resposta: motivo || undefined })}
      />

      <AlertDialog open={!!confirmAdiantamento} onOpenChange={(v) => !v && setConfirmAdiantamento(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Aprovar adiantamento?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você está aprovando um pedido de adiantamento para <b>{confirmAdiantamento?.dp_colaboradores?.nome}</b>.
              Esta ação pode gerar um lançamento financeiro. Confirma?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAdiantamento && respond.mutate({ id: confirmAdiantamento.id, status: "aprovada" })}
            >
              Sim, aprovar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}
