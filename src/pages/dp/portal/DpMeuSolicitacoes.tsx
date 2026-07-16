import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { format } from "date-fns";
import { Plus, ClipboardList } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DpContentCard, DpEmptyState, DpPage, DpPageHeader } from "@/components/dp/DpPage";

const TIPOS = [
  { value: "folga", label: "Folga" },
  { value: "adiantamento", label: "Adiantamento" },
  { value: "atestado", label: "Atestado" },
  { value: "ferias", label: "Férias" },
  { value: "outro", label: "Outro" },
];

const statusColor: Record<string, string> = {
  pendente: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  aprovada: "bg-green-500/10 text-green-700 dark:text-green-300",
  recusada: "bg-red-500/10 text-red-700 dark:text-red-300",
  cancelada: "bg-muted text-muted-foreground",
};

export default function DpMeuSolicitacoes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ tipo: "folga", data_alvo: "", data_fim: "", motivo: "" });

  const list = useQuery({
    queryKey: ["dp_meu_sol", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: cid } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (!cid) return [];
      const { data, error } = await supabase
        .from("dp_solicitacoes").select("*")
        .eq("colaborador_id", cid as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: cid } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (!cid) throw new Error("Colaborador não encontrado");
      const { data: colab } = await supabase.from("dp_colaboradores").select("company_id").eq("id", cid as string).single();
      const { error } = await supabase.from("dp_solicitacoes").insert({
        company_id: colab!.company_id,
        colaborador_id: cid as string,
        tipo: form.tipo as any,
        data_alvo: form.data_alvo || null,
        data_fim: form.data_fim || null,
        motivo: form.motivo || null,
        criado_por: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação enviada");
      qc.invalidateQueries({ queryKey: ["dp_meu_sol"] });
      setOpen(false);
      setForm({ tipo: "folga", data_alvo: "", data_fim: "", motivo: "" });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  return (
    <DpPage>
      <Helmet><title>Minhas solicitações — Portal</title></Helmet>
      <DpPageHeader
        icon={ClipboardList}
        title="Minhas solicitações"
        actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Nova</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Nova solicitação</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data</Label>
                  <Input type="date" value={form.data_alvo} onChange={(e) => setForm({ ...form, data_alvo: e.target.value })} />
                </div>
                <div>
                  <Label>Data fim</Label>
                  <Input type="date" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Motivo</Label>
                <Textarea rows={3} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button disabled={create.isPending} onClick={() => create.mutate()}>Enviar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        }
      />

      {(list.data?.length ?? 0) === 0 ? (
        <DpContentCard><DpEmptyState icon={ClipboardList}>Sem solicitações.</DpEmptyState></DpContentCard>
      ) : (
        <div className="grid gap-3">
          {list.data?.map((s: any) => (
            <Card key={s.id} className="dp-content-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base capitalize">{s.tipo}</CardTitle>
                  <Badge className={statusColor[s.status]}>{s.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.data_alvo && format(new Date(s.data_alvo), "dd/MM/yyyy")}
                  {s.data_fim && ` – ${format(new Date(s.data_fim), "dd/MM/yyyy")}`}
                </p>
              </CardHeader>
              <CardContent>
                {s.motivo && <p className="text-sm">{s.motivo}</p>}
                {s.resposta_admin && (
                  <p className="text-xs text-muted-foreground mt-2">Resposta: {s.resposta_admin}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DpPage>
  );
}
