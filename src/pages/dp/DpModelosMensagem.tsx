import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { MessageSquare, Plus, Trash2, Pencil, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Modelo = {
  id: string; titulo: string; corpo: string; canal: "whatsapp" | "email" | "sms";
  variaveis: string[]; ativo: boolean;
};

export default function DpModelosMensagem() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Modelo | null>(null);
  const [form, setForm] = useState({ titulo: "", corpo: "", canal: "whatsapp" as Modelo["canal"], variaveis: "" });

  const list = useQuery({
    queryKey: ["dp_modelos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("dp_modelos_mensagem")
        .select("*").eq("company_id", selectedCompanyId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any as Modelo[];
    },
  });

  const openNew = () => {
    setEditing(null);
    setForm({ titulo: "", corpo: "", canal: "whatsapp", variaveis: "" });
    setOpen(true);
  };
  const openEdit = (m: Modelo) => {
    setEditing(m);
    setForm({ titulo: m.titulo, corpo: m.corpo, canal: m.canal, variaveis: (m.variaveis ?? []).join(", ") });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Sem empresa");
      const payload: any = {
        company_id: selectedCompanyId,
        titulo: form.titulo.trim(),
        corpo: form.corpo,
        canal: form.canal,
        variaveis: form.variaveis.split(",").map((s) => s.trim()).filter(Boolean),
      };
      if (editing) {
        const { error } = await supabase.from("dp_modelos_mensagem").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_modelos_mensagem").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Modelo atualizado" : "Modelo criado");
      qc.invalidateQueries({ queryKey: ["dp_modelos"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_modelos_mensagem").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["dp_modelos"] }); },
  });

  return (
    <div className="space-y-4">
      <Helmet><title>Modelos de mensagem — DP 360°</title></Helmet>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> Modelos de mensagem
          </h2>
          <p className="text-sm text-muted-foreground">Templates de WhatsApp/e-mail com variáveis (ex.: <code>{"{nome}"}</code>, <code>{"{data}"}</code>).</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo modelo</Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {list.isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Variáveis</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.titulo}</TableCell>
                    <TableCell><Badge variant="outline" className="uppercase">{m.canal}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{(m.variaveis ?? []).join(", ") || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => del.mutate(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(list.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum modelo cadastrado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar modelo" : "Novo modelo"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></div>
            <div>
              <Label>Canal</Label>
              <Select value={form.canal} onValueChange={(v: any) => setForm({ ...form, canal: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Corpo</Label>
              <Textarea rows={6} value={form.corpo} onChange={(e) => setForm({ ...form, corpo: e.target.value })}
                placeholder="Olá {nome}, você tem folga em {data}." />
            </div>
            <div>
              <Label>Variáveis (separadas por vírgula)</Label>
              <Input value={form.variaveis} onChange={(e) => setForm({ ...form, variaveis: e.target.value })} placeholder="nome, data, unidade" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.titulo.trim() || !form.corpo.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
