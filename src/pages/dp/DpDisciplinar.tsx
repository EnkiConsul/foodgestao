import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Trash2, AlertOctagon } from "lucide-react";
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

const TIPOS = [
  { value: "advertencia_verbal", label: "Advertência verbal" },
  { value: "advertencia_escrita", label: "Advertência escrita" },
  { value: "suspensao", label: "Suspensão" },
  { value: "elogio", label: "Elogio" },
  { value: "observacao", label: "Observação" },
] as const;

const cor: Record<string, string> = {
  advertencia_verbal: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  advertencia_escrita: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  suspensao: "bg-red-500/10 text-red-700 dark:text-red-300",
  elogio: "bg-green-500/10 text-green-700 dark:text-green-300",
  observacao: "bg-muted text-muted-foreground",
};

export default function DpDisciplinar() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const colabs = useDpColaboradores();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    colaborador_id: "", tipo: "advertencia_verbal", data: new Date().toISOString().slice(0, 10),
    motivo: "", descricao: "", suspensao_dias: "",
  });

  const list = useQuery({
    queryKey: ["dp_disciplinar", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_registros_disciplinares")
        .select("*, dp_colaboradores(nome)")
        .eq("company_id", selectedCompanyId!)
        .order("data", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("dp_registros_disciplinares").insert({
        company_id: selectedCompanyId!,
        colaborador_id: form.colaborador_id,
        tipo: form.tipo as any,
        data: form.data,
        motivo: form.motivo,
        descricao: form.descricao || null,
        suspensao_dias: form.tipo === "suspensao" && form.suspensao_dias ? Number(form.suspensao_dias) : null,
        aplicado_por: userRes.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro criado");
      qc.invalidateQueries({ queryKey: ["dp_disciplinar"] });
      setOpen(false);
      setForm({ colaborador_id: "", tipo: "advertencia_verbal", data: new Date().toISOString().slice(0, 10), motivo: "", descricao: "", suspensao_dias: "" });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_registros_disciplinares").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dp_disciplinar"] }); toast.success("Removido"); },
  });

  return (
    <div className="space-y-4">
      <Helmet><title>Disciplinar — DP 360°</title></Helmet>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertOctagon className="h-6 w-6" /> Registros disciplinares
          </h1>
          <p className="text-muted-foreground">Advertências, suspensões, elogios e observações.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Novo registro</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Novo registro</DialogTitle></DialogHeader>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Data</Label>
                  <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
                </div>
              </div>
              {form.tipo === "suspensao" && (
                <div>
                  <Label>Dias de suspensão</Label>
                  <Input type="number" min="1" value={form.suspensao_dias} onChange={(e) => setForm({ ...form, suspensao_dias: e.target.value })} />
                </div>
              )}
              <div>
                <Label>Motivo</Label>
                <Input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                disabled={!form.colaborador_id || !form.motivo || create.isPending}
                onClick={() => create.mutate()}
              >Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : list.data?.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhum registro.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {list.data?.map((r: any) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={cor[r.tipo]}>{TIPOS.find((t) => t.value === r.tipo)?.label ?? r.tipo}</Badge>
                    <CardTitle className="text-base">{r.dp_colaboradores?.nome ?? "—"}</CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(r.data), "dd 'de' MMM yyyy", { locale: ptBR })}
                    </span>
                    {r.suspensao_dias && <Badge variant="outline">{r.suspensao_dias} dia(s)</Badge>}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => del.mutate(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">{r.motivo}</p>
                {r.descricao && <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{r.descricao}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
