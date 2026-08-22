import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Upload, History, FileText, FileImage, Download, Trash2, Pencil, FileSignature } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFilename } from "@/lib/storage";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { DocumentPreview } from "@/components/dp/DocumentPreview";
import { DpContentCard, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";

const BUCKET = "dp-disciplinar";

const TIPOS = [
  { value: "advertencia_verbal", label: "Advertência verbal" },
  { value: "advertencia_escrita", label: "Advertência escrita" },
  { value: "suspensao", label: "Suspensão" },
  { value: "elogio", label: "Elogio" },
  { value: "observacao", label: "Observação" },
] as const;

const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.value, t.label]));

type Registro = {
  id: string;
  company_id: string;
  colaborador_id: string;
  tipo: string;
  data: string;
  motivo: string;
  descricao: string | null;
  suspensao_dias: number | null;
  pdf_storage_path: string | null;
  created_at: string;
  dp_colaboradores: { nome: string; unidade_id: string | null } | null;
};

const formatDate = (v?: string | null) => v ? new Date(`${v}T00:00:00`).toLocaleDateString("pt-BR") : "—";

const getFileKind = (path?: string | null) => {
  if (!path) return { label: "—", icon: FileText };
  return path.toLowerCase().endsWith(".pdf") ? { label: "PDF", icon: FileText } : { label: "Imagem", icon: FileImage };
};

export default function DpDisciplinar() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();

  const colabs = useDpColaboradores();
  const unidades = useDpUnidades();

  const [tab, setTab] = useState<"importar" | "historico">("importar");
  const [preview, setPreview] = useState<{ title: string; path: string } | null>(null);
  const [toDelete, setToDelete] = useState<Registro | null>(null);
  const [editing, setEditing] = useState<Registro | null>(null);

  // form importar
  const fileRef = useRef<HTMLInputElement>(null);
  const [unidadeId, setUnidadeId] = useState("");
  const [colaboradorId, setColaboradorId] = useState("");
  const [dataDoc, setDataDoc] = useState("");
  const [tipo, setTipo] = useState<string>("");
  const [dias, setDias] = useState<string>("0");
  const [observacao, setObservacao] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // filtros histórico
  const [fUnidade, setFUnidade] = useState("todos");
  const [fColab, setFColab] = useState("todos");
  const [fDataInicio, setFDataInicio] = useState("");
  const [fDataFim, setFDataFim] = useState("");
  const [fTipo, setFTipo] = useState("todos");

  // edição
  const [editUnidadeId, setEditUnidadeId] = useState("");
  const [editColaboradorId, setEditColaboradorId] = useState("");
  const [editData, setEditData] = useState("");
  const [editTipo, setEditTipo] = useState<string>("");
  const [editDias, setEditDias] = useState("0");
  const [editObs, setEditObs] = useState("");

  const list = useQuery({
    queryKey: ["dp_disciplinar", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_registros_disciplinares")
        .select("*, dp_colaboradores(nome, unidade_id)")
        .eq("company_id", selectedCompanyId!)
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Registro[];
    },
  });

  const rows = list.data ?? [];

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (fUnidade !== "todos" && r.dp_colaboradores?.unidade_id !== fUnidade) return false;
      if (fColab !== "todos" && r.colaborador_id !== fColab) return false;
      if (fTipo !== "todos" && r.tipo !== fTipo) return false;
      if (fDataInicio && r.data < fDataInicio) return false;
      if (fDataFim && r.data > fDataFim) return false;
      return true;
    });
  }, [rows, fUnidade, fColab, fTipo, fDataInicio, fDataFim]);

  const colabsHistorico = useMemo(
    () => (colabs.data ?? []).filter((c) => fUnidade === "todos" || c.unidade_id === fUnidade),
    [colabs.data, fUnidade],
  );
  const editColabs = useMemo(
    () => (colabs.data ?? []).filter((c) => !editUnidadeId || c.unidade_id === editUnidadeId),
    [colabs.data, editUnidadeId],
  );
  const unidadeNameById = useMemo(
    () => new Map((unidades.data ?? []).map((u) => [u.id, u.nome])),
    [unidades.data],
  );

  useEffect(() => {
    if (fColab !== "todos" && !colabsHistorico.some((c) => c.id === fColab)) setFColab("todos");
  }, [colabsHistorico, fColab]);

  useEffect(() => {
    if (!editing) return;
    setEditUnidadeId(editing.dp_colaboradores?.unidade_id ?? "");
    setEditColaboradorId(editing.colaborador_id);
    setEditData(editing.data);
    setEditTipo(editing.tipo);
    setEditDias(String(editing.suspensao_dias ?? 0));
    setEditObs(editing.descricao ?? editing.motivo ?? "");
  }, [editing]);

  const doImport = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (!unidadeId) throw new Error("Selecione a unidade");
      if (!colaboradorId) throw new Error("Selecione o colaborador");
      if (!dataDoc) throw new Error("Informe a data do documento");
      if (!tipo) throw new Error("Selecione o tipo de registro");
      if (!pendingFile) throw new Error("Anexe o arquivo do registro");
      const diasN = parseInt(dias || "0", 10);
      if (tipo === "suspensao" && (!Number.isFinite(diasN) || diasN <= 0)) {
        throw new Error("Informe os dias de afastamento para suspensão");
      }

      const { data: inserted, error: insErr } = await supabase
        .from("dp_registros_disciplinares")
        .insert({
          company_id: selectedCompanyId,
          colaborador_id: colaboradorId,
          tipo: tipo as any,
          data: dataDoc,
          motivo: observacao || TIPO_LABEL[tipo] || tipo,
          descricao: observacao || null,
          suspensao_dias: diasN > 0 ? diasN : null,
          aplicado_por: user?.id ?? null,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      const safeName = sanitizeStorageFilename(pendingFile.name);
      const path = `${selectedCompanyId}/${inserted.id}/${Date.now()}-${safeName}`;
      const up = await supabase.storage.from(BUCKET).upload(path, pendingFile, {
        upsert: true,
        contentType: pendingFile.type || "application/pdf",
      });
      if (up.error) throw up.error;
      const { error: updErr } = await supabase
        .from("dp_registros_disciplinares")
        .update({ pdf_storage_path: path })
        .eq("id", inserted.id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      toast.success("Registro importado com sucesso");
      setUnidadeId(""); setColaboradorId(""); setDataDoc(""); setTipo(""); setDias("0"); setObservacao(""); setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["dp_disciplinar"] });
      setTab("historico");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao importar"),
  });

  const doDelete = useMutation({
    mutationFn: async (r: Registro) => {
      if (r.pdf_storage_path) await supabase.storage.from(BUCKET).remove([r.pdf_storage_path]);
      const { error } = await supabase.from("dp_registros_disciplinares").delete().eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro excluído");
      qc.invalidateQueries({ queryKey: ["dp_disciplinar"] });
      setToDelete(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir"),
  });

  const doEdit = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Registro não selecionado");
      if (!editColaboradorId) throw new Error("Selecione o colaborador");
      if (!editData) throw new Error("Informe a data");
      if (!editTipo) throw new Error("Selecione o tipo");
      const diasN = parseInt(editDias || "0", 10);
      const { error } = await supabase.from("dp_registros_disciplinares").update({
        colaborador_id: editColaboradorId,
        data: editData,
        tipo: editTipo as any,
        suspensao_dias: diasN > 0 ? diasN : null,
        descricao: editObs || null,
        motivo: editObs || TIPO_LABEL[editTipo] || editTipo,
      }).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro atualizado");
      qc.invalidateQueries({ queryKey: ["dp_disciplinar"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar"),
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

  const handleDownload = async (r: Registro) => {
    if (!r.pdf_storage_path) return;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(r.pdf_storage_path, 60);
    if (error || !data?.signedUrl) return toast.error("Não foi possível gerar o link");
    const a = document.createElement("a");
    a.href = data.signedUrl; a.rel = "noopener"; a.target = "_blank";
    a.download = r.pdf_storage_path.split("/").pop() || "registro.pdf";
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <DpPage>
      <Helmet><title>Disciplinares — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={ShieldAlert}
        title="Disciplinares"
        description="Gerencie advertências, suspensões e outros registros disciplinares."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="importar"><Upload className="size-4 mr-2" />Cadastrar</TabsTrigger>
          <TabsTrigger value="historico"><History className="size-4 mr-2" />Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="importar" className="mt-4">
          <DpContentCard>
            <div className="flex items-center gap-2 mb-4">
              <Upload className="size-5 text-primary" />
              <h3 className="text-lg font-semibold">Cadastrar Registro Disciplinar</h3>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Unidade *</Label>
                <Select value={unidadeId} onValueChange={(v) => { setUnidadeId(v); setColaboradorId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                  <SelectContent>
                    {(unidades.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Colaborador *</Label>
                <Select
                  value={colaboradorId}
                  onValueChange={(v) => {
                    setColaboradorId(v);
                    const c = (colabs.data ?? []).find((x) => x.id === v);
                    if (c?.unidade_id) setUnidadeId(c.unidade_id);
                  }}
                  disabled={!unidadeId}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                  <SelectContent>
                    {(colabs.data ?? [])
                      .filter((c) => !unidadeId || c.unidade_id === unidadeId)
                      .map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Data do Documento *</Label>
                <Input type="date" value={dataDoc} onChange={(e) => setDataDoc(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Tipo de Registro *</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Dias de Afastamento (se aplicável)</Label>
                <Input type="number" min={0} value={dias} onChange={(e) => setDias(e.target.value)} />
                <p className="text-xs text-muted-foreground">Preencha com 0 se não houver afastamento.</p>
              </div>

              <div className="space-y-2">
                <Label>Arquivo (PDF ou Imagem) *</Label>
                <Input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observações adicionais (opcional)" />
              </div>
            </div>

            <Button
              className="w-full mt-6"
              size="lg"
              disabled={doImport.isPending}
              onClick={() => doImport.mutate()}
            >
              <Upload className="size-4 mr-2" />
              {doImport.isPending ? "Enviando..." : "Cadastrar"}
            </Button>
          </DpContentCard>
        </TabsContent>

        <TabsContent value="historico" className="mt-4 space-y-4">
          <DpFilterCard>
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-foreground">Unidade</Label>
                <Select value={fUnidade} onValueChange={setFUnidade}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    {(unidades.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-foreground">Colaborador</Label>
                <Select value={fColab} onValueChange={setFColab}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {colabsHistorico.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-foreground">Data Início</Label>
                <Input type="date" value={fDataInicio} onChange={(e) => setFDataInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-foreground">Data Fim</Label>
                <Input type="date" value={fDataFim} onChange={(e) => setFDataFim(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-foreground">Tipo</Label>
                <Select value={fTipo} onValueChange={setFTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DpFilterCard>

          <DpContentCard contentClassName="hidden md:block">
            {list.isLoading ? (
              <TableSkeleton columns={8} headers={["Colaborador", "Unidade", "Data", "Tipo", "Dias", "Observações", "Arquivo", "Ações"]} />
            ) : filtered.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Nenhum documento encontrado.
              </div>
            ) : (
              <Table className="w-full table-fixed text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 w-[22%]">Colaborador</TableHead>
                    <TableHead className="px-3 w-[12%]">Unidade</TableHead>
                    <TableHead className="px-3 w-[9%]">Data</TableHead>
                    <TableHead className="px-3 w-[13%]">Tipo</TableHead>
                    <TableHead className="px-3 w-[6%]">Dias</TableHead>
                    <TableHead className="px-3 w-[20%]">Observações</TableHead>
                    <TableHead className="px-3 w-[9%]">Arquivo</TableHead>
                    <TableHead className="px-3 text-right w-[9%]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const unitName = r.dp_colaboradores?.unidade_id ? unidadeNameById.get(r.dp_colaboradores.unidade_id) : null;
                    const fileKind = getFileKind(r.pdf_storage_path);
                    const FileIcon = fileKind.icon;
                    return (
                      <TableRow key={r.id} className="align-middle">
                        <TableCell className="truncate px-3 font-bold uppercase text-foreground" title={r.dp_colaboradores?.nome ?? ""}>{r.dp_colaboradores?.nome ?? "—"}</TableCell>
                        <TableCell className="truncate px-3" title={unitName ?? ""}>{unitName ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap px-3">{formatDate(r.data)}</TableCell>
                        <TableCell className="px-3">
                          <Badge variant="outline" className="max-w-full truncate">{TIPO_LABEL[r.tipo] ?? r.tipo}</Badge>
                        </TableCell>
                        <TableCell className="px-3">{r.suspensao_dias ?? "—"}</TableCell>
                        <TableCell className="truncate px-3" title={r.descricao || r.motivo || ""}>{r.descricao || r.motivo || "—"}</TableCell>
                        <TableCell className="px-3 truncate">
                          {r.pdf_storage_path ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                              onClick={() => setPreview({ title: `Registro — ${r.dp_colaboradores?.nome ?? ""}`, path: r.pdf_storage_path! })}
                            >
                              <FileIcon className="h-4 w-4" />
                              {fileKind.label}
                            </button>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="px-3 text-right">
                          <div className="flex gap-1 justify-end">
                            <Button size="icon" variant="ghost" title="Editar" onClick={() => setEditing(r)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {!r.pdf_storage_path && (
                              <Button size="icon" variant="ghost" title="Gerar PDF" disabled={genPdf.isPending} onClick={() => genPdf.mutate(r.id)}>
                                <FileSignature className="h-4 w-4" />
                              </Button>
                            )}
                            {r.pdf_storage_path && (
                              <Button size="icon" variant="ghost" title="Baixar" onClick={() => handleDownload(r)}>
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" title="Excluir" onClick={() => setToDelete(r)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </DpContentCard>

          {/* Mobile: lista de cards */}
          <div className="md:hidden space-y-3">
            {list.isLoading && (
              <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Carregando…</div>
            )}
            {!list.isLoading && filtered.length === 0 && (
              <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Nenhum documento encontrado.
              </div>
            )}
            {!list.isLoading && filtered.map((r) => {
              const unitName = r.dp_colaboradores?.unidade_id ? unidadeNameById.get(r.dp_colaboradores.unidade_id) : null;
              const fileKind = getFileKind(r.pdf_storage_path);
              const FileIcon = fileKind.icon;
              return (
                <div key={r.id} className="rounded-2xl border border-border bg-card p-4 space-y-2 active:scale-[0.98] transition-transform">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold uppercase truncate">{r.dp_colaboradores?.nome ?? "—"}</div>
                      {unitName && <div className="text-[11px] text-muted-foreground truncate">{unitName}</div>}
                    </div>
                    <Badge variant="outline" className="shrink-0">{TIPO_LABEL[r.tipo] ?? r.tipo}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-border/60">
                    <div><span className="text-muted-foreground">Data:</span> {formatDate(r.data)}</div>
                    {r.suspensao_dias != null && <div><span className="text-muted-foreground">Dias:</span> {r.suspensao_dias}</div>}
                    {r.pdf_storage_path && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-primary hover:underline text-left col-span-2"
                        onClick={() => setPreview({ title: `Registro — ${r.dp_colaboradores?.nome ?? ""}`, path: r.pdf_storage_path! })}
                      >
                        <FileIcon className="h-3 w-3" /> {fileKind.label}
                      </button>
                    )}
                  </div>
                  {(r.descricao || r.motivo) && (
                    <div className="text-xs text-muted-foreground line-clamp-2">{r.descricao || r.motivo}</div>
                  )}
                  <div className="flex gap-1 pt-1 border-t border-border/60 flex-wrap">
                    <Button size="sm" variant="ghost" className="min-h-11 flex-1" onClick={() => setEditing(r)}>
                      <Pencil className="h-4 w-4 mr-1" /> Editar
                    </Button>
                    {!r.pdf_storage_path && (
                      <Button size="sm" variant="ghost" className="min-h-11 flex-1" disabled={genPdf.isPending} onClick={() => genPdf.mutate(r.id)}>
                        <FileSignature className="h-4 w-4 mr-1" /> PDF
                      </Button>
                    )}
                    {r.pdf_storage_path && (
                      <Button size="sm" variant="ghost" className="min-h-11 flex-1" onClick={() => handleDownload(r)}>
                        <Download className="h-4 w-4 mr-1" /> Baixar
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="min-h-11 min-w-11" onClick={() => setToDelete(r)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

        </TabsContent>
      </Tabs>

      <DocumentPreview
        open={!!preview}
        onOpenChange={(v) => { if (!v) setPreview(null); }}
        title={preview?.title}
        bucket={BUCKET}
        path={preview?.path}
      />

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar registro disciplinar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select value={editUnidadeId} onValueChange={(v) => { setEditUnidadeId(v); setEditColaboradorId(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                <SelectContent>
                  {(unidades.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Colaborador</Label>
              <Select value={editColaboradorId} onValueChange={setEditColaboradorId}>
                <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                <SelectContent>
                  {editColabs.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={editData} onChange={(e) => setEditData(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Dias</Label>
                <Input type="number" min={0} value={editDias} onChange={(e) => setEditDias(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={editTipo} onValueChange={setEditTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea rows={3} value={editObs} onChange={(e) => setEditObs(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => doEdit.mutate()} disabled={doEdit.isPending}>
              {doEdit.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro e o arquivo anexado (se houver) serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => toDelete && doDelete.mutate(toDelete)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}
