import { useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileWarning, Check, X, Eye, Download, Upload, History, FileText, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const STATUS_BADGE: Record<Status, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-500 text-white" },
  aprovada: { label: "Aprovado", className: "bg-primary text-primary-foreground" },
  recusada: { label: "Recusado", className: "bg-destructive text-destructive-foreground" },
  cancelada: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
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
  const [fMes, setFMes] = useState<string>("todos");
  const [fAno, setFAno] = useState<string>("todos");
  const [fStatus, setFStatus] = useState<string>("todos");
  const [fUnidade, setFUnidade] = useState<string>("todos");

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
  const anos = useMemo(() => {
    const s = new Set<number>();
    rows.forEach((r) => r.data_alvo && s.add(Number(r.data_alvo.slice(0, 4))));
    return Array.from(s).sort((a, b) => b - a);
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (fColab !== "todos" && r.colaborador_id !== fColab) return false;
      if (fStatus !== "todos" && r.status !== fStatus) return false;
      if (fUnidade !== "todos" && r.dp_colaboradores?.unidade_id !== fUnidade) return false;
      if (r.data_alvo) {
        const [y, m] = r.data_alvo.split("-");
        if (fAno !== "todos" && y !== fAno) return false;
        if (fMes !== "todos" && Number(m) !== Number(fMes)) return false;
      } else if (fAno !== "todos" || fMes !== "todos") {
        return false;
      }
      return true;
    });
  }, [rows, fColab, fStatus, fUnidade, fMes, fAno]);

  const pendentesCount = rows.filter((r) => r.status === "pendente").length;

  // upload
  const doUpload = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (!colaboradorId) throw new Error("Selecione o colaborador");
      if (!dataDoc) throw new Error("Informe a data do atestado");
      const d = parseInt(dias || "0", 10);
      if (Number.isNaN(d) || d < 0) throw new Error("Dias de afastamento inválido");
      if (!pendingFile) throw new Error("Anexe o arquivo do atestado");

      const path = `${selectedCompanyId}/atestado/${colaboradorId}/${Date.now()}-${pendingFile.name}`;
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
      setColaboradorId(""); setDataDoc(""); setDias(""); setObservacao(""); setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["dp_atestados_admin"] });
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
      setToDelete(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir"),
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

  return (
    <DpPage>
      <Helmet><title>Atestados — DP 360°</title></Helmet>
      <DpPageHeader
        icon={FileWarning}
        title="Atestados"
        description="Gerencie todos os atestados médicos dos colaboradores."
        actions={pendentesCount > 0 ? (
          <Badge className="bg-amber-500 text-white">{pendentesCount} pendente(s)</Badge>
        ) : undefined}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="importar"><Upload className="size-4 mr-2" />Importar</TabsTrigger>
          <TabsTrigger value="historico"><History className="size-4 mr-2" />Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="importar" className="mt-4">
          <DpContentCard>
            <div className="flex items-center gap-2 mb-4">
              <Upload className="size-5 text-primary" />
              <h3 className="text-lg font-semibold">Importar Atestado</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Colaborador *</Label>
                <Select value={colaboradorId} onValueChange={setColaboradorId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                  <SelectContent>
                    {(colabs.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data do Atestado *</Label>
                <Input type="date" value={dataDoc} onChange={(e) => setDataDoc(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Dias de Afastamento *</Label>
                <Input type="number" min={0} placeholder="Ex: 3" value={dias} onChange={(e) => setDias(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data de Retorno</Label>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm h-10 flex items-center">
                  {dataRetorno ?? <span className="text-muted-foreground">Calculado automaticamente</span>}
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Observação</Label>
                <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" />
              </div>
            </div>

            <div
              className={`mt-4 rounded-xl border-2 border-dashed transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border"}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault(); setIsDragging(false);
                const f = e.dataTransfer.files?.[0]; if (f) setPendingFile(f);
              }}
            >
              <label className="flex flex-col items-center justify-center py-14 cursor-pointer text-center">
                <Upload className="size-8 text-muted-foreground mb-3" />
                <div className="font-medium">
                  {pendingFile ? pendingFile.name : "Arraste um PDF/imagem ou clique para selecionar"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">PDF, JPG ou PNG</div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <Button
              className="w-full mt-4"
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Select value={fColab} onValueChange={setFColab}>
                <SelectTrigger><SelectValue placeholder="Colaborador" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os colaboradores</SelectItem>
                  {(colabs.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={fMes} onValueChange={setFMes}>
                <SelectTrigger><SelectValue placeholder="Mês" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os meses</SelectItem>
                  {MESES.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={fAno} onValueChange={setFAno}>
                <SelectTrigger><SelectValue placeholder="Ano" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os anos</SelectItem>
                  {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="aprovada">Aprovado</SelectItem>
                  <SelectItem value="recusada">Recusado</SelectItem>
                </SelectContent>
              </Select>
              <Select value={fUnidade} onValueChange={setFUnidade}>
                <SelectTrigger><SelectValue placeholder="Unidade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as unidades</SelectItem>
                  {(unidades.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </DpFilterCard>

          <DpContentCard contentClassName="overflow-x-auto">
            {list.isLoading ? (
              <TableSkeleton columns={7} headers={["Colaborador", "Data", "Dias", "Retorno", "Arquivo", "Status", "Ações"]} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Dias</TableHead>
                    <TableHead>Retorno</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-40 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const d = diffDays(r.data_alvo, r.data_fim);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.dp_colaboradores?.nome ?? "—"}</TableCell>
                        <TableCell>{r.data_alvo ? new Date(r.data_alvo + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                        <TableCell>{d}</TableCell>
                        <TableCell>{r.data_fim ? new Date(r.data_fim + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {r.arquivo_path ? r.arquivo_path.split("/").pop() : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_BADGE[r.status].className}>{STATUS_BADGE[r.status].label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {r.arquivo_path && (
                              <Button size="icon" variant="ghost" title="Visualizar"
                                onClick={() => setPreview({ title: `Atestado — ${r.dp_colaboradores?.nome ?? ""}`, path: r.arquivo_path! })}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            {r.arquivo_path && (
                              <Button size="icon" variant="ghost" title="Baixar" onClick={() => handleDownload(r)}>
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            {r.status === "pendente" && (
                              <>
                                <Button size="icon" variant="ghost" title="Aprovar"
                                  onClick={() => respond.mutate({ id: r.id, status: "aprovada" })}>
                                  <Check className="h-4 w-4 text-primary" />
                                </Button>
                                <Button size="icon" variant="ghost" title="Recusar" onClick={() => setRecusaId(r.id)}>
                                  <X className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
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
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        Nenhum atestado encontrado com os filtros atuais.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </DpContentCard>
        </TabsContent>
      </Tabs>

      <DocumentPreview
        open={!!preview}
        onOpenChange={(v) => { if (!v) setPreview(null); }}
        title={preview?.title}
        bucket={BUCKET}
        path={preview?.path}
      />

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
