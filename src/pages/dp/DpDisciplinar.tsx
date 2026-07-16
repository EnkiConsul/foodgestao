import { Helmet } from "react-helmet-async";
import { useRef, useState } from "react";
import { Plus, Trash2, AlertOctagon, FileSignature, Upload } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HistoricoDisciplinar, type RegistroDisciplinar } from "@/components/dp/HistoricoDisciplinar";

const TIPOS = [
  { value: "advertencia_verbal", label: "Advertência verbal" },
  { value: "advertencia_escrita", label: "Advertência escrita" },
  { value: "suspensao", label: "Suspensão" },
  { value: "elogio", label: "Elogio" },
  { value: "observacao", label: "Observação" },
] as const;

export default function DpDisciplinar() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const colabs = useDpColaboradores();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    colaborador_id: "", tipo: "advertencia_verbal", data: new Date().toISOString().slice(0, 10),
    motivo: "", descricao: "", suspensao_dias: "",
  });
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);

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
      return (data ?? []) as RegistroDisciplinar[];
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

  const genPdf = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("dp-generate-disciplinary-pdf", { body: { registro_id: id } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { path: string; signed_url: string };
    },
    onSuccess: (data) => {
      toast.success("PDF gerado");
      if (data.signed_url) window.open(data.signed_url, "_blank");
      qc.invalidateQueries({ queryKey: ["dp_disciplinar"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao gerar PDF"),
  });

  const uploadPdf = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const path = `${selectedCompanyId}/${id}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("dp-disciplinar")
        .upload(path, file, { upsert: true, contentType: file.type || "application/pdf" });
      if (upErr) throw upErr;
      const { error: updErr } = await supabase
        .from("dp_registros_disciplinares")
        .update({ pdf_storage_path: path })
        .eq("id", id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      toast.success("PDF anexado");
      qc.invalidateQueries({ queryKey: ["dp_disciplinar"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao anexar PDF"),
  });

  const triggerUpload = (id: string) => {
    setUploadTargetId(id);
    uploadRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTargetId) return;
    uploadPdf.mutate({ id: uploadTargetId, file });
    e.target.value = "";
    setUploadTargetId(null);
  };

  return (
    <div className="space-y-4">
      <Helmet><title>Disciplinar — DP 360°</title></Helmet>
      <input
        ref={uploadRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={handleFileChange}
      />
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
              <p className="text-xs text-muted-foreground">
                Após salvar, você poderá gerar o PDF automaticamente ou anexar um PDF já assinado usando os ícones em cada registro.
              </p>
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
      ) : (
        <HistoricoDisciplinar
          registros={list.data ?? []}
          showColaborador
          renderActions={(r) => (
            <>
              {!r.pdf_storage_path && (
                <Button
                  size="icon"
                  variant="ghost"
                  title="Gerar PDF automaticamente"
                  disabled={genPdf.isPending}
                  onClick={() => genPdf.mutate(r.id)}
                >
                  <FileSignature className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                title={r.pdf_storage_path ? "Substituir PDF assinado" : "Anexar PDF assinado"}
                disabled={uploadPdf.isPending}
                onClick={() => triggerUpload(r.id)}
              >
                <Upload className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" title="Excluir" onClick={() => del.mutate(r.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        />
      )}
    </div>
  );
}
