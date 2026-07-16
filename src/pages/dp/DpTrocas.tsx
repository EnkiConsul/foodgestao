import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Plus, Trash2, Repeat, Check, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DpContentCard, DpEmptyState, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { RecusaDialog } from "@/components/dp/RecusaDialog";

const statusColor: Record<string, string> = {
  pendente_colega: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  pendente_gestor: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  aprovada: "bg-green-500/10 text-green-700 dark:text-green-300",
  recusada: "bg-red-500/10 text-red-700 dark:text-red-300",
  cancelada: "bg-muted text-muted-foreground",
};
const statusLabel: Record<string, string> = {
  pendente_colega: "Aguardando colega",
  pendente_gestor: "Aguardando gestor",
  aprovada: "Aprovada",
  recusada: "Recusada",
  cancelada: "Cancelada",
};

type TabKey = "todas" | "pendente_colega" | "pendente_gestor" | "aprovada" | "recusada";

export default function DpTrocas() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const colabs = useDpColaboradores();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("pendente_gestor");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<{ id: string; etapa: "colega" | "gestor" } | null>(null);
  const [form, setForm] = useState({
    solicitante_id: "", destino_id: "", data_original: "", data_proposta: "", motivo: "",
  });

  const list = useQuery({
    queryKey: ["dp_trocas", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_trocas")
        .select("*, solicitante:solicitante_id(nome), destino:destino_id(nome)")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const counts = useMemo(() => {
    const acc: Record<string, number> = { pendente_colega: 0, pendente_gestor: 0, aprovada: 0, recusada: 0, todas: 0 };
    for (const t of list.data ?? []) {
      acc[(t as any).status] = (acc[(t as any).status] ?? 0) + 1;
      acc.todas += 1;
    }
    return acc;
  }, [list.data]);

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    if (tab === "todas") return rows;
    return rows.filter((t: any) => t.status === tab);
  }, [list.data, tab]);

  const create = useMutation({
    mutationFn: async () => {
      if (form.solicitante_id === form.destino_id) throw new Error("Selecione colaboradores diferentes");
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("dp_trocas").insert({
        company_id: selectedCompanyId!,
        solicitante_id: form.solicitante_id,
        destino_id: form.destino_id,
        data_original: form.data_original,
        data_proposta: form.data_proposta,
        motivo: form.motivo,
        created_by: userRes.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Troca solicitada");
      qc.invalidateQueries({ queryKey: ["dp_trocas"] });
      setOpen(false);
      setForm({ solicitante_id: "", destino_id: "", data_original: "", data_proposta: "", motivo: "" });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const responder = useMutation({
    mutationFn: async ({ id, etapa, aceito, obs }: { id: string; etapa: "colega" | "gestor"; aceito: boolean; obs?: string }) => {
      const now = new Date().toISOString();
      const { data: userRes } = await supabase.auth.getUser();
      if (etapa === "colega") {
        const { error } = await supabase.from("dp_trocas").update({
          colega_resposta: obs ?? (aceito ? "aprovada" : "recusada"),
          colega_respondido_em: now,
          status: aceito ? "pendente_gestor" : "recusada",
        }).eq("id", id);
        if (error) throw error;
        return;
      }
      if (!aceito) {
        const { error } = await supabase.from("dp_trocas").update({
          gestor_resposta: obs ?? "recusada",
          gestor_respondido_em: now,
          gestor_id: userRes.user?.id ?? null,
          status: "recusada",
        }).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error: upErr } = await supabase.from("dp_trocas").update({
        gestor_resposta: "aprovada",
        gestor_respondido_em: now,
        gestor_id: userRes.user?.id ?? null,
      }).eq("id", id);
      if (upErr) throw upErr;
      const { data, error: rpcErr } = await supabase.rpc("dp_processar_troca", { _troca_id: id });
      if (rpcErr) throw rpcErr;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_trocas"] });
      toast.success("Resposta registrada");
      setRecusa(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_trocas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_trocas"] });
      toast.success("Removido");
      setConfirmDel(null);
    },
  });

  const tabChip = (label: string, key: TabKey | "todas") => (
    <span className="flex items-center gap-1.5">
      {label}
      {typeof counts[key as string] === "number" && (
        <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 font-semibold">{counts[key as string]}</span>
      )}
    </span>
  );

  return (
    <DpPage>
      <Helmet><title>Trocas — DP 360°</title></Helmet>
      <DpPageHeader
        icon={Repeat}
        title="Trocas de plantão"
        description="Fluxo de aprovação: colega → gestor."
        actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Nova troca</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nova solicitação de troca</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Solicitante</Label>
                  <Select value={form.solicitante_id} onValueChange={(v) => setForm({ ...form, solicitante_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {(colabs.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Colega destino</Label>
                  <Select value={form.destino_id} onValueChange={(v) => setForm({ ...form, destino_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {(colabs.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data original</Label>
                  <Input type="date" value={form.data_original} onChange={(e) => setForm({ ...form, data_original: e.target.value })} />
                </div>
                <div>
                  <Label>Data proposta</Label>
                  <Input type="date" value={form.data_proposta} onChange={(e) => setForm({ ...form, data_proposta: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Motivo</Label>
                <Textarea rows={3} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                disabled={!form.solicitante_id || !form.destino_id || !form.data_original || !form.data_proposta || !form.motivo || create.isPending}
                onClick={() => create.mutate()}
              >Solicitar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        }
      />

      <DpFilterCard>
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="pendente_gestor">{tabChip("Aguardando gestor", "pendente_gestor")}</TabsTrigger>
            <TabsTrigger value="pendente_colega">{tabChip("Aguardando colega", "pendente_colega")}</TabsTrigger>
            <TabsTrigger value="aprovada">{tabChip("Aprovadas", "aprovada")}</TabsTrigger>
            <TabsTrigger value="recusada">{tabChip("Recusadas", "recusada")}</TabsTrigger>
            <TabsTrigger value="todas">{tabChip("Todas", "todas")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </DpFilterCard>

      {list.isLoading ? (
        <DpContentCard contentClassName="p-6"><p className="text-sm text-muted-foreground">Carregando…</p></DpContentCard>
      ) : filtered.length === 0 ? (
        <DpContentCard><DpEmptyState icon={Repeat}>Nenhuma troca nesta categoria.</DpEmptyState></DpContentCard>
      ) : (
        <div className="grid gap-3">
          {filtered.map((t: any) => (
            <Card key={t.id} className="dp-content-card">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={statusColor[t.status]}>{statusLabel[t.status]}</Badge>
                    <CardTitle className="text-base">
                      {t.solicitante?.nome} → {t.destino?.nome}
                    </CardTitle>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => setConfirmDel(t.id)} title="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(t.data_original), "dd/MM/yyyy")} ↔ {format(new Date(t.data_proposta), "dd/MM/yyyy")}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">{t.motivo}</p>
                {t.colega_resposta && (
                  <p className="text-xs text-muted-foreground">Colega: {t.colega_resposta}</p>
                )}
                {t.gestor_resposta && (
                  <p className="text-xs text-muted-foreground">Gestor: {t.gestor_resposta}</p>
                )}
                {t.status === "pendente_colega" && (
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => responder.mutate({ id: t.id, etapa: "colega", aceito: true })}>
                      <Check className="h-4 w-4 mr-1" /> Colega aceita
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRecusa({ id: t.id, etapa: "colega" })}>
                      <X className="h-4 w-4 mr-1" /> Colega recusa
                    </Button>
                  </div>
                )}
                {t.status === "pendente_gestor" && (
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={() => responder.mutate({ id: t.id, etapa: "gestor", aceito: true })}>
                      <Check className="h-4 w-4 mr-1" /> Gestor aprova
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRecusa({ id: t.id, etapa: "gestor" })}>
                      <X className="h-4 w-4 mr-1" /> Gestor recusa
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta troca?</AlertDialogTitle>
            <AlertDialogDescription>
              A solicitação será removida permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => confirmDel && del.mutate(confirmDel)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecusaDialog
        open={!!recusa}
        onOpenChange={(v) => !v && setRecusa(null)}
        title={recusa?.etapa === "colega" ? "Colega recusa" : "Gestor recusa"}
        motivoObrigatorio
        loading={responder.isPending}
        onConfirm={(motivo) => recusa && responder.mutate({ id: recusa.id, etapa: recusa.etapa, aceito: false, obs: motivo })}
      />
    </DpPage>
  );
}
