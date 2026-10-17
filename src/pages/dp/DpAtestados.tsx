import { sugerirPushContextual } from "@/components/dp/PushSoftPrompt";
import { useEffect, useMemo, useRef, useState } from "react";
import { prepararUpload } from "@/lib/storage/uploadPolicy";
import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileWarning, Download, Upload, History, FileText, Trash2, Pencil, FileImage, FileUp } from "lucide-react";
import { FundamentoLegalCard } from "@/components/dp/licencas/FundamentoLegalCard";
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { DocumentPreview } from "@/components/dp/DocumentPreview";
import { DpContentCard, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpFilePicker } from "@/components/dp/DpFilePicker";
import { AnexoFotoPdfPicker } from "@/components/dp/portal/AnexoFotoPdfPicker";
import { DpTableColumnHeader } from "@/components/dp/DpTableColumnHeader";
import { calcularIndicadores, afastadoNoDia, somarDiasIso } from "@/lib/dp/atestadosIndicadores";
import { hojeIsoLocal } from "@/lib/dp/dataLocal";
import { DpTableColumnsMenu } from "@/components/dp/DpTableColumnsMenu";
import { useDpTableColumns } from "@/hooks/useDpTableColumns";
import { RecusaDialog } from "@/components/dp/RecusaDialog";
import type { Database } from "@/integrations/supabase/types";
import {
  DURACAO_PADRAO_DIAS,
  TIPOS_AFASTAMENTO,
  TIPO_AFASTAMENTO_LABEL,
  isTipoLicenca,
  labelAfastamento,
  duracaoPadrao,
  type TipoAfastamento,
} from "@/lib/dp/licencas";
import { resolverPendencias } from "@/lib/dp/pendencias-resolver";
import { corrigirAtestado, excluirSolicitacao } from "@/lib/dp/solicitacoes-admin";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import { notifyError } from "@/lib/notifyError";

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

type AtestColKey = "colaborador" | "tipo" | "unidade" | "data" | "retorno" | "observacoes" | "status" | "detalhes" | "arquivo";
type AtestSortKey = "padrao" | "colaborador" | "tipo" | "unidade" | "data" | "retorno" | "status";

const ATEST_COL_ORDER: AtestColKey[] = ["colaborador", "tipo", "unidade", "data", "retorno", "observacoes", "status", "detalhes", "arquivo"];
const ATEST_COL_WIDTHS: Record<AtestColKey, number> = {
  colaborador: 220, tipo: 160, unidade: 150, data: 110, retorno: 110, observacoes: 190, status: 130, detalhes: 110, arquivo: 110,
};
const ATEST_ACOES_WIDTH = 150;

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

// Soma de dias civis independente do fuso do navegador (Etapa 7.1).
const addDays = somarDiasIso;

export default function DpAtestados() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"importar" | "historico">(
    () => (new URLSearchParams(window.location.search).get("aba") === "historico" ? "historico" : "importar"),
  );
  const [preview, setPreview] = useState<{ title: string; path: string } | null>(null);
  const [recusaId, setRecusaId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [detalhe, setDetalhe] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [motivoExclusao, setMotivoExclusao] = useState<string>("");

  // form
  const fileRef = useRef<HTMLInputElement>(null);
  const [unidadeId, setUnidadeId] = useState<string>("");
  const [colaboradorId, setColaboradorId] = useState<string>(
    () => new URLSearchParams(window.location.search).get("colaborador") ?? "",
  );
  const [tipoDoc, setTipoDoc] = useState<TipoAfastamento>(() => {
    const t = new URLSearchParams(window.location.search).get("tipo");
    return t && (TIPOS_AFASTAMENTO as readonly string[]).includes(t) ? (t as TipoAfastamento) : "atestado";
  });
  const [dataDoc, setDataDoc] = useState<string>("");
  const [dias, setDias] = useState<string>("");
  const [observacao, setObservacao] = useState<string>("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // filtros histórico
  const [fColab, setFColab] = useState<string>(
    () => new URLSearchParams(window.location.search).get("colaborador") ?? "todos",
  );
  const [fStatus, setFStatus] = useState<string>("todos");
  const [fUnidade, setFUnidade] = useState<string>("todos");
  const [fDataInicio, setFDataInicio] = useState<string>("");
  const [fDataFim, setFDataFim] = useState<string>("");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  // edição histórico
  const [editUnidadeId, setEditUnidadeId] = useState<string>("");
  const [editColaboradorId, setEditColaboradorId] = useState<string>("");
  const [editDataDoc, setEditDataDoc] = useState<string>("");
  const [editDias, setEditDias] = useState<string>("");
  const [editObservacao, setEditObservacao] = useState<string>("");

  const colabs = useDpColaboradores();
  const unidades = useDpUnidades();
  useEffect(() => {
    if (!colaboradorId || unidadeId) return;
    const c = (colabs.data ?? []).find((x) => x.id === colaboradorId);
    if (c?.unidade_id) setUnidadeId(c.unidade_id);
  }, [colabs.data, colaboradorId, unidadeId]);

  const list = useQuery({
    queryKey: ["dp_atestados_admin", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      // Leitura em lotes com ordem estável: nenhum atestado some acima de 1.000.
      return await fetchAllPages<Row>((from, to) =>
        supabase
          .from("dp_solicitacoes")
          .select("*, dp_colaboradores(nome, unidade_id)")
          .eq("company_id", selectedCompanyId!)
          .is("removido_em", null)
          .in("tipo", [...TIPOS_AFASTAMENTO])
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to) as any,
      );
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

  /** Configuração das colunas da tabela de histórico (formato planilha). */
  const COLS = useMemo(() => ({
    colaborador: {
      label: "Colaborador", sortKey: "colaborador" as const,
      value: (r: Row) => r.dp_colaboradores?.nome ?? "—",
      render: (r: Row) => (
        <span className="block truncate font-semibold text-foreground" title={r.dp_colaboradores?.nome ?? ""}>{r.dp_colaboradores?.nome ?? "—"}</span>
      ),
    },
    tipo: {
      label: "Tipo", sortKey: "tipo" as const,
      value: (r: Row) => labelAfastamento(r.tipo),
      render: (r: Row) => (
        <Badge
          variant="outline"
          className={`max-w-full truncate ${isTipoLicenca(r.tipo) ? "border-primary/30 bg-primary/10 text-primary" : ""}`}
        >
          {labelAfastamento(r.tipo)}
        </Badge>
      ),
    },
    unidade: {
      label: "Unidade", sortKey: "unidade" as const,
      value: (r: Row) => (r.dp_colaboradores?.unidade_id ? unidadeNameById.get(r.dp_colaboradores.unidade_id) : null) ?? "—",
      render: (r: Row) => {
        const unitName = r.dp_colaboradores?.unidade_id ? unidadeNameById.get(r.dp_colaboradores.unidade_id) : null;
        return <span className="block truncate" title={unitName ?? ""}>{unitName ?? "—"}</span>;
      },
    },
    data: {
      label: "Data", sortKey: "data" as const,
      value: (r: Row) => formatDate(r.data_alvo),
      render: (r: Row) => <span className="whitespace-nowrap">{formatDate(r.data_alvo)}</span>,
    },
    retorno: {
      label: "Data Retorno", sortKey: "retorno" as const,
      value: (r: Row) => formatDate(r.data_fim),
      render: (r: Row) => <span className="whitespace-nowrap">{formatDate(r.data_fim)}</span>,
    },
    observacoes: {
      label: "Observações", sortKey: "padrao" as const,
      value: (r: Row) => r.motivo || "—",
      render: (r: Row) => <span className="block truncate" title={r.motivo || ""}>{r.motivo || "—"}</span>,
    },
    status: {
      label: "Status", sortKey: "status" as const,
      value: (r: Row) => STATUS_BADGE[r.status].label,
      render: (r: Row) => (
        <Badge variant="outline" className={`max-w-full truncate ${STATUS_BADGE[r.status].className}`}>{STATUS_BADGE[r.status].label}</Badge>
      ),
    },
    detalhes: {
      label: "Dias", sortKey: "padrao" as const,
      value: (r: Row) => String(diffDays(r.data_alvo, r.data_fim)),
      render: (r: Row) => <span className="font-semibold tabular-nums">{diffDays(r.data_alvo, r.data_fim)}</span>,
    },
    arquivo: {
      label: "Arquivo", sortKey: "padrao" as const,
      value: (r: Row) => getFileKind(r.arquivo_path).label,
      render: (r: Row) => {
        const fileKind = getFileKind(r.arquivo_path);
        const FileIcon = fileKind.icon;
        return r.arquivo_path ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            onClick={() => setPreview({ title: `Atestado — ${r.dp_colaboradores?.nome ?? ""}`, path: r.arquivo_path! })}
          >
            <FileIcon className="h-4 w-4" />
            {fileKind.label}
          </button>
        ) : "—";
      },
    },
  }), [unidadeNameById]);

  const {
    colOrder, colWidths, resize, resetWidth,
    hidden, toggleHidden, resetLayout, visibleOrder,
    dragCol, setDragCol, soltarSobre,
    colFilters, setColFilters, toggleColValue,
    sortKey, sortDir, aplicarSort,
    larguraTotal,
  } = useDpTableColumns<AtestColKey, AtestSortKey>({
    storageKey: "dp_atestados_col",
    screenKey: "dp_atestados",
    defaultOrder: ATEST_COL_ORDER,
    defaultWidths: ATEST_COL_WIDTHS,
    essentialKeys: ["colaborador"],
    acoesWidth: ATEST_ACOES_WIDTH,
    defaultSortKey: "padrao",
  });

  /** Aplica os filtros por valor de cada coluna sobre os filtros da barra. */
  const filtradoPorColuna = useMemo(() => {
    return filtered.filter((r) =>
      ATEST_COL_ORDER.every((k) => {
        const sel = colFilters[k] ?? [];
        if (!sel.length) return true;
        return sel.includes(COLS[k].value(r));
      }),
    );
  }, [filtered, colFilters, COLS]);

  /** Opções de filtro de uma coluna considerando os filtros das demais. */
  const opcoesColuna = (k: AtestColKey) => {
    const outros = filtered.filter((r) =>
      ATEST_COL_ORDER.every((other) => {
        if (other === k) return true;
        const sel = colFilters[other] ?? [];
        if (!sel.length) return true;
        return sel.includes(COLS[other].value(r));
      }),
    );
    const set = new Set<string>();
    outros.forEach((r) => set.add(COLS[k].value(r)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  };

  /** Ordenação escolhida no cabeçalho; "padrao" mantém a ordem por criação. */
  const linhasFiltradas = useMemo(() => {
    if (sortKey === "padrao") return filtradoPorColuna;
    const arr = [...filtradoPorColuna];
    arr.sort((a, b) => {
      let cmp: number;
      if (sortKey === "data") cmp = (a.data_alvo ?? "").localeCompare(b.data_alvo ?? "");
      else if (sortKey === "retorno") cmp = (a.data_fim ?? "").localeCompare(b.data_fim ?? "");
      else {
        const col = ATEST_COL_ORDER.find((k) => COLS[k].sortKey === sortKey);
        if (!col) return 0;
        cmp = COLS[col].value(a).localeCompare(COLS[col].value(b), "pt-BR", { sensitivity: "base" });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtradoPorColuna, sortKey, sortDir, COLS]);

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
    setEditFile(null);
  }, [editing]);

  // upload
  const doUpload = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (!colaboradorId) throw new Error("Selecione o colaborador");
      if (!dataDoc) throw new Error(`Informe a data de início${isTipoLicenca(tipoDoc) ? " da licença" : " do atestado"}`);
      const d = parseInt(dias || "0", 10);
      if (Number.isNaN(d) || d < 0) throw new Error("Dias de afastamento inválido");
      // Licenças (maternidade/paternidade) dispensam anexo: a certidão pode ser
      // anexada depois. Atestado continua exigindo o arquivo.
      const licenca = isTipoLicenca(tipoDoc);
      if (!pendingFile && !licenca) throw new Error("Anexe o arquivo do atestado");

      let path: string | null = null;
      if (pendingFile) {
        const envio = await prepararUpload(BUCKET, pendingFile);
        path = `${selectedCompanyId}/${licenca ? "licenca" : "atestado"}/${colaboradorId}/${Date.now()}-${sanitizeStorageFilename(envio.name)}`;
        const up = await supabase.storage.from(BUCKET).upload(path, envio, { upsert: false });
        if (up.error) throw up.error;
      }

      const dataFim = d > 0 ? addDays(dataDoc, d) : dataDoc;
      const { error } = await supabase.rpc("dp_solicitacao_criar_admin", {
        p_colaborador: colaboradorId,
        p_tipo: tipoDoc,
        p_data_alvo: dataDoc,
        p_data_fim: dataFim as any,
        p_motivo: (observacao || null) as any,
        p_arquivo_path: path as any,
        // Afastamento registrado pelo gestor já entra aprovado e vale na
        // Operação, mesmo com data de início no passado.
        p_aprovada: true,
      });
      if (error) throw error;
      return licenca;
    },
    onSuccess: (licenca) => {
      toast.success(licenca ? "Licença registrada e já aprovada" : "Atestado registrado e já aprovado");
      setUnidadeId(""); setColaboradorId(""); setTipoDoc("atestado"); setDataDoc(""); setDias(""); setObservacao(""); setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["dp_atestados_admin"] });
      void resolverPendencias(qc, { companyId: selectedCompanyId });
      qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
      setTab("historico");
    },
    onError: (e: any) => notifyError(e, { surface: "Atestados", action: "concluir a ação", fallback: "Erro ao importar" }),
  });

  const respond = useMutation({
    mutationFn: async ({ id, status, resposta }: { id: string; status: Status; resposta?: string }) => {
      const { error } = await supabase.rpc("dp_solicitacao_responder", {
        p_id: id,
        p_status: status as "aprovada" | "recusada",
        p_resposta: (resposta ?? null) as any,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.status === "aprovada" ? "Atestado aprovado" : "Atestado recusado");
      qc.invalidateQueries({ queryKey: ["dp_atestados_admin"] });
      qc.invalidateQueries({ queryKey: ["dp_atestados_pendentes"] });
      void resolverPendencias(qc, { companyId: selectedCompanyId });
      setRecusaId(null);
    },
    onError: (e: any) => notifyError(e, { surface: "Atestados", action: "concluir a ação", fallback: "Erro" }),
  });

  const doDelete = useMutation({
    mutationFn: async (r: Row) => {
      await excluirSolicitacao({ solicitacaoId: r.id, motivo: motivoExclusao });
    },
    onSuccess: () => {
      toast.success("O atestado foi excluído e permanece no histórico");
      setMotivoExclusao("");
      qc.invalidateQueries({ queryKey: ["dp_atestados_admin"] });
      void resolverPendencias(qc, { companyId: selectedCompanyId });
      setToDelete(null);
    },
    onError: (e: any) => notifyError(e, { surface: "Atestados", action: "concluir a ação", fallback: "Erro ao excluir" }),
  });

  const doEdit = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Atestado não selecionado");
      if (!editColaboradorId) throw new Error("Selecione o colaborador");
      if (!editDataDoc) throw new Error("Informe a data do atestado");
      const d = parseInt(editDias || "0", 10);
      if (Number.isNaN(d) || d < 0) throw new Error("Dias de afastamento inválido");
      await corrigirAtestado({
        solicitacaoId: editing.id,
        colaboradorId: editColaboradorId,
        dataInicio: editDataDoc,
        dias: d,
        observacao: editObservacao,
      });
      if (editFile) {
        const arq = await prepararUpload(BUCKET, editFile);
        const path = `${editing.company_id}/${editColaboradorId}/${Date.now()}-${sanitizeStorageFilename(arq.name)}`;
        const up = await supabase.storage.from(BUCKET).upload(path, arq, { contentType: arq.type, upsert: false });
        if (up.error) throw up.error;
        const { error } = await supabase.rpc("dp_solicitacao_anexar_gestor", { p_id: editing.id, p_arquivo_path: path });
        if (error) {
          if (error.message.includes("STATUS_INVALIDO")) throw new Error("Este atestado não aceita troca de anexo (recusado ou cancelado).");
          throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("Atestado atualizado");
      sugerirPushContextual("Ative os avisos para receber na hora os próximos atestados enviados pela equipe.");
      qc.invalidateQueries({ queryKey: ["dp_atestados_admin"] });
      void resolverPendencias(qc, { companyId: selectedCompanyId });
      setEditing(null);
    },
    onError: (e: any) => notifyError(e, { surface: "Atestados", action: "concluir a ação", fallback: "Erro ao atualizar" }),
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
      <Helmet><title>Atestados e Licenças — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={FileWarning}
        title="Atestados e Licenças"
        description="Atestados médicos e licenças legais (maternidade, paternidade, luto, casamento e outras) com comprovante e base legal."
        actions={
          <>
            {pendentesCount > 0 && (
              <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">{pendentesCount} pendente(s)</Badge>
            )}
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="importar"><Upload className="size-4 mr-2" />Cadastrar</TabsTrigger>
          <TabsTrigger value="historico"><History className="size-4 mr-2" />Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="importar" className="mt-4">
          <DpContentCard contentClassName="p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Upload className="size-5 text-primary" />
              <h3 className="text-lg font-semibold">Cadastrar Atestado ou Licença</h3>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <div className="space-y-2">
                <Label htmlFor="unidade-1">Unidade *</Label>
                <Select value={unidadeId} onValueChange={(v) => { setUnidadeId(v); setColaboradorId(""); }}>
                  <SelectTrigger id="unidade-1"><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                  <SelectContent>
                    {(unidades.data ?? []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="colaborador-2">Colaborador *</Label>
                <Select
                  value={colaboradorId}
                  onValueChange={(v) => {
                    setColaboradorId(v);
                    const c = (colabs.data ?? []).find((x) => x.id === v);
                    if (c?.unidade_id) setUnidadeId(c.unidade_id);
                  }}
                >
                  <SelectTrigger id="colaborador-2"><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
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
                <Label htmlFor="tipo-de-afastamento-3">Tipo de afastamento *</Label>
                <Select
                  value={tipoDoc}
                  onValueChange={(v) => {
                    const t = v as TipoAfastamento;
                    setTipoDoc(t);
                    { const d = duracaoPadrao(t); if (d) setDias(String(d)); }
                  }}
                >
                  <SelectTrigger id="tipo-de-afastamento-3"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Saúde</SelectLabel>
                      <SelectItem value="atestado">{TIPO_AFASTAMENTO_LABEL.atestado}</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Licenças legais</SelectLabel>
                      {TIPOS_AFASTAMENTO.filter((t) => t !== "atestado").map((t) => (
                        <SelectItem key={t} value={t}>{TIPO_AFASTAMENTO_LABEL[t]}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {isTipoLicenca(tipoDoc) && (
                  <p className="text-xs text-muted-foreground">
                    Registrada pelo gestor, a licença já entra aprovada e bloqueia escalas e
                    convocações no período — inclusive com início retroativo.
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{isTipoLicenca(tipoDoc) ? "Início da licença *" : "Data do Documento *"}</Label>
                  <Input
                    type="date"
                    value={dataDoc}
                    onChange={(e) => {
                      setDataDoc(e.target.value);
                      { const d = duracaoPadrao(tipoDoc); if (d && !dias) setDias(String(d)); }
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dias-de-afastamento-4">Dias de Afastamento *</Label>
                  <Input id="dias-de-afastamento-4" type="number" min={0} placeholder="Ex: 3" value={dias} onChange={(e) => setDias(e.target.value)} />
                  {duracaoPadrao(tipoDoc) && (
                    <p className="text-[10px] text-muted-foreground">
                      Padrão legal: {duracaoPadrao(tipoDoc)} dia(s) — ajuste se necessário.
                    </p>
                  )}
                </div>
              </div>
              <FundamentoLegalCard tipo={tipoDoc} inicio={dataDoc} fim={dataDoc && Number(dias) > 1 ? sugestaoFimDias(dataDoc, Number(dias)) : dataDoc} />


              {dataDoc && dias && parseInt(dias) > 0 && (
                <div className="rounded-xl bg-muted/30 p-3 text-sm">
                  <span className="font-semibold">Data de retorno:</span>{" "}
                  {dataRetorno}
                </div>
              )}

              <div className="space-y-2">
                <Label>Arquivo (PDF ou Imagem){isTipoLicenca(tipoDoc) ? "" : " *"}</Label>
                <DpFilePicker
                  ref={fileRef}
                  accept="application/pdf,image/*"
                  file={pendingFile}
                  onFileChange={setPendingFile}
                />
                {isTipoLicenca(tipoDoc) && (
                  <p className="text-[10px] text-muted-foreground">
                    Opcional para licenças — a certidão pode ser anexada depois.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes-5">Observações</Label>
                <Textarea id="observacoes-5" rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observações adicionais (opcional)" />
              </div>
            </div>

            <Button
              className="w-full mt-6"
              size="lg"
              disabled={doUpload.isPending}
              onClick={() => doUpload.mutate()}
            >
              <Upload className="size-4 mr-2" />
              {doUpload.isPending ? "Enviando..." : isTipoLicenca(tipoDoc) ? "Registrar Licença" : "Enviar Atestado"}
            </Button>

          </DpContentCard>
        </TabsContent>

        <TabsContent value="historico" className="mt-4 space-y-4">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full md:hidden"
            onClick={() => setFiltrosAbertos((v) => !v)}
          >
            {filtrosAbertos ? "Ocultar filtros" : "Filtros"}
            {[fUnidade, fColab, fStatus].filter((v) => v && v !== "todos").length + (fDataInicio ? 1 : 0) + (fDataFim ? 1 : 0) > 0 &&
              ` (${[fUnidade, fColab, fStatus].filter((v) => v && v !== "todos").length + (fDataInicio ? 1 : 0) + (fDataFim ? 1 : 0)})`}
          </Button>
          <div className={filtrosAbertos ? "" : "hidden md:block"}>
          <DpFilterCard>
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1.5">
                <Label htmlFor="unidade-6" className="text-xs font-medium text-muted-foreground">Unidade</Label>
                <Select value={fUnidade} onValueChange={setFUnidade}>
                  <SelectTrigger id="unidade-6"><SelectValue placeholder="Unidade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    {(unidades.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="colaborador-7" className="text-xs font-medium text-muted-foreground">Colaborador</Label>
                <Select value={fColab} onValueChange={setFColab}>
                  <SelectTrigger id="colaborador-7"><SelectValue placeholder="Colaborador" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {colabsHistorico.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="data-inicio-8" className="text-xs font-medium text-muted-foreground">Data Início</Label>
                <Input id="data-inicio-8" type="date" value={fDataInicio} onChange={(e) => setFDataInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="data-fim-9" className="text-xs font-medium text-muted-foreground">Data Fim</Label>
                <Input id="data-fim-9" type="date" value={fDataFim} onChange={(e) => setFDataFim(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status-10" className="text-xs font-medium text-muted-foreground">Status</Label>
                <Select value={fStatus} onValueChange={setFStatus}>
                  <SelectTrigger id="status-10"><SelectValue placeholder="Status" /></SelectTrigger>
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
          </div>

          {(() => {
            const { foraHoje, retornam, pend } = calcularIndicadores(linhasFiltradas);
            const kpis = [
              { label: "Afastados hoje", valor: foraHoje.length, nomes: foraHoje },
              { label: "Retornam em 7 dias", valor: retornam.length, nomes: retornam },
              { label: "Aguardando análise", valor: pend.length, nomes: pend },
            ];
            return (
              <div className="grid gap-3 sm:grid-cols-3">
                {kpis.map((k) => (
                  <div key={k.label} className="rounded-2xl border border-border bg-card p-4">
                    <div className="text-xs font-medium text-muted-foreground">{k.label}</div>
                    <div className="text-2xl font-bold tabular-nums">{k.valor}</div>
                    {k.nomes.length > 0 && (
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {k.nomes.slice(0, 3).map((r) => r.dp_colaboradores?.nome?.split(" ")[0]).join(", ")}
                        {k.nomes.length > 3 ? ` +${k.nomes.length - 3}` : ""}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="space-y-2">
            {list.isLoading && (
              <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Carregando…</div>
            )}
            {!list.isLoading && linhasFiltradas.length === 0 && (
              <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Nenhum atestado encontrado com os filtros atuais.
              </div>
            )}
            {!list.isLoading && linhasFiltradas.map((r) => {
              const unitName = r.dp_colaboradores?.unidade_id ? unidadeNameById.get(r.dp_colaboradores.unidade_id) : null;
              const afastadoAgora = afastadoNoDia(r, hojeIsoLocal());
              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetalhe(r)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetalhe(r); } }}
                  className="flex min-w-0 cursor-pointer flex-col gap-2 rounded-2xl border border-border bg-card p-3 transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold">{r.dp_colaboradores?.nome ?? "—"}</span>
                      {afastadoAgora && <Badge variant="outline" className="shrink-0 border-primary/30 bg-primary/10 text-primary">Fora hoje</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {labelAfastamento(r.tipo)}{unitName ? ` · ${unitName}` : ""}
                    </div>
                  </div>
                  <div className="text-sm tabular-nums sm:w-56 sm:shrink-0">
                    {formatDate(r.data_alvo)} <span className="text-muted-foreground">→ volta</span> {formatDate(r.data_fim)}
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:shrink-0">
                    <Badge variant="outline" className={STATUS_BADGE[r.status].className}>{STATUS_BADGE[r.status].label}</Badge>
                    {r.arquivo_path ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-9"
                        onClick={(e) => { e.stopPropagation(); setPreview({ title: `Atestado — ${r.dp_colaboradores?.nome ?? ""}`, path: r.arquivo_path! }); }}
                      >
                        <FileText className="mr-1 h-4 w-4" /> Ver
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem arquivo</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Dialog open={!!detalhe} onOpenChange={(v) => !v && setDetalhe(null)}>
            <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="truncate">{detalhe?.dp_colaboradores?.nome ?? "Atestado"}</DialogTitle>
              </DialogHeader>
              {detalhe && (
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{labelAfastamento(detalhe.tipo)}</Badge>
                    <Badge variant="outline" className={STATUS_BADGE[detalhe.status].className}>{STATUS_BADGE[detalhe.status].label}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/30 p-3">
                    <div><div className="text-xs text-muted-foreground">Início</div>{formatDate(detalhe.data_alvo)}</div>
                    <div><div className="text-xs text-muted-foreground">Retorno</div>{formatDate(detalhe.data_fim)}</div>
                    <div className="col-span-2"><div className="text-xs text-muted-foreground">Unidade</div>
                      {detalhe.dp_colaboradores?.unidade_id ? unidadeNameById.get(detalhe.dp_colaboradores.unidade_id) ?? "—" : "—"}
                    </div>
                  </div>
                  {detalhe.motivo && (
                    <div><div className="text-xs text-muted-foreground">Observações</div><p className="whitespace-pre-wrap">{detalhe.motivo}</p></div>
                  )}
                  <div className="text-xs text-muted-foreground">Registrado em {new Date(detalhe.created_at).toLocaleString("pt-BR")}</div>
                </div>
              )}
              <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-between">
                {detalhe && (
                  <>
                    <Button variant="ghost" className="text-destructive" onClick={() => { setToDelete(detalhe); setDetalhe(null); }}>
                      <Trash2 className="mr-1 h-4 w-4" /> Excluir
                    </Button>
                    <div className="flex flex-wrap gap-2">
                      {detalhe.arquivo_path && (
                        <>
                          <Button variant="outline" onClick={() => handleDownload(detalhe)}><Download className="mr-1 h-4 w-4" /> Baixar</Button>
                          <Button variant="outline" onClick={() => setPreview({ title: `Atestado — ${detalhe.dp_colaboradores?.nome ?? ""}`, path: detalhe.arquivo_path! })}>
                            <FileText className="mr-1 h-4 w-4" /> Ver
                          </Button>
                        </>
                      )}
                      <Button onClick={() => { setEditing(detalhe); setDetalhe(null); }}><Pencil className="mr-1 h-4 w-4" /> Editar</Button>
                    </div>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>


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
              <Label htmlFor="unidade-11">Unidade</Label>
              <Select value={editUnidadeId} onValueChange={(v) => { setEditUnidadeId(v); setEditColaboradorId(""); }}>
                <SelectTrigger id="unidade-11"><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                <SelectContent>
                  {(unidades.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="colaborador-12">Colaborador</Label>
              <Select value={editColaboradorId} onValueChange={setEditColaboradorId}>
                <SelectTrigger id="colaborador-12"><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                <SelectContent>
                  {editColabs.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="data-do-documento-13">Data do Documento</Label>
                <Input id="data-do-documento-13" type="date" value={editDataDoc} onChange={(e) => setEditDataDoc(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dias-de-afastamento-14">Dias de Afastamento</Label>
                <Input id="dias-de-afastamento-14" type="number" min={0} value={editDias} onChange={(e) => setEditDias(e.target.value)} />
              </div>
            </div>
            {editDataRetorno && (
              <div className="rounded-xl bg-muted/30 p-3 text-sm">
                <span className="font-semibold">Data de retorno:</span> {editDataRetorno}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="observacoes-15">Observações</Label>
              <Textarea id="observacoes-15" rows={3} value={editObservacao} onChange={(e) => setEditObservacao(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Anexo do atestado</Label>
              {editing?.arquivo_path ? (
                <div className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <span className="min-w-0 truncate text-muted-foreground">Já tem arquivo anexado</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setPreview({ title: `Atestado — ${editing.dp_colaboradores?.nome ?? ""}`, path: editing.arquivo_path! })}>Ver</Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Este atestado ainda não tem arquivo.</p>
              )}
              <AnexoFotoPdfPicker file={editFile} onChange={setEditFile} />
              {editFile && editing?.arquivo_path && (
                <p className="text-xs text-muted-foreground">O novo arquivo vai substituir o anterior ao salvar.</p>
              )}
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
              O atestado sai das listas e continua guardado no histórico, com o arquivo anexo, para conferência futura.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-exclusao-atestado">Motivo da exclusão (opcional)</Label>
            <Textarea
              id="motivo-exclusao-atestado"
              rows={2}
              value={motivoExclusao}
              onChange={(e) => setMotivoExclusao(e.target.value)}
              placeholder="Ex.: atestado lançado em duplicidade."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMotivoExclusao("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && doDelete.mutate(toDelete)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}

function sugestaoFimDias(inicio: string, dias: number) {
  return somarDiasIso(inicio, dias - 1);
}
