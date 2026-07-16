import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, ArrowLeft, FileText, Upload } from "lucide-react";
import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useDpSindicatos } from "@/hooks/useDpCadastros";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { DpContentCard, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import type { Database } from "@/integrations/supabase/types";

type Negociacao = Database["public"]["Tables"]["dp_sindicato_negociacoes"]["Row"];

type FormState = {
  id?: string;
  sindicato_id: string;
  data_base: string;
  reajuste_pct: string;
  vigencia_inicio: string;
  vigencia_fim: string;
  clausulas: string;
  observacoes: string;
};

const emptyForm: FormState = {
  sindicato_id: "",
  data_base: "",
  reajuste_pct: "",
  vigencia_inicio: "",
  vigencia_fim: "",
  clausulas: "",
  observacoes: "",
};

export default function DpSindicatoNegociacoes() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const sindicatos = useDpSindicatos();
  const [sindicatoFilter, setSindicatoFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "vigente" | "expirado">("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toDelete, setToDelete] = useState<Negociacao | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["dp_sindicato_negociacoes", selectedCompanyId, sindicatoFilter],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_sindicato_negociacoes")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("data_base", { ascending: false });
      if (sindicatoFilter !== "all") q = q.eq("sindicato_id", sindicatoFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Negociacao[];
    },
  });

  const sindicatoMap = useMemo(() => {
    const m = new Map<string, string>();
    (sindicatos.data ?? []).forEach((s) => m.set(s.id, s.nome));
    return m;
  }, [sindicatos.data]);

  const upsert = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (!form.sindicato_id) throw new Error("Selecione um sindicato");
      if (!form.data_base) throw new Error("Data-base é obrigatória");
      if (!form.vigencia_inicio) throw new Error("Início da vigência é obrigatório");

      let clausulasJson: unknown = [];
      if (form.clausulas.trim()) {
        try { clausulasJson = JSON.parse(form.clausulas); }
        catch { clausulasJson = form.clausulas.split("\n").filter(Boolean).map((t) => ({ texto: t })); }
      }

      const payload = {
        company_id: selectedCompanyId,
        sindicato_id: form.sindicato_id,
        data_base: form.data_base,
        reajuste_pct: form.reajuste_pct ? Number(form.reajuste_pct) : null,
        vigencia_inicio: form.vigencia_inicio,
        vigencia_fim: form.vigencia_fim || null,
        clausulas: clausulasJson as never,
        observacoes: form.observacoes.trim() || null,
      };

      if (form.id) {
        const { error } = await supabase.from("dp_sindicato_negociacoes").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_sindicato_negociacoes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Negociação atualizada" : "Negociação criada");
      qc.invalidateQueries({ queryKey: ["dp_sindicato_negociacoes"] });
      setOpen(false);
    },
    onError: (e) => toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : String(e) }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_sindicato_negociacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Negociação removida");
      qc.invalidateQueries({ queryKey: ["dp_sindicato_negociacoes"] });
    },
    onError: (e) => toast.error("Erro ao remover", { description: e instanceof Error ? e.message : String(e) }),
  });

  const uploadPdf = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const path = `${selectedCompanyId}/sindicato-negociacoes/${id}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("dp-documentos")
        .upload(path, file, { upsert: true, contentType: file.type || "application/pdf" });
      if (upErr) throw upErr;
      const { error: updErr } = await supabase.from("dp_sindicato_negociacoes").update({ pdf_path: path }).eq("id", id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      toast.success("PDF anexado");
      qc.invalidateQueries({ queryKey: ["dp_sindicato_negociacoes"] });
    },
    onError: (e) => toast.error("Erro ao anexar PDF", { description: e instanceof Error ? e.message : String(e) }),
  });

  const openPdf = async (path: string) => {
    const { data, error } = await supabase.storage.from("dp-documentos").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

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

  const openNew = () => {
    setForm({ ...emptyForm, sindicato_id: sindicatoFilter !== "all" ? sindicatoFilter : "" });
    setOpen(true);
  };

  const openEdit = (n: Negociacao) => {
    setForm({
      id: n.id,
      sindicato_id: n.sindicato_id,
      data_base: n.data_base,
      reajuste_pct: n.reajuste_pct != null ? String(n.reajuste_pct) : "",
      vigencia_inicio: n.vigencia_inicio,
      vigencia_fim: n.vigencia_fim ?? "",
      clausulas: n.clausulas ? JSON.stringify(n.clausulas, null, 2) : "",
      observacoes: n.observacoes ?? "",
    });
    setOpen(true);
  };

  const isVigente = (n: Negociacao) => {
    const hoje = new Date().toISOString().slice(0, 10);
    return n.vigencia_inicio <= hoje && (!n.vigencia_fim || n.vigencia_fim >= hoje);
  };

  const filtered = useMemo(() => {
    const all = list.data ?? [];
    if (statusFilter === "all") return all;
    return all.filter((n) => (statusFilter === "vigente") === isVigente(n));
  }, [list.data, statusFilter]);

  return (
    <DpPage>
      <Helmet><title>Negociações sindicais — DP 360°</title></Helmet>
      <input
        ref={uploadRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <DpPageHeader
        icon={FileText}
        title="Negociações sindicais"
        description={`${filtered.length} de ${list.data?.length ?? 0} acordo(s)`}
        actions={<Button onClick={openNew} disabled={(sindicatos.data ?? []).length === 0}>
            <Plus className="h-4 w-4 mr-2" /> Nova negociação
          </Button>}
      />

      <DpFilterCard>
        <div className="grid gap-2 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">SINDICATO</Label>
          <Select value={sindicatoFilter} onValueChange={setSindicatoFilter}>
            <SelectTrigger><SelectValue placeholder="Todos os sindicatos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os sindicatos</SelectItem>
              {(sindicatos.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">STATUS</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="vigente">Vigentes</SelectItem>
                <SelectItem value="expirado">Expirados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </DpFilterCard>


      <DpContentCard contentClassName="overflow-x-auto">
          {list.isLoading ? (
            <TableSkeleton columns={6} headers={["Sindicato", "Data-base", "Reajuste", "Vigência", "Status", ""]} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sindicato</TableHead>
                  <TableHead>Data-base</TableHead>
                  <TableHead>Reajuste</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{sindicatoMap.get(n.sindicato_id) ?? "—"}</TableCell>
                    <TableCell>{new Date(n.data_base).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{n.reajuste_pct != null ? `${n.reajuste_pct}%` : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(n.vigencia_inicio).toLocaleDateString("pt-BR")}
                      {" → "}
                      {n.vigencia_fim ? new Date(n.vigencia_fim).toLocaleDateString("pt-BR") : "indeterminado"}
                    </TableCell>
                    <TableCell>
                      {isVigente(n)
                        ? <Badge className="bg-primary">Vigente</Badge>
                        : <Badge variant="outline">Expirado</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        {n.pdf_path && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Abrir PDF anexado"
                            onClick={() => openPdf(n.pdf_path!)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          title={n.pdf_path ? "Substituir PDF" : "Anexar PDF"}
                          onClick={() => triggerUpload(n.id)}
                          disabled={uploadPdf.isPending}
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(n)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setToDelete(n)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {(list.data ?? []).length === 0 ? "Nenhuma negociação registrada." : "Nenhuma negociação para os filtros atuais."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
      </DpContentCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar negociação" : "Nova negociação"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Sindicato *</Label>
              <Select value={form.sindicato_id} onValueChange={(v) => setForm({ ...form, sindicato_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {(sindicatos.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Data-base *</Label>
                <Input type="date" value={form.data_base} onChange={(e) => setForm({ ...form, data_base: e.target.value })} />
              </div>
              <div>
                <Label>Reajuste (%)</Label>
                <Input type="number" step="0.001" value={form.reajuste_pct} onChange={(e) => setForm({ ...form, reajuste_pct: e.target.value })} />
              </div>
              <div />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vigência início *</Label>
                <Input type="date" value={form.vigencia_inicio} onChange={(e) => setForm({ ...form, vigencia_inicio: e.target.value })} />
              </div>
              <div>
                <Label>Vigência fim</Label>
                <Input type="date" value={form.vigencia_fim} onChange={(e) => setForm({ ...form, vigencia_fim: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Cláusulas <span className="text-xs text-muted-foreground">(uma por linha, ou JSON)</span></Label>
              <Textarea rows={5} value={form.clausulas} onChange={(e) => setForm({ ...form, clausulas: e.target.value })} placeholder={"Piso salarial R$ 1.800\nVale-refeição R$ 25/dia"} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => upsert.mutate()} disabled={upsert.isPending}>
              {upsert.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta negociação?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (toDelete) { del.mutate(toDelete.id); setToDelete(null); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}
