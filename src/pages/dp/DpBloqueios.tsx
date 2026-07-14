import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { format } from "date-fns";
import { Plus, Trash2, Ban, PowerOff } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TIPOS = [
  { value: "folga", label: "Folgas" },
  { value: "troca", label: "Trocas" },
  { value: "solicitacoes", label: "Solicitações" },
  { value: "todos", label: "Todos" },
] as const;

export default function DpBloqueios() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const colabs = useDpColaboradores();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    colaborador_id: "", tipo: "todos", motivo: "",
    inicio: new Date().toISOString().slice(0, 10), fim: "",
  });

  const list = useQuery({
    queryKey: ["dp_bloqueios", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_bloqueios")
        .select("*, dp_colaboradores(nome)")
        .eq("company_id", selectedCompanyId!)
        .order("ativo", { ascending: false })
        .order("inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("dp_bloqueios").insert({
        company_id: selectedCompanyId!,
        colaborador_id: form.colaborador_id,
        tipo: form.tipo as any,
        motivo: form.motivo,
        inicio: form.inicio,
        fim: form.fim || null,
        criado_por: userRes.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bloqueio criado");
      qc.invalidateQueries({ queryKey: ["dp_bloqueios"] });
      setOpen(false);
      setForm({ colaborador_id: "", tipo: "todos", motivo: "", inicio: new Date().toISOString().slice(0, 10), fim: "" });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("dp_bloqueios").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dp_bloqueios"] }); },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_bloqueios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dp_bloqueios"] }); toast.success("Removido"); },
  });

  return (
    <div className="space-y-4">
      <Helmet><title>Bloqueios — DP 360°</title></Helmet>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Ban className="h-6 w-6" /> Bloqueios de colaboradores
          </h1>
          <p className="text-muted-foreground">Impeça temporariamente folgas, trocas ou solicitações.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Novo bloqueio</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Novo bloqueio</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Colaborador</Label>
                <Select value={form.colaborador_id} onValueChange={(v) => setForm({ ...form, colaborador_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {(colabs.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Início</Label>
                  <Input type="date" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
                </div>
                <div>
                  <Label>Fim (opcional)</Label>
                  <Input type="date" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Motivo</Label>
                <Input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button disabled={!form.colaborador_id || !form.motivo || create.isPending} onClick={() => create.mutate()}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : list.data?.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhum bloqueio.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {list.data?.map((b: any) => (
            <Card key={b.id} className={!b.ativo ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={b.ativo ? "destructive" : "secondary"}>
                      {b.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                    <Badge variant="outline">{TIPOS.find((t) => t.value === b.tipo)?.label ?? b.tipo}</Badge>
                    <CardTitle className="text-base">{b.dp_colaboradores?.nome ?? "—"}</CardTitle>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" title={b.ativo ? "Desativar" : "Reativar"}
                      onClick={() => toggle.mutate({ id: b.id, ativo: !b.ativo })}>
                      <PowerOff className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => del.mutate(b.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(b.inicio), "dd/MM/yyyy")}
                  {b.fim ? ` até ${format(new Date(b.fim), "dd/MM/yyyy")}` : " — sem data fim"}
                </p>
              </CardHeader>
              <CardContent><p className="text-sm">{b.motivo}</p></CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
