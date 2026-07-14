import { Helmet } from "react-helmet-async";
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

export default function DpTrocas() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const colabs = useDpColaboradores();
  const [open, setOpen] = useState(false);
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
      const patch: any = {};
      if (etapa === "colega") {
        patch.colega_resposta = obs ?? (aceito ? "aceito" : "recusado");
        patch.colega_respondido_em = now;
        patch.status = aceito ? "pendente_gestor" : "recusada";
      } else {
        patch.gestor_resposta = obs ?? (aceito ? "aprovada" : "recusada");
        patch.gestor_respondido_em = now;
        patch.gestor_id = userRes.user?.id ?? null;
        patch.status = aceito ? "aprovada" : "recusada";
      }
      const { error } = await supabase.from("dp_trocas").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dp_trocas"] }); toast.success("Resposta registrada"); },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_trocas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dp_trocas"] }); toast.success("Removido"); },
  });

  return (
    <div className="space-y-4">
      <Helmet><title>Trocas — DP 360°</title></Helmet>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Repeat className="h-6 w-6" /> Trocas de plantão
          </h1>
          <p className="text-muted-foreground">Fluxo de aprovação: colega → gestor.</p>
        </div>
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
      </div>

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : list.data?.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma troca solicitada.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {list.data?.map((t: any) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={statusColor[t.status]}>{statusLabel[t.status]}</Badge>
                    <CardTitle className="text-base">
                      {t.solicitante?.nome} → {t.destino?.nome}
                    </CardTitle>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => del.mutate(t.id)}>
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
                    <Button size="sm" variant="outline" onClick={() => responder.mutate({ id: t.id, etapa: "colega", aceito: false })}>
                      <X className="h-4 w-4 mr-1" /> Colega recusa
                    </Button>
                  </div>
                )}
                {t.status === "pendente_gestor" && (
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={() => responder.mutate({ id: t.id, etapa: "gestor", aceito: true })}>
                      <Check className="h-4 w-4 mr-1" /> Gestor aprova
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => responder.mutate({ id: t.id, etapa: "gestor", aceito: false })}>
                      <X className="h-4 w-4 mr-1" /> Gestor recusa
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
