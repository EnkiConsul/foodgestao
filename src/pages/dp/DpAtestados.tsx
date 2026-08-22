import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileWarning, Download, Upload, History, FileText, Trash2, Pencil, FileImage, FileUp } from "lucide-react";
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
import { RecusaDialog } from "@/components/dp/RecusaDialog";
import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["dp_solicitacao_status"];
type Row = Database["public"]["Tables"]["dp_solicitacoes"]["Row"] & {
  dp_colaboradores: { nome: string; unidade_id: string | null } | null;
};

const BUCKET = "dp-documentos";
const STATUS_BADGE: Record<Status, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "border-border bg-muted text-muted-foreground" },
  aprovada: { label: "Aprovado", className: "border-success/30 bg-success/10 text-success" },
  recusada: { label: "Recusado", className: "bg-destructive text-destructive-foreground" },
  cancelada: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
};

const formatDate = (value?: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR") : "—";

const getFileKind = (path?: string | null) => {
  if (!path) return { label: "—", icon: FileText };
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return { label: "PDF", icon: FileText };
  return { label: "Imagem", icon: FileImage };
};

function diffDays(start?: string | null, end?: string | null) {
  if (!start || !end) return 0;
  const a = new Date(start + "T00:00:00");
  const b = new Date(end + "T00:00:00");
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function DpAtestados() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"importar" | "historico">("importar");
  const [preview, setPreview] = useState<{ title: string; path: string } | null>(null);
  const [recusaId, setRecusaId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);

  // form
  const fileRef = useRef<HTMLInputElement>(null);
  const [unidadeId, setUnidadeId] = useState<string>("");
  const [colaboradorId, setColaboradorId] = useState<string>("");
  const [dataDoc, setDataDoc] = useState<string>("");
  const [dias, setDias] = useState<string>("");
  const [observacao, setObservacao] = useState<string>("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // filtros histórico
  const [fColab, setFColab] = useState<string>("todos");
  const [fStatus, setFStatus] = useState<string>("todos");
  const [fUnidade, setFUnidade] = useState<string>("todos");
  const [fDataInicio, setFDataInicio] = useState<string>("");
  const [fDataFim, setFDataFim] = useState<string>("");

  // edição histórico
  const [editUnidadeId, setEditUnidadeId] = useState<string>("");
  const [editColaboradorId, setEditColaboradorId] = useState<string>("");
  const [editDataDoc, setEditDataDoc] = useState<string>("");
  const [editDias, setEditDias] = useState<string>("");
  const [editObservacao, setEditObservacao] = useState<string>("");

  const colabs = useDpColaboradores();
  const unidades = useDpUnidades();

  const list = useQuery({
    queryKey: ["dp_atestados_admin", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_solicitacoes")
        .select("*, dp_colaboradores(nome, unidade_id)")
        .eq("company_id", selectedCompanyId!)
        .eq("tipo", "atestado")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = list.data ?? [];

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (fColab !== "todos" && r.colaborador_id !== fColab) return false;
      if (fStatus !== "todos" && r.status !== fStatus) return false;
      if (fUnidade !== "todos" && r.dp_colaboradores?.unidade_id !== fUnidade) return false;
      if (fDataInicio && (!r.data_alvo || r.data_alvo < fDataInicio)) return false;
      if (fDataFim && (!r.data_alvo || r.data_alvo > fDataFim)) return false;
      return true;
    });
  }, [rows, fColab, fStatus, fUnidade, fDataInicio, fDataFim]);

  const pendentesCount = rows.filter((r) => r.status === "pendente").length;
  const colabsHistorico = useMemo(() => {
    return (colabs.data ?? []).filter((c) => fUnidade === "todos" || c.unidade_id === fUnidade);
  }, [colabs.data, fUnidade]);
  const editColabs = useMemo(() => {
    return (colabs.data ?? []).filter((c) => !editUnidadeId || c.unidade_id === editUnidadeId);
  }, [colabs.data, editUnidadeId]);
  const unidadeNameById = useMemo(() => {
    return new Map((unidades.data ?? []).map((u) => [u.id, u.nome]));
  }, [unidades.data]);

  useEffect(() => {
    if (fColab !== "todos" && !colabsHistorico.some((c) => c.id === fColab)) setFColab("todos");
  }, [colabsHistorico, fColab]);

  useEffect(() => {
    if (!editing) return;
    setEditUnidadeId(editing.dp_colaboradores?.unidade_id ?? "");
    setEditColaboradorId(editing.colaborador_id ?? "");
    setEditDataDoc(editing.data_alvo ?? "");
    setEditDias(String(diffDays(editing.data_alvo, editing.data_fim) || 1));
    setEditObservacao(editing.motivo ?? "");
  }, [editing]);

  // upload
  const doUpload = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (!colaboradorId) throw new Error("Selecione o colaborador");
      if (!dataDoc) throw new Error("Informe a data do atestado");
      const d = parseInt(dias || "0", 10);
      if (Number.isNaN(d) || d < 0) throw new Error("Dias de afastamento inválido");
      if (!pendingFile) throw new Error("Anexe o arquivo do atestado");

      const path = `${selectedCompanyId}/atestado/${colaboradorId}/${Date.now()}-${sanitizeStorageFilename(pendingFile.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, pendingFile, { upsert: false });
      if (up.error) throw up.error;

      const dataFim = d > 0 ? addDays(dataDoc, d) : dataDoc;
      const { error } = await supabase.from("dp_solicitacoes").insert({
        company_id: selectedCompanyId,
        colaborador_id: colaboradorId,
        tipo: "atestado",
        status: "pendente",
        data_alvo: dataDoc,
        data_fim: dataFim,
        motivo: observacao || null,
        arquivo_path: path,
        criado_por: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atestado importado com sucesso");
      setUnidadeId(""); setColaboradorId(""); setDataDoc(""); setDias(""); setObservacao(""); setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["dp_atestados_admin"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
      setTab("historico");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao importar"),
  });

  const respond = useMutation({
    mutationFn: async ({ id, status, resposta }: { id: string; status: Status; resposta?: string }) => {
      const { error } = await supabase.from("dp_solicitacoes").update({
        status,
        respondido_por: user?.id,
        respondido_em: new Date().toISOString(),
        resposta_admin: resposta ?? null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.status === "aprovada" ? "Atestado aprovado" : "Atestado recusado");
      qc.invalidateQueries({ queryKey: ["dp_atestados_admin"] });
      qc.invalidateQueries({ queryKey: ["dp_atestados_pendentes"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
      setRecusaId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const doDelete = useMutation({
    mutationFn: async (r: Row) => {
      if (r.arquivo_path) await supabase.storage.from(BUCKET).remove([r.arquivo_path]);
      const { error } = await supabase.from("dp_solicitacoes").delete().eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atestado excluído");
      qc.invalidateQueries({ queryKey: ["dp_atestados_admin"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
      setToDelete(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir"),
  });

  const doEdit = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Atestado não selecionado");
      if (!editColaboradorId) throw new Error("Selecione o colaborador");
      if (!editDataDoc) throw new Error("Informe a data do atestado");
      const d = parseInt(editDias || "0", 10);
      if (Number.isNaN(d) || d < 0) throw new Error("Dias de afastamento inválido");
      const { error } = await supabase.from("dp_solicitacoes").update({
        colaborador_id: editColaboradorId,
        data_alvo: editDataDoc,
        data_fim: d > 0 ? addDays(editDataDoc, d) : editDataDoc,
        motivo: editObservacao || null,
      }).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atestado atualizado");
      qc.invalidateQueries({ queryKey: ["dp_atestados_admin"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar"),
  });

  const handleDownload = async (r: Row) => {
    if (!r.arquivo_path) return;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(r.arquivo_path, 60);
    if (error || !data?.signedUrl) return toast.error("Não foi possível gerar o link");
    const a = document.createElement("a");
    a.href = data.signedUrl; a.rel = "noopener"; a.target = "_blank";
    a.download = r.arquivo_path.split("/").pop() || "atestado.pdf";
    document.body.appendChild(a); a.click(); a.remove();
  };

  const dataRetorno = dataDoc && dias && parseInt(dias, 10) > 0
    ? new Date(addDays(dataDoc, parseInt(dias, 10)) + "T00:00:00").toLocaleDateString("pt-BR")
    : null;
  const editDataRetorno = editDataDoc && editDias && parseInt(editDias, 10) > 0
    ? new Date(addDays(editDataDoc, parseInt(editDias, 10)) + "T00:00:00").toLocaleDateString("pt-BR")
    : null;

  return (
    <DpPage>
      <Helmet><title>Atestados — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={FileWarning}
        title="Atestados"
        description="Gerencie todos os atestados médicos dos colaboradores."
        actions={pendentesCount > 0 ? (
          <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">{pendentesCount} pendente(s)</Badge>
        ) : undefined}
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
              <h3 className="text-lg font-semibold">Cadastrar Atestado</h3>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Unidade *</Label>
                <Select value={unidadeId} onValueChange={(v) => { setUnidadeId(v); setColaboradorId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                  <SelectContent>
                    {(unidades.data ?? []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                    ))}
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
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Data do Documento *</Label>
                <Input type="date" value={dataDoc} onChange={(e) => setDataDoc(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Dias de Afastamento *</Label>
                <Input type="number" min={0} placeholder="Ex: 3" value={dias} onChange={(e) => setDias(e.target.value)} />
              </div>

              {dataDoc && dias && parseInt(dias) > 0 && (
                <div className="rounded-xl bg-muted/30 p-3 text-sm">
                  <span className="font-semibold">Data de retorno:</span>{" "}
                  {dataRetorno}
                </div>
              )}

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
              disabled={doUpload.isPending}
              onClick={() => doUpload.mutate()}
            >
              <Upload className="size-4 mr-2" />
              {doUpload.isPending ? "Enviando..." : "Enviar Atestado"}
            </Button>

          </DpContentCard>
        </TabsContent>

        <TabsContent value="historico" className="mt-4 space-y-4">
          <DpFilterCard>
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-foreground">Unidade</Label>
                <Select value={fUnidade} onValueChange={setFUnidade}>
                  <SelectTrigger><SelectValue placeholder="Unidade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    {(unidades.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-foreground">Colaborador</Label>
                <Select value={fColab} onValueChange={setFColab}>
                  <SelectTrigger><SelectValue placeholder="Colaborador" /></SelectTrigger>
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
                <Label className="text-xs font-bold uppercase text-foreground">Status</Label>
                <Select value={fStatus} onValueChange={setFStatus}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="aprovada">Aprovado</SelectItem>
                    <SelectItem value="recusada">Recusado</SelectItem>
                    <SelectItem value="cancelada">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DpFilterCard>

          <DpContentCard contentClassName="hidden md:block">
            {list.isLoading ? (
              <TableSkeleton columns={9} headers={["Colaborador", "Unidade", "Data", "Data Retorno", "Observações", "Status", "Detalhes", "Arquivo", "Ações"]} />
            ) : (
              <Table className="w-full table-fixed text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 w-[20%]">Colaborador</TableHead>
                    <TableHead className="px-3 w-[11%]">Unidade</TableHead>
                    <TableHead className="px-3 w-[9%]">Data</TableHead>
                    <TableHead className="px-3 w-[9%]">Data Retorno</TableHead>
                    <TableHead className="px-3 w-[12%]">Observações</TableHead>
                    <TableHead className="px-3 w-[10%]">Status</TableHead>
                    <TableHead className="px-3 w-[11%]">Detalhes</TableHead>
                    <TableHead className="px-3 w-[8%]">Arquivo</TableHead>
                    <TableHead className="px-3 text-right w-[10%]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const d = diffDays(r.data_alvo, r.data_fim);
                    const unitName = r.dp_colaboradores?.unidade_id ? unidadeNameById.get(r.dp_colaboradores.unidade_id) : null;
                    const fileKind = getFileKind(r.arquivo_path);
                    const FileIcon = fileKind.icon;
                    return (
                      <TableRow key={r.id} className="align-middle">
                        <TableCell className="truncate px-3 font-bold uppercase text-foreground" title={r.dp_colaboradores?.nome ?? ""}>{r.dp_colaboradores?.nome ?? "—"}</TableCell>
                        <TableCell className="truncate px-3 text-foreground" title={unitName ?? ""}>{unitName ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap px-3">{formatDate(r.data_alvo)}</TableCell>
                        <TableCell className="whitespace-nowrap px-3">{formatDate(r.data_fim)}</TableCell>
                        <TableCell className="truncate px-3" title={r.motivo || ""}>{r.motivo || "—"}</TableCell>
                        <TableCell className="px-3">
                          <Badge variant="outline" className={`max-w-full truncate ${STATUS_BADGE[r.status].className}`}>{STATUS_BADGE[r.status].label}</Badge>
                        </TableCell>
                        <TableCell className="px-3 font-semibold">
                          <div>Dias: {d}</div>
                          <div>Retorno:</div>
                          <div className="font-normal">{formatDate(r.data_fim)}</div>
                        </TableCell>
                        <TableCell className="px-3 truncate">
                          {r.arquivo_path ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                              onClick={() => setPreview({ title: `Atestado — ${r.dp_colaboradores?.nome ?? ""}`, path: r.arquivo_path! })}
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
                            {r.arquivo_path && (
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
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        Nenhum atestado encontrado com os filtros atuais.
                      </TableCell>
                    </TableRow>
                  )}
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
                Nenhum atestado encontrado.
              </div>
            )}
            {!list.isLoading && filtered.map((r) => {
              const d = diffDays(r.data_alvo, r.data_fim);
              const unitName = r.dp_colaboradores?.unidade_id ? unidadeNameById.get(r.dp_colaboradores.unidade_id) : null;
              const fileKind = getFileKind(r.arquivo_path);
              const FileIcon = fileKind.icon;
              return (
                <div key={r.id} className="rounded-2xl border border-border bg-card p-4 space-y-2 active:scale-[0.98] transition-transform">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold uppercase truncate">{r.dp_colaboradores?.nome ?? "—"}</div>
                      {unitName && <div className="text-[11px] text-muted-foreground truncate">{unitName}</div>}
                    </div>
                    <Badge variant="outline" className={STATUS_BADGE[r.status].className + " shrink-0"}>{STATUS_BADGE[r.status].label}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-border/60">
                    <div><span className="text-muted-foreground">Data:</span> {formatDate(r.data_alvo)}</div>
                    <div><span className="text-muted-foreground">Retorno:</span> {formatDate(r.data_fim)}</div>
                    <div><span className="text-muted-foreground">Dias:</span> {d}</div>
                    {r.arquivo_path && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-primary hover:underline text-left"
                        onClick={() => setPreview({ title: `Atestado — ${r.dp_colaboradores?.nome ?? ""}`, path: r.arquivo_path! })}
                      >
                        <FileIcon className="h-3 w-3" /> {fileKind.label}
                      </button>
                    )}
                  </div>
                  {r.motivo && <div className="text-xs text-muted-foreground line-clamp-2">{r.motivo}</div>}
                  <div className="flex gap-1 pt-1 border-t border-border/60">
                    <Button size="sm" variant="ghost" className="min-h-11 flex-1" onClick={() => setEditing(r)}>
                      <Pencil className="h-4 w-4 mr-1" /> Editar
                    </Button>
                    {r.arquivo_path && (
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
            <DialogTitle>Editar atestado</DialogTitle>
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
                <Label>Data do Documento</Label>
                <Input type="date" value={editDataDoc} onChange={(e) => setEditDataDoc(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Dias de Afastamento</Label>
                <Input type="number" min={0} value={editDias} onChange={(e) => setEditDias(e.target.value)} />
              </div>
            </div>
            {editDataRetorno && (
              <div className="rounded-xl bg-muted/30 p-3 text-sm">
                <span className="font-semibold">Data de retorno:</span> {editDataRetorno}
              </div>
            )}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea rows={3} value={editObservacao} onChange={(e) => setEditObservacao(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => doEdit.mutate()} disabled={doEdit.isPending}>
              <FileUp className="mr-2 h-4 w-4" />
              {doEdit.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecusaDialog
        open={!!recusaId}
        onOpenChange={(v) => !v && setRecusaId(null)}
        title="Recusar atestado"
        loading={respond.isPending}
        onConfirm={(motivo) => recusaId && respond.mutate({ id: recusaId, status: "recusada", resposta: motivo || undefined })}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir atestado?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá o registro e o arquivo anexo permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && doDelete.mutate(toDelete)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}
