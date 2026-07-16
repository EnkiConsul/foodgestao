import { Helmet } from "react-helmet-async";
import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, AlertOctagon, FileSignature, Upload } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { HistoricoDisciplinar, type RegistroDisciplinar } from "@/components/dp/HistoricoDisciplinar";
import { DpContentCard, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";

const TIPOS = [
  { value: "advertencia_verbal", label: "Advertência verbal" },
  { value: "advertencia_escrita", label: "Advertência escrita" },
  { value: "suspensao", label: "Suspensão" },
  { value: "elogio", label: "Elogio" },
  { value: "observacao", label: "Observação" },
] as const;

/**
 * Convenção de storage:
 * - PDFs gerados automaticamente: `<company>/<id>.pdf`
 * - PDFs anexados manualmente: `<company>/<id>/<timestamp>-<nome>`
 * Distinguimos pelo segmento `/${id}/` no path.
 */
function pdfOrigem(r: RegistroDisciplinar): "gerado" | "anexado" | null {
  if (!r.pdf_storage_path) return null;
  return r.pdf_storage_path.includes(`/${r.id}/`) ? "anexado" : "gerado";
}

export default function DpDisciplinar() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const colabs = useDpColaboradores();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    colaborador_id: "", tipo: "advertencia_verbal", data: new Date().toISOString().slice(0, 10),
    motivo: "", descricao: "", suspensao_dias: "",
  });
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [filterColab, setFilterColab] = useState<string>("todos");
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
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

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    return rows.filter((r: any) => {
      if (filterColab !== "todos" && r.colaborador_id !== filterColab) return false;
      if (filterTipo !== "todos" && r.tipo !== filterTipo) return false;
      if (dataDe && r.data < dataDe) return false;
      if (dataAte && r.data > dataAte) return false;
      return true;
    });
  }, [list.data, filterColab, filterTipo, dataDe, dataAte]);

  const create = useMutation({
    mutationFn: async () => {
      if (form.tipo === "suspensao") {
        const dias = Number(form.suspensao_dias);
        if (!Number.isFinite(dias) || dias <= 0) {
          throw new Error("Informe o número de dias de suspensão (maior que zero).");
        }
      }
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_disciplinar"] });
      toast.success("Removido");
      setConfirmDel(null);
    },
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
    <DpPage>
      <Helmet><title>Disciplinar — DP 360°</title></Helmet>
      <input
        ref={uploadRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <DpPageHeader
        icon={AlertOctagon}
        title="Registros disciplinares"
        description="Advertências, suspensões, elogios e observações."
        actions={
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
                  <Label>Dias de suspensão *</Label>
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
                disabled={
                  !form.colaborador_id || !form.motivo || create.isPending ||
                  (form.tipo === "suspensao" && (!form.suspensao_dias || Number(form.suspensao_dias) <= 0))
                }
                onClick={() => create.mutate()}
              >Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        }
      />

      <DpFilterCard>
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">Colaborador</Label>
            <Select value={filterColab} onValueChange={setFilterColab}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {(colabs.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" className="h-9" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" className="h-9" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
          </div>
        </div>
      </DpFilterCard>

      {list.isLoading ? (
        <DpContentCard contentClassName="p-6"><p className="text-sm text-muted-foreground">Carregando…</p></DpContentCard>
      ) : (
        <HistoricoDisciplinar
          registros={filtered}
          showColaborador
          renderActions={(r) => {
            const origem = pdfOrigem(r);
            return (
              <>
                {origem && (
                  <Badge variant="outline" className={origem === "gerado"
                    ? "text-[10px] border-blue-300 text-blue-700 dark:text-blue-300"
                    : "text-[10px] border-emerald-300 text-emerald-700 dark:text-emerald-300"}>
                    PDF {origem === "gerado" ? "gerado" : "anexado"}
                  </Badge>
                )}
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
                <Button size="icon" variant="ghost" title="Excluir" onClick={() => setConfirmDel(r.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            );
          }}
        />
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro disciplinar?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro e o PDF anexado (se houver) serão removidos. Esta ação não pode ser desfeita.
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
    </DpPage>
  );
}
