import { useEffect, useMemo, useRef, useState } from "react";
import { prepararUpload } from "@/lib/storage/uploadPolicy";
import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Upload, History, FileText, FileImage, Download, Trash2, Pencil, FileSignature, AlertTriangle, FileCheck2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import {
  registrarDisciplinar,
  anexarArquivoDisciplinar,
  corrigirDisciplinar,
  excluirDisciplinar,
  importarViaAssinadaDisciplinar,
} from "@/lib/dp/colaborador-oficial";
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
import { DpFilePicker } from "@/components/dp/DpFilePicker";
import { DpTableColumnHeader } from "@/components/dp/DpTableColumnHeader";
import { DpTableColumnsMenu } from "@/components/dp/DpTableColumnsMenu";
import { useDpTableColumns } from "@/hooks/useDpTableColumns";
import { notifyError } from "@/lib/notifyError";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import { useIsMobile } from "@/hooks/use-mobile";

const BUCKET = "dp-disciplinar";

const TIPOS = [
  { value: "advertencia_verbal", label: "Advertência verbal" },
  { value: "advertencia_escrita", label: "Advertência escrita" },
  { value: "suspensao", label: "Suspensão" },
  { value: "elogio", label: "Elogio" },
  { value: "observacao", label: "Observação" },
] as const;

const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.value, t.label]));

/** Medidas formais: exigem aplicação presencial e via física assinada para irem ao portal. */
const FORMAIS = ["advertencia_escrita", "suspensao"];
const isFormal = (t?: string | null) => !!t && FORMAIS.includes(t);

const TEXTO_CONFIRMACAO =
  "Confirmo que a medida foi aplicada presencialmente e que o arquivo é a via física assinada pelo colaborador (ou por duas testemunhas, em caso de recusa).";

/** Motivos comuns, cada um enquadrado na alínea do Art. 482 da CLT (mesma tabela no gerador do PDF). */
const MOTIVOS: { label: string; alinea: string }[] = [
  { label: "Atraso Ou Falta Injustificada", alinea: "e" },
  { label: "Insubordinação / Descumprimento De Ordem", alinea: "h" },
  { label: "Indisciplina / Descumprimento De Normas Internas", alinea: "h" },
  { label: "Mau Procedimento / Conduta Inadequada", alinea: "b" },
  { label: "Desídia No Desempenho Das Funções", alinea: "e" },
  { label: "Ofensa Ou Agressão A Colega Ou Cliente", alinea: "j" },
  { label: "Uso Indevido De Celular No Expediente", alinea: "h" },
  { label: "Embriaguez Em Serviço", alinea: "f" },
];

function AvisoJuridicoDisciplinar() {
  const isMobile = useIsMobile();
  const [aberto, setAberto] = useState(false);
  const mostrar = !isMobile || aberto;
  return (
    <div className={`mb-4 rounded-xl border border-destructive/30 bg-destructive/5 text-sm ${isMobile ? "p-3" : "p-4"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 font-semibold text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Atenção: Risco Jurídico
            {isMobile && <span className="block text-xs font-normal text-foreground/80">Medidas formais exigem aplicação presencial em papel.</span>}
          </span>
        </div>
        {isMobile && (
          <button type="button" onClick={() => setAberto((v) => !v)} className="shrink-0 text-xs font-semibold text-primary underline">
            {aberto ? "Recolher" : "Ler Orientações"}
          </button>
        )}
      </div>
      {mostrar && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/90">
          <li>Advertência escrita e suspensão devem ser <strong>aplicadas pessoalmente</strong>: gere o modelo, imprima, converse com o colaborador e colha a assinatura (ou de 2 testemunhas se ele recusar).</li>
          <li>Registro disciplinar é assinado <strong>somente em papel</strong>: não existe assinatura digital, pelo portal ou por link do WhatsApp.</li>
          <li>Só depois importe a <strong>via assinada</strong>. Ela é a única coisa que o colaborador verá no portal. Se houver erro no documento, refaça, colha nova assinatura e use "Substituir Via" (a anterior fica no histórico).</li>
          <li>Descobrir uma punição pelo celular, antes da conversa, gera atrito e pode embasar ação por <strong>dano moral ou assédio</strong>.</li>
          <li>Advertências verbais, observações e elogios ficam só no dossiê interno, visível ao DP/gestão. Escreva fatos objetivos, sem juízo de valor, pois o dossiê pode ser usado como prova.</li>
        </ul>
      )}
    </div>
  );
}

type DiscColKey = "colaborador" | "unidade" | "data" | "tipo" | "dias" | "observacoes" | "arquivo";
type DiscSortKey = "padrao" | "colaborador" | "unidade" | "data" | "tipo" | "dias";

const DISC_COL_ORDER: DiscColKey[] = ["colaborador", "unidade", "data", "tipo", "dias", "observacoes", "arquivo"];
const DISC_COL_WIDTHS: Record<DiscColKey, number> = {
  colaborador: 220, unidade: 140, data: 100, tipo: 150, dias: 70, observacoes: 220, arquivo: 110,
};
const DISC_ACOES_WIDTH = 170;

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
  via_assinada_path: string | null;
  via_assinada_em: string | null;
  created_at: string;
  dp_colaboradores: { nome: string; unidade_id: string | null } | null;
};

const formatDate = (v?: string | null) => v ? new Date(`${v}T00:00:00`).toLocaleDateString("pt-BR") : "—";

const getFileKind = (path?: string | null) => {
  if (!path) return { label: "—", icon: FileText };
  return path.toLowerCase().endsWith(".pdf") ? { label: "PDF", icon: FileText } : { label: "Imagem", icon: FileImage };
};

function situacaoPortal(r: { tipo: string; via_assinada_path: string | null }): string {
  if (!isFormal(r.tipo)) return "Interno (Só DP)";
  return r.via_assinada_path ? "Via Assinada No Portal" : "Aguardando Via Assinada";
}

async function enviarArquivo(companyId: string, registroId: string, file: File): Promise<string> {
  const envio = await prepararUpload(BUCKET, file);
  const path = `${companyId}/${registroId}/${Date.now()}-${sanitizeStorageFilename(envio.name)}`;
  const up = await supabase.storage.from(BUCKET).upload(path, envio, {
    upsert: false,
    contentType: envio.type || "application/pdf",
  });
  if (up.error) throw up.error;
  return path;
}

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
  const [motivoSel, setMotivoSel] = useState("");
  const [caminho, setCaminho] = useState<"gerar" | "importar">("gerar");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmo, setConfirmo] = useState(false);
  const [elogioVis, setElogioVis] = useState<"privado" | "individual" | "publico">("privado");
  /** Campo com preenchimento pendente — destacado na borda, sem erro de sistema. */
  const [campoPendente, setCampoPendente] = useState<string | null>(null);
  // importar via assinada (histórico)
  const [viaPara, setViaPara] = useState<Registro | null>(null);
  const [viaArquivo, setViaArquivo] = useState<File | null>(null);
  const [viaConfirmo, setViaConfirmo] = useState(false);
  const [viaMotivo, setViaMotivo] = useState("");
  const viaRef = useRef<HTMLInputElement>(null);

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
  const [editElogioVis, setEditElogioVis] = useState<"privado" | "individual" | "publico">("privado");
  const [editDias, setEditDias] = useState("0");
  const [editObs, setEditObs] = useState("");

  const list = useQuery({
    queryKey: ["dp_disciplinar", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      // Leitura em lotes com ordem estável: nada some acima de 1.000 registros.
      const data = await fetchAllPages<Registro>((from, to) =>
        supabase
          .from("dp_registros_disciplinares")
          .select("*, dp_colaboradores(nome, unidade_id)")
          .eq("company_id", selectedCompanyId!)
          .is("removido_em", null)
          .order("data", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to) as any,
      );
      return data;
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

  /** Configuração das colunas da tabela de histórico (formato planilha). */
  const COLS = useMemo(() => ({
    colaborador: {
      label: "Colaborador", sortKey: "colaborador" as const,
      value: (r: Registro) => r.dp_colaboradores?.nome ?? "—",
      render: (r: Registro) => (
        <span className="block truncate font-semibold text-foreground" title={r.dp_colaboradores?.nome ?? ""}>{r.dp_colaboradores?.nome ?? "—"}</span>
      ),
    },
    unidade: {
      label: "Unidade", sortKey: "unidade" as const,
      value: (r: Registro) => (r.dp_colaboradores?.unidade_id ? unidadeNameById.get(r.dp_colaboradores.unidade_id) : null) ?? "—",
      render: (r: Registro) => {
        const unitName = r.dp_colaboradores?.unidade_id ? unidadeNameById.get(r.dp_colaboradores.unidade_id) : null;
        return <span className="block truncate" title={unitName ?? ""}>{unitName ?? "—"}</span>;
      },
    },
    data: {
      label: "Data", sortKey: "data" as const,
      value: (r: Registro) => formatDate(r.data),
      render: (r: Registro) => <span className="whitespace-nowrap">{formatDate(r.data)}</span>,
    },
    tipo: {
      label: "Tipo", sortKey: "tipo" as const,
      value: (r: Registro) => TIPO_LABEL[r.tipo] ?? r.tipo,
      render: (r: Registro) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <Badge variant="outline" className="max-w-full truncate">{TIPO_LABEL[r.tipo] ?? r.tipo}</Badge>
          <span className="truncate text-[10px] text-muted-foreground">{situacaoPortal(r)}</span>
        </div>
      ),
    },
    dias: {
      label: "Dias", sortKey: "dias" as const,
      value: (r: Registro) => String(r.suspensao_dias ?? "—"),
      render: (r: Registro) => <span className="tabular-nums">{r.suspensao_dias ?? "—"}</span>,
    },
    observacoes: {
      label: "Observações", sortKey: "padrao" as const,
      value: (r: Registro) => r.descricao || r.motivo || "—",
      render: (r: Registro) => (
        <span className="block truncate" title={r.descricao || r.motivo || ""}>{r.descricao || r.motivo || "—"}</span>
      ),
    },
    arquivo: {
      label: "Arquivo", sortKey: "padrao" as const,
      value: (r: Registro) => getFileKind(r.pdf_storage_path).label,
      render: (r: Registro) => {
        const fileKind = getFileKind(r.pdf_storage_path);
        const FileIcon = fileKind.icon;
        return r.pdf_storage_path ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            onClick={() => setPreview({ title: `Registro — ${r.dp_colaboradores?.nome ?? ""}`, path: r.pdf_storage_path! })}
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
  } = useDpTableColumns<DiscColKey, DiscSortKey>({
    storageKey: "dp_disciplinar_col",
    screenKey: "dp_disciplinar",
    defaultOrder: DISC_COL_ORDER,
    defaultWidths: DISC_COL_WIDTHS,
    essentialKeys: ["colaborador"],
    acoesWidth: DISC_ACOES_WIDTH,
    defaultSortKey: "padrao",
  });

  /** Aplica os filtros por valor de cada coluna sobre os filtros da barra. */
  const filtradoPorColuna = useMemo(() => {
    return filtered.filter((r) =>
      DISC_COL_ORDER.every((k) => {
        const sel = colFilters[k] ?? [];
        if (!sel.length) return true;
        return sel.includes(COLS[k].value(r));
      }),
    );
  }, [filtered, colFilters, COLS]);

  /** Opções de filtro de uma coluna considerando os filtros das demais. */
  const opcoesColuna = (k: DiscColKey) => {
    const outros = filtered.filter((r) =>
      DISC_COL_ORDER.every((other) => {
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

  /** Ordenação escolhida no cabeçalho; "padrao" mantém a ordem por data desc. */
  const linhasFiltradas = useMemo(() => {
    if (sortKey === "padrao") return filtradoPorColuna;
    const arr = [...filtradoPorColuna];
    arr.sort((a, b) => {
      let cmp: number;
      if (sortKey === "data") cmp = (a.data ?? "").localeCompare(b.data ?? "");
      else if (sortKey === "dias") cmp = (a.suspensao_dias ?? -1) - (b.suspensao_dias ?? -1);
      else {
        const col = DISC_COL_ORDER.find((k) => COLS[k].sortKey === sortKey);
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
    setEditColaboradorId(editing.colaborador_id);
    setEditData(editing.data);
    setEditTipo(editing.tipo);
    setEditDias(String(editing.suspensao_dias ?? 0));
    setEditObs(editing.descricao ?? editing.motivo ?? "");
    setEditElogioVis(((editing as any).elogio_visibilidade ?? "privado") as typeof editElogioVis);
  }, [editing]);

  const doImport = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (!unidadeId) throw new Error("Selecione a unidade");
      if (!colaboradorId) throw new Error("Selecione o colaborador");
      if (!dataDoc) throw new Error("Informe a data do documento");
      if (!tipo) throw new Error("Selecione o tipo de registro");
      const formal = isFormal(tipo);
      const motivoTxt = motivoSel.trim();
      if (formal) {
        if (!motivoTxt) throw new Error("Selecione ou digite o motivo");
        if (caminho === "gerar" && observacao.trim().length < 10) throw new Error("Descreva os fatos (mínimo 10 caracteres)");
        if (caminho === "importar" && !pendingFile) throw new Error("Anexe a foto ou PDF da via assinada");
        if (caminho === "importar" && !confirmo) throw new Error("Confirme que a via anexada foi aplicada presencialmente e assinada.");
      }
      const diasN = tipo === "suspensao" ? parseInt(dias || "0", 10) : 0;
      if (tipo === "suspensao" && (!Number.isFinite(diasN) || diasN <= 0 || diasN > 30)) {
        throw new Error("Informe de 1 a 30 dias de suspensão");
      }

      const registroId = await registrarDisciplinar({
        colaboradorId,
        tipo,
        data: dataDoc,
        motivo: (formal ? motivoTxt : observacao) || TIPO_LABEL[tipo] || tipo,
        descricao: observacao || null,
        suspensaoDias: diasN > 0 ? diasN : null,
      });

      if (tipo === "elogio" && elogioVis !== "privado") {
        const { error } = await (supabase.rpc as any)("dp_elogio_divulgar", { p_registro_id: registroId, p_visibilidade: elogioVis });
        if (error) throw error;
      }

      if (pendingFile) {
        const path = await enviarArquivo(selectedCompanyId, registroId, pendingFile);
        await anexarArquivoDisciplinar(registroId, path);
        if (formal) await importarViaAssinadaDisciplinar(registroId, path);
        return { registroId, gerarModelo: false };
      }
      return { registroId, gerarModelo: formal };
    },
    onSuccess: (res) => {
      toast.success(
        res.gerarModelo
          ? "Registro salvo. Imprima o modelo, colha as assinaturas e depois importe a via assinada."
          : "Registro cadastrado com sucesso",
      );
      if (res.gerarModelo) genPdf.mutate(res.registroId);
      setUnidadeId(""); setColaboradorId(""); setDataDoc(""); setTipo(""); setDias("0"); setObservacao(""); setPendingFile(null); setConfirmo(false); setElogioVis("privado"); setMotivoSel(""); setCaminho("gerar");
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["dp_disciplinar"] });
      setTab("historico");
    },
    onError: (e: any) => notifyError(e, { surface: "Medidas disciplinares", action: "concluir a ação", fallback: "Erro ao cadastrar" }),
  });

  const doVia = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId || !viaPara) throw new Error("Registro não selecionado");
      if (!viaArquivo) throw new Error("Anexe a via assinada");
      if (!viaConfirmo) throw new Error("Confirme a aplicação presencial e as assinaturas.");
      const troca = !!viaPara.via_assinada_path;
      if (troca && viaMotivo.trim().length < 5) throw new Error("Informe o motivo da troca da via.");
      const path = await enviarArquivo(selectedCompanyId, viaPara.id, viaArquivo);
      await importarViaAssinadaDisciplinar(viaPara.id, path, troca ? viaMotivo.trim() : undefined);
      return troca;
    },
    onSuccess: (troca) => {
      toast.success(troca ? "Via substituída. A anterior ficou guardada no histórico." : "Via assinada importada e disponível ao colaborador");
      setViaPara(null); setViaArquivo(null); setViaConfirmo(false); setViaMotivo("");
      qc.invalidateQueries({ queryKey: ["dp_disciplinar"] });
    },
    onError: (e: any) => notifyError(e, { surface: "Medidas disciplinares", action: "importar a via assinada", fallback: "Erro ao importar a via" }),
  });

  const doDelete = useMutation({
    mutationFn: async (r: Registro) => {
      // Exclusão com histórico: o registro sai da lista, mas fica guardado com
      // quem excluiu, quando e por quê (o arquivo é preservado).
      await excluirDisciplinar(r.id, "Excluído pelo DP na tela de medidas disciplinares");
    },
    onSuccess: () => {
      toast.success("Registro excluído");
      qc.invalidateQueries({ queryKey: ["dp_disciplinar"] });
      setToDelete(null);
    },
    onError: (e: any) => notifyError(e, { surface: "Medidas disciplinares", action: "concluir a ação", fallback: "Erro ao excluir" }),
  });

  const doEdit = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Registro não selecionado");
      if (!editColaboradorId) throw new Error("Selecione o colaborador");
      if (!editData) throw new Error("Informe a data");
      if (!editTipo) throw new Error("Selecione o tipo");
      const diasN = parseInt(editDias || "0", 10);
      await corrigirDisciplinar({
        id: editing.id,
        colaboradorId: editColaboradorId,
        data: editData,
        tipo: editTipo,
        suspensaoDias: diasN > 0 ? diasN : null,
        descricao: editObs || null,
        motivo: editObs || TIPO_LABEL[editTipo] || editTipo,
      });
      if (editTipo === "elogio" && editing && editElogioVis !== ((editing as any).elogio_visibilidade ?? "privado")) {
        const { error } = await (supabase.rpc as any)("dp_elogio_divulgar", { p_registro_id: editing.id, p_visibilidade: editElogioVis });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Registro atualizado");
      qc.invalidateQueries({ queryKey: ["dp_disciplinar"] });
      setEditing(null);
    },
    onError: (e: any) => notifyError(e, { surface: "Medidas disciplinares", action: "concluir a ação", fallback: "Erro ao atualizar" }),
  });

  const genPdf = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("dp-generate-disciplinary-pdf", { body: { registro_id: id } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { path: string; signed_url: string };
    },
    onSuccess: (data) => {
      toast.success("Modelo gerado. Imprima e colha as assinaturas.");
      if (data.signed_url) window.open(data.signed_url, "_blank");
      qc.invalidateQueries({ queryKey: ["dp_disciplinar"] });
    },
    onError: (e: any) => notifyError(e, { surface: "Medidas disciplinares", action: "concluir a ação", fallback: "Erro ao gerar PDF" }),
  });

  const handleDownload = async (r: Registro) => {
    const caminho = r.via_assinada_path ?? r.pdf_storage_path;
    if (!caminho) return;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 60);
    if (error || !data?.signedUrl) return toast.error("Não foi possível gerar o link");
    const a = document.createElement("a");
    a.href = data.signedUrl; a.rel = "noopener"; a.target = "_blank";
    a.download = caminho.split("/").pop() || "registro.pdf";
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <DpPage>
      <Helmet><title>Disciplinares — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={ShieldAlert}
        title="Disciplinares"
        description="Gerencie advertências, suspensões, elogios e o dossiê disciplinar da equipe."
        actions={
          <DpTableColumnsMenu
            columns={DISC_COL_ORDER.map((k) => ({ key: k, label: COLS[k].label }))}
            hidden={hidden}
            essentialKeys={["colaborador"]}
            onToggle={toggleHidden}
            onReset={resetLayout}
          />
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="importar"><FileSignature className="size-4 mr-2" />Novo Registro</TabsTrigger>
          <TabsTrigger value="historico"><History className="size-4 mr-2" />Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="importar" className="mt-4">
          <DpContentCard>
            <div className="flex items-center gap-2 mb-5">
              <FileSignature className="size-5 text-primary" />
              <h3 className="text-lg font-semibold">Novo Registro Disciplinar ou Elogio</h3>
            </div>
            <AvisoJuridicoDisciplinar />

            <div className="space-y-5 lg:space-y-6">
              <div className="space-y-2">
                <Label htmlFor="unidade-1">Unidade *</Label>
                <Select value={unidadeId} onValueChange={(v) => { setUnidadeId(v); setColaboradorId(""); }}>
                  <SelectTrigger id="unidade-1"><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                  <SelectContent>
                    {(unidades.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
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
                  disabled={!unidadeId}
                >
                  <SelectTrigger id="colaborador-2"><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                  <SelectContent>
                    {(colabs.data ?? [])
                      .filter((c) => !unidadeId || c.unidade_id === unidadeId)
                      .map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="data-do-documento-3">Data do Documento *</Label>
                  <Input id="data-do-documento-3" type="date" value={dataDoc} onChange={(e) => setDataDoc(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tipo-de-registro-4">Tipo de Registro *</Label>
                  <Select value={tipo} onValueChange={setTipo}>
                    <SelectTrigger id="tipo-de-registro-4"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                    <SelectContent>
                      {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {tipo === "elogio" && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                  <Label htmlFor="elogio-visibilidade">Visibilidade Do Elogio</Label>
                  <Select value={elogioVis} onValueChange={(v) => setElogioVis(v as typeof elogioVis)}>
                    <SelectTrigger id="elogio-visibilidade"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="privado">Privado (Apenas Dossiê Interno)</SelectItem>
                      <SelectItem value="individual">Individual (Avisar E Mostrar No Portal Do Colaborador)</SelectItem>
                      <SelectItem value="publico">Público (Publicar No Mural Da Unidade)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {elogioVis === "publico"
                      ? "Toda a equipe da unidade verá o texto da observação no Mural. Escreva pensando nos colegas lendo."
                      : elogioVis === "individual"
                        ? "Só o colaborador recebe o aviso e vê o reconhecimento em Meus Documentos."
                        : "Fica guardado só na ficha, visível ao DP e à gestão."}
                  </p>
                </div>
              )}

              {isFormal(tipo) && (
                <div className="space-y-2">
                  <Label>Como Deseja Registrar? *</Label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {([
                      ["gerar", "Gerar Modelo Do Sistema", "Preencha motivo e fatos; o sistema gera a carta para imprimir."],
                      ["importar", "Importar Via Já Assinada", "Use o modelo próprio da empresa já assinado em papel."],
                    ] as const).map(([v, t, d]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => { setCaminho(v); if (v === "gerar") { setPendingFile(null); setConfirmo(false); } }}
                        className={`rounded-xl border p-4 text-left transition-colors ${caminho === v ? "border-primary bg-primary/5" : "border-border"}`}
                      >
                        <div className="text-sm font-semibold leading-snug">{t}</div>
                        <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{d}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isFormal(tipo) && (
                <div className="space-y-2">
                  <Label htmlFor="motivo-disc">Motivo *</Label>
                  <Select value={MOTIVOS.some((m) => m.label === motivoSel) ? motivoSel : motivoSel ? "__outro" : ""} onValueChange={(v) => setMotivoSel(v === "__outro" ? " " : v)}>
                    <SelectTrigger id="motivo-disc"><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
                    <SelectContent>
                      {MOTIVOS.map((m) => (
                        <SelectItem key={m.label} value={m.label} className="whitespace-normal py-2">
                          <span className="block font-medium leading-tight">{m.label}</span>
                          <span className="block text-xs text-muted-foreground leading-tight">
                            Art. 482 da CLT, alínea “{m.alinea}”
                          </span>
                        </SelectItem>
                      ))}
                      <SelectItem value="__outro" className="whitespace-normal">Outro (Digitar)</SelectItem>
                    </SelectContent>
                  </Select>
                  {motivoSel && !MOTIVOS.some((m) => m.label === motivoSel) && (
                    <Input value={motivoSel.trimStart()} onChange={(e) => setMotivoSel(e.target.value || " ")} placeholder="Descreva o motivo em poucas palavras" />
                  )}
                </div>
              )}

              {tipo === "suspensao" && (
                <div className="space-y-2">
                  <Label htmlFor="dias-de-afastamento-se-aplicavel-5">Dias De Suspensão *</Label>
                  <Input id="dias-de-afastamento-se-aplicavel-5" type="number" min={1} max={30} value={dias} onChange={(e) => setDias(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Máximo de 30 dias (Art. 474 da CLT). A suspensão começa no dia seguinte à data do documento.</p>
                </div>
              )}

              {(!isFormal(tipo) || caminho === "importar") && (
                <div className="space-y-2">
                  <Label>{isFormal(tipo) ? "Foto Ou PDF Da Via Assinada *" : "Arquivo (Opcional)"}</Label>
                  <DpFilePicker ref={fileRef} accept="application/pdf,image/*" file={pendingFile} onFileChange={setPendingFile} />
                  {isFormal(tipo) && (
                    <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-xs">
                      <Checkbox checked={confirmo} onCheckedChange={(v) => setConfirmo(v === true)} className="mt-0.5" />
                      <span>{TEXTO_CONFIRMACAO}</span>
                    </label>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="observacoes-6">{isFormal(tipo) ? "Descrição Dos Fatos" + (caminho === "gerar" ? " *" : "") : "Observações"}</Label>
                <Textarea
                  id="observacoes-6"
                  rows={isFormal(tipo) ? 6 : 3}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder={isFormal(tipo) ? "Descreva de forma objetiva: o que aconteceu, quando, onde e quem presenciou." : "Observações adicionais (opcional)"}
                />
              </div>
            </div>

            <Button className="w-full mt-6" size="lg" disabled={doImport.isPending} onClick={() => doImport.mutate()}>
              {isFormal(tipo) && caminho === "gerar" ? <FileText className="size-4 mr-2" /> : <Upload className="size-4 mr-2" />}
              {doImport.isPending
                ? "Processando..."
                : isFormal(tipo)
                  ? caminho === "gerar" ? "Gerar Carta Para Impressão (PDF)" : "Salvar E Arquivar Via Assinada"
                  : "Salvar Registro"}
            </Button>
          </DpContentCard>
        </TabsContent>

        <TabsContent value="historico" className="mt-4 space-y-4">
          <DpFilterCard>
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1.5">
                <Label htmlFor="unidade-7" className="text-xs font-medium text-muted-foreground">Unidade</Label>
                <Select value={fUnidade} onValueChange={setFUnidade}>
                  <SelectTrigger id="unidade-7"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    {(unidades.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="colaborador-8" className="text-xs font-medium text-muted-foreground">Colaborador</Label>
                <Select value={fColab} onValueChange={setFColab}>
                  <SelectTrigger id="colaborador-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {colabsHistorico.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="data-inicio-9" className="text-xs font-medium text-muted-foreground">Data Início</Label>
                <Input id="data-inicio-9" type="date" value={fDataInicio} onChange={(e) => setFDataInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="data-fim-10" className="text-xs font-medium text-muted-foreground">Data Fim</Label>
                <Input id="data-fim-10" type="date" value={fDataFim} onChange={(e) => setFDataFim(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tipo-11" className="text-xs font-medium text-muted-foreground">Tipo</Label>
                <Select value={fTipo} onValueChange={setFTipo}>
                  <SelectTrigger id="tipo-11"><SelectValue /></SelectTrigger>
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
            ) : linhasFiltradas.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                {filtered.length === 0 ? "Nenhum documento encontrado." : "Nenhum resultado para os filtros de coluna aplicados."}
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <Table className="table-fixed text-xs" style={{ width: "100%", minWidth: larguraTotal + DISC_ACOES_WIDTH }}>
                  <TableHeader>
                    <TableRow>
                      {visibleOrder.map((k) => (
                        <DpTableColumnHeader
                          key={k}
                          label={COLS[k].label}
                          width={colWidths[k]}
                          sortAtivo={sortKey === COLS[k].sortKey && COLS[k].sortKey !== "padrao"}
                          sortDir={sortDir}
                          onSort={(dir) => aplicarSort(COLS[k].sortKey, dir)}
                          ativos={colFilters[k] ?? []}
                          getOpcoes={() => opcoesColuna(k)}
                          onToggle={(v) => toggleColValue(k, v)}
                          onSelecionarTodos={() => setColFilters((p) => ({ ...p, [k]: opcoesColuna(k) }))}
                          onLimpar={() => setColFilters((p) => ({ ...p, [k]: [] }))}
                          arrastando={dragCol === k}
                          onDragStart={() => setDragCol(k)}
                          onDrop={() => soltarSobre(k)}
                          onDragEnd={() => setDragCol(null)}
                          onResize={(largura) => resize(k, largura)}
                          onResetWidth={() => resetWidth(k)}
                        />
                      ))}
                      <TableHead
                        className="relative select-none text-right text-xs"
                        style={{ width: DISC_ACOES_WIDTH, minWidth: DISC_ACOES_WIDTH, maxWidth: DISC_ACOES_WIDTH }}
                      >
                        Ações
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasFiltradas.map((r) => (
                      <TableRow key={r.id} className="align-middle">
                        {visibleOrder.map((k) => (
                          <TableCell key={k} className="overflow-hidden px-3" style={{ width: colWidths[k], maxWidth: colWidths[k] }}>
                            {COLS[k].render(r)}
                          </TableCell>
                        ))}
                        <TableCell className="px-3 text-right" style={{ width: DISC_ACOES_WIDTH, maxWidth: DISC_ACOES_WIDTH }}>
                          <div className="flex gap-1 justify-end">
                            <Button aria-label="Editar registro" size="icon" variant="ghost" title="Editar" onClick={() => setEditing(r)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {!r.pdf_storage_path && (
                              <Button aria-label="Assinar" size="icon" variant="ghost" title="Gerar PDF" disabled={genPdf.isPending} onClick={() => genPdf.mutate(r.id)}>
                                <FileSignature className="h-4 w-4" />
                              </Button>
                            )}
                            {isFormal(r.tipo) && (
                              <Button aria-label={r.via_assinada_path ? "Substituir via assinada" : "Importar via assinada"} size="icon" variant="ghost" title={r.via_assinada_path ? "Substituir Via Assinada" : "Importar Via Assinada"} onClick={() => setViaPara(r)}>
                                <FileCheck2 className={r.via_assinada_path ? "h-4 w-4 text-muted-foreground" : "h-4 w-4 text-primary"} />
                              </Button>
                            )}
                            {(r.pdf_storage_path || r.via_assinada_path) && (
                              <Button aria-label="Baixar registro" size="icon" variant="ghost" title="Baixar" onClick={() => handleDownload(r)}>
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            <Button aria-label="Excluir registro" size="icon" variant="ghost" title="Excluir" onClick={() => setToDelete(r)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </DpContentCard>

          {/* Mobile: lista de cards */}
          <div className="md:hidden space-y-3">
            {list.isLoading && (
              <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Carregando…</div>
            )}
            {!list.isLoading && linhasFiltradas.length === 0 && (
              <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                {filtered.length === 0 ? "Nenhum documento encontrado." : "Nenhum resultado para os filtros aplicados."}
              </div>
            )}
            {!list.isLoading && linhasFiltradas.map((r) => {
              const unitName = r.dp_colaboradores?.unidade_id ? unidadeNameById.get(r.dp_colaboradores.unidade_id) : null;
              const fileKind = getFileKind(r.pdf_storage_path);
              const FileIcon = fileKind.icon;
              return (
                <div key={r.id} className="rounded-2xl border border-border bg-card p-4 space-y-2 active:scale-[0.98] transition-transform">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{r.dp_colaboradores?.nome ?? "—"}</div>
                      {unitName && <div className="text-[11px] text-muted-foreground truncate">{unitName}</div>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <Badge variant="outline">{TIPO_LABEL[r.tipo] ?? r.tipo}</Badge>
                      <span className="text-[10px] text-muted-foreground">{situacaoPortal(r)}</span>
                    </div>
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
                    {isFormal(r.tipo) && !r.via_assinada_path && (
                      <Button size="sm" variant="ghost" className="min-h-11 flex-1" onClick={() => setViaPara(r)}>
                        <FileCheck2 className="h-4 w-4 mr-1" /> Via Assinada
                      </Button>
                    )}
                    {(r.pdf_storage_path || r.via_assinada_path) && (
                      <Button size="sm" variant="ghost" className="min-h-11 flex-1" onClick={() => handleDownload(r)}>
                        <Download className="h-4 w-4 mr-1" /> Baixar
                      </Button>
                    )}
                    <Button aria-label="Excluir registro" size="icon" variant="ghost" className="min-h-11 min-w-11" onClick={() => setToDelete(r)}>
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
              <Label htmlFor="unidade-12">Unidade</Label>
              <Select value={editUnidadeId} onValueChange={(v) => { setEditUnidadeId(v); setEditColaboradorId(""); }}>
                <SelectTrigger id="unidade-12"><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                <SelectContent>
                  {(unidades.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="colaborador-13">Colaborador</Label>
              <Select value={editColaboradorId} onValueChange={setEditColaboradorId}>
                <SelectTrigger id="colaborador-13"><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                <SelectContent>
                  {editColabs.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="data-14">Data</Label>
                <Input id="data-14" type="date" value={editData} onChange={(e) => setEditData(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dias-15">Dias</Label>
                <Input id="dias-15" type="number" min={0} value={editDias} onChange={(e) => setEditDias(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo-16">Tipo</Label>
              <Select value={editTipo} onValueChange={setEditTipo}>
                <SelectTrigger id="tipo-16"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="observacoes-17">Observações</Label>
              <Textarea id="observacoes-17" rows={3} value={editObs} onChange={(e) => setEditObs(e.target.value)} />
            </div>
            {editTipo === "elogio" && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <Label htmlFor="edit-elogio-visibilidade">Visibilidade Do Elogio</Label>
                <Select value={editElogioVis} onValueChange={(v) => setEditElogioVis(v as typeof editElogioVis)}>
                  <SelectTrigger id="edit-elogio-visibilidade"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="privado">Privado (Apenas Dossiê Interno)</SelectItem>
                    <SelectItem value="individual">Individual (Avisar E Mostrar No Portal Do Colaborador)</SelectItem>
                    <SelectItem value="publico">Público (Publicar No Mural Da Unidade)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {editElogioVis === "privado"
                    ? "Voltar para Privado tira o elogio do portal e remove a publicação do Mural, se houver. O aviso já enviado não é apagado."
                    : editElogioVis === "publico"
                      ? "Toda a equipe da unidade verá o texto da observação no Mural."
                      : "Só o colaborador vê o reconhecimento. Se estava no Mural, a publicação será removida."}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => doEdit.mutate()} disabled={doEdit.isPending}>
              {doEdit.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viaPara} onOpenChange={(v) => { if (!v) { setViaPara(null); setViaArquivo(null); setViaConfirmo(false); setViaMotivo(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viaPara?.via_assinada_path ? "Substituir Via Assinada" : "Importar Via Assinada"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              {viaPara?.dp_colaboradores?.nome} — {viaPara ? TIPO_LABEL[viaPara.tipo] : ""} de {formatDate(viaPara?.data)}.
            </p>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
              <strong>Somente assinatura em papel.</strong> Registros disciplinares não têm assinatura digital nem link pelo WhatsApp. O colaborador apenas visualiza no portal a cópia da folha que já assinou à mão.
            </div>
            {viaPara?.via_assinada_path && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">A via atual será trocada e ficará guardada no histórico do registro.</p>
                <Textarea value={viaMotivo} onChange={(e) => setViaMotivo(e.target.value)} placeholder="Motivo da troca (ex.: erro na data corrigido e nova via assinada)" rows={2} />
              </div>
            )}
            <DpFilePicker ref={viaRef} accept="application/pdf,image/*" file={viaArquivo} onFileChange={setViaArquivo} />
            <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-xs">
              <Checkbox checked={viaConfirmo} onCheckedChange={(v) => setViaConfirmo(v === true)} className="mt-0.5" />
              <span>{TEXTO_CONFIRMACAO}</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViaPara(null)}>Cancelar</Button>
            <Button onClick={() => doVia.mutate()} disabled={doVia.isPending || !viaArquivo || !viaConfirmo || (!!viaPara?.via_assinada_path && viaMotivo.trim().length < 5)}>
              {doVia.isPending ? "Enviando..." : viaPara?.via_assinada_path ? "Substituir Via" : "Importar E Liberar Ao Colaborador"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro sai da lista e fica guardado no histórico, com quem excluiu e quando. O arquivo anexado é preservado.
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
