import { abrirDocumento as abrirDocumentoArquivo } from "@/lib/documentoArquivo";
import { aceitaComprovante } from "@/lib/dp/documentoTipos";
import { docTipoLabel } from "@/lib/dp/documentoTipos";
import { DpDocumentosAbas } from "@/components/dp/documentos/DpDocumentosAbas";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { certificadoValidacaoPdf } from "@/lib/dp/documento-certificado";
import { Helmet } from "react-helmet-async";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Eye, Download, Search, ArrowUp, ArrowDown, ChevronsUpDown,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, Trash2, Replace,
  History as HistoryIcon, ChevronDown, ArrowDownUp,
  Upload,
  Receipt,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { DocumentPreview } from "@/components/dp/DocumentPreview";
import { DpContentCard, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpSalvarLargurasButton } from "@/components/dp/DpSalvarLargurasButton";
import { DpTableColumnsMenu } from "@/components/dp/DpTableColumnsMenu";

import { DP_DOC_TIPOS, DP_DOC_GRUPOS, docTipoBadgeClass, docTipoGrupo } from "@/lib/dp/documentoTipos";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DocSubstituirDialog, type DocSubstituirTarget } from "@/components/dp/documentos/DocSubstituirDialog";
import { DocDetalhesDialog } from "@/components/dp/documentos/DocDetalhesDialog";
import { DocEventosDialog } from "@/components/dp/documentos/DocEventosDialog";
import { Textarea } from "@/components/ui/textarea";
import { docSourceConfig, excluirDocumentoHistorico } from "@/lib/dp/historicoDocAcoes";
import { DpTableColumnHeader } from "@/components/dp/DpTableColumnHeader";
import { useDpTableColumns } from "@/hooks/useDpTableColumns";
import { notifyError } from "@/lib/notifyError";
import { ViaAssinadaBotao } from "@/components/dp/documentos/ViaAssinadaBotao";
import { docTipoAssinaturaFisica } from "@/lib/dp/documentoTipos";
import { ComprovanteAcaoBotao, ComprovanteAnexarDialog } from "@/components/dp/documentos/ComprovantePagamentoPanel";
import { consolidarQuitacao, rotuloQuitacao, fraseConferenciaValor, type QuitacaoConsolidada } from "@/lib/dp/comprovante-valor";
import { useComprovantesComplementares } from "@/hooks/useDpComprovantesComplementares";


type UnifiedDoc = {
  id: string;
  colaborador_nome: string;
  colaborador_id: string | null;
  tipo_key: string;
  tipo_label: string;
  competencia: string; // MM/YYYY or "—"
  competencia_sort: string; // YYYY-MM
  unidade_nome: string;
  unidade_id: string | null;
  status_key: string;
  status_label: string;
  data: string; // ISO
  bucket: string;
  file_path: string | null;
  mime_type?: string | null;
  titulo: string;
  /** null = não exige aceite; false = aguardando; true = aceito */
  aceite: boolean | null;
  aceite_em?: string | null;
  /** Validação digital dispensada porque o documento já veio assinado. */
  aceiteDispensado?: boolean;
  /** Documento de assinatura física: null = não se aplica. */
  viaFisica?: { path: string | null; mime: string | null; em: string | null } | null;
  rescisao_grupo_id?: string | null;
  /** Comprovante de pagamento anexado a este documento. */
  tem_comprovante?: boolean;
  comprovante_path?: string | null;
  comprovante_mime?: string | null;
  /** Soma consolidada dos comprovantes (lida do banco, sem nova leitura). */
  quitacao?: QuitacaoConsolidada | null;
};

function QuitacaoSelo({ q }: { q?: QuitacaoConsolidada | null }) {
  if (!q) return null;
  const rotulo = rotuloQuitacao(q);
  if (!rotulo) return null;
  const tom =
    q.status === "exato"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : q.status === "sem_referencia"
        ? "border-border text-muted-foreground"
        : "border-amber-300 bg-amber-50 text-amber-800";
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${tom}`}
      title={fraseConferenciaValor(q) ?? "Valor do documento não informado"}
    >
      {rotulo}
      {q.status === "menor" || q.status === "maior" ? " ⚠" : ""}
    </span>
  );
}

const TIPO_OPTIONS = [
  ...DP_DOC_TIPOS.filter((t) => t.value !== "sindicato").map((t) => ({ value: t.value as string, label: t.label })),
];

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function fmtCompetencia(iso?: string | null): { label: string; sort: string } {
  if (!iso) return { label: "—", sort: "" };
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return { label: "—", sort: "" };
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return { label: `${mm}/${yyyy}`, sort: `${yyyy}-${mm}` };
}

function tipoBadgeClass(key: string) {
  if (key === "act_cct") return "border-rose-300 text-rose-700";
  return docTipoBadgeClass(key);
}

type ColKey = "colaborador" | "tipo" | "competencia" | "unidade" | "aceite";
type SortKey = "colaborador_nome" | "tipo_label" | "competencia_sort" | "unidade_nome" | "aceite_label" | "data" | "default";

/** Ordens oferecidas na lista do celular. */
const ORDENS_MOBILE: { value: string; label: string }[] = [
  { value: "default:desc", label: "Mais recentes" },
  { value: "default:asc", label: "Mais antigos" },
  { value: "colaborador_nome:asc", label: "Colaborador (A–Z)" },
  { value: "tipo_label:asc", label: "Tipo do documento" },
  { value: "competencia_sort:desc", label: "Competência" },
];
const ORDEM_MOBILE_STORAGE = "dp_historico_ordem_mobile";

const COL_ORDER_STORAGE = "dp_historico_col_order_v2";
const COL_WIDTH_STORAGE = "dp_historico_col_width_v1";
const DEFAULT_COL_ORDER: ColKey[] = ["colaborador", "tipo", "competencia", "unidade", "aceite"];
/** Larguras padrão em px (somam ~1090 + 96 de ações, caindo bem em telas >= 1280). */
const DEFAULT_COL_WIDTHS: Record<ColKey, number> = {
  colaborador: 250,
  tipo: 230,
  competencia: 130,
  unidade: 220,
  aceite: 120,
};
const COL_MIN_WIDTH = 80;
const ACOES_WIDTH = 96;



function aceiteLabel(r: UnifiedDoc) {
  if (r.aceite === null) return r.aceiteDispensado ? "Dispensado" : "—";
  return r.aceite ? "Aceito" : "Aguardando";
}

function fmtDataHora(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Selo de assinatura para card mobile e visualizador. */
function AssinaturaSelo({ r, longo }: { r: UnifiedDoc; longo?: boolean }) {
  if (r.aceite === true) {
    const quando = fmtDataHora(r.aceite_em);
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
        ✓ {longo ? `Assinado pelo colaborador${quando ? ` em ${quando}` : ""}` : "Assinado"}
      </span>
    );
  }
  if (r.aceite === false) {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
        Falta assinar
      </span>
    );
  }
  if (r.viaFisica) {
    return r.viaFisica.path ? (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
        ✓ {longo ? `Via assinada anexada${r.viaFisica.em ? ` em ${fmtDataHora(r.viaFisica.em)}` : ""}` : "Via assinada"}
      </span>
    ) : (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
        Falta via assinada
      </span>
    );
  }
  if (r.aceiteDispensado) {
    return (
      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        Assinatura física (dispensado)
      </span>
    );
  }
  return null;
}

/**
 * Cabeçalho de coluna com menu de ordenação + filtro por valores,
 * suporte a arrastar para reordenar e alça de redimensionamento na borda direita.
 */
function ColunaFiltroHeader(props: {
  label: string;
  width: number;
  center?: boolean;
  sortAtivo: boolean;
  sortDir: "asc" | "desc";
  onSort: (dir: "asc" | "desc") => void;
  ativos: string[];
  getOpcoes: () => string[];
  onToggle: (v: string) => void;
  onSelecionarTodos: () => void;
  onLimpar: () => void;
  arrastando: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onResize: (largura: number) => void;
  onResetWidth: () => void;
}) {
  const [buscaOpcao, setBuscaOpcao] = useState("");
  const [redimensionando, setRedimensionando] = useState(false);
  const opcoes = props.getOpcoes().filter((o) =>
    o.toLowerCase().includes(buscaOpcao.trim().toLowerCase()),
  );

  /** Arraste da alça: converte o deslocamento do ponteiro em nova largura. */
  const iniciarResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const xInicial = e.clientX;
    const larguraInicial = props.width;
    setRedimensionando(true);
    const mover = (ev: PointerEvent) => {
      props.onResize(Math.max(COL_MIN_WIDTH, larguraInicial + (ev.clientX - xInicial)));
    };
    const soltar = () => {
      setRedimensionando(false);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };

  return (
    <TableHead
      className={`relative uppercase text-xs select-none ${props.arrastando ? "opacity-50" : ""} ${props.center ? "text-center" : ""}`}
      style={{ width: props.width, minWidth: props.width, maxWidth: props.width }}
      draggable={!redimensionando}
      onDragStart={props.onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={props.onDrop}
      onDragEnd={props.onDragEnd}
    >

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Clique para ordenar/filtrar · arraste para mover a coluna"
            className={`flex w-full cursor-grab items-center gap-1 uppercase hover:text-foreground ${props.center ? "justify-center text-center" : "text-left"}`}
          >
            <span className="whitespace-nowrap">{props.label}</span>

            {props.sortAtivo
              ? (props.sortDir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />)
              : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />}
            <Filter className={`h-3 w-3 shrink-0 ${props.ativos.length ? "text-primary" : "opacity-30"}`} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 p-0">
          <div className="p-1">
            <DropdownMenuItem onClick={() => props.onSort("asc")}>
              <ArrowUp className="mr-2 h-3.5 w-3.5" /> Ordenar Crescente
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => props.onSort("desc")}>
              <ArrowDown className="mr-2 h-3.5 w-3.5" /> Ordenar Decrescente
            </DropdownMenuItem>
          </div>
          <DropdownMenuSeparator />
          <div className="p-2 space-y-2">
            <Input
              value={buscaOpcao}
              onChange={(e) => setBuscaOpcao(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Buscar…"
              className="h-7 text-xs"
            />
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {opcoes.length === 0 && (
                <p className="py-2 text-center text-xs text-muted-foreground">Sem opções</p>
              )}
              {opcoes.map((o) => (
                <label
                  key={o}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs normal-case hover:bg-muted"
                >
                  <Checkbox checked={props.ativos.includes(o)} onCheckedChange={() => props.onToggle(o)} />
                  <span className="truncate" title={o}>{o}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={props.onSelecionarTodos}>
                Selecionar Todos
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={props.onLimpar}>
                Limpar
              </Button>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Alça de redimensionamento: arraste para ajustar, duplo clique restaura o padrão */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Arraste para ajustar a largura · duplo clique restaura"
        onPointerDown={iniciarResize}
        onDoubleClick={(e) => { e.stopPropagation(); props.onResetWidth(); }}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
        className={`absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none after:absolute after:right-[3px] after:top-1/4 after:h-1/2 after:w-px after:bg-border after:content-[''] hover:after:bg-primary ${
          redimensionando ? "after:bg-primary" : ""
        }`}
      />
    </TableHead>

  );
}

export default function DpHistoricoCompleto() {

  const { selectedCompanyId } = useCompanyContext();
  const colabs = useDpColaboradores();
  const unidades = useDpUnidades();

  const [tipo, setTipo] = useState("all");
  const [grupo, setGrupo] = useState("all");

  const [unidadeId, setUnidadeId] = useState("all");
  const [colabId, setColabId] = useState("all");
  const [urlParams] = useSearchParams();
  const [mes, setMes] = useState(urlParams.get("mes") ?? "all");
  const [ano, setAno] = useState(urlParams.get("ano") ?? "all");
  const [busca, setBusca] = useState("");
  const [pendencia, setPendencia] = useState<"all" | "assinatura" | "comprovante">(
    urlParams.get("pendencia") === "comprovante" ? "comprovante" : urlParams.get("pendencia") === "assinatura" ? "assinatura" : "all",
  );
  const [preview, setPreviewRaw] = useState<UnifiedDoc | null>(null);
  const [anexarDoPreview, setAnexarDoPreview] = useState(false);
  const extrasQuery = useComprovantesComplementares(
    preview?.id?.startsWith("doc:") && (preview?.quitacao?.qtd ?? 0) > 1 ? preview.id.slice(4) : null,
  );
  const extrasPreview = extrasQuery.data ?? [];
  const setPreview = (r: UnifiedDoc | null) => { setPreviewRaw(r); };
  // Documento assinado abre já com o certificado completo de validação.
  const [certPreview, setCertPreview] = useState<{ url: string; revogar: () => void } | null>(null);
  const [certStatus, setCertStatus] = useState<"idle" | "carregando" | "falhou">("idle");
  useEffect(() => {
    if (!preview || preview.aceite !== true || !preview.id.startsWith("doc:")) { setCertStatus("idle"); return; }
    let cancelado = false;
    let atual: { url: string; revogar: () => void } | null = null;
    setCertStatus("carregando");
    certificadoValidacaoPdf(preview.id.slice(4))
      .then((c) => { if (cancelado) c.revogar(); else { atual = c; setCertPreview(c); setCertStatus("idle"); } })
      .catch((e) => { if (!cancelado) { setCertStatus("falhou"); toast.warning(e instanceof Error ? e.message : "Não foi possível carregar a validação digital. Mostrando o documento original."); } });
    return () => { cancelado = true; atual?.revogar(); setCertPreview(null); };
  }, [preview]);
  const [detalhe, setDetalhe] = useState<UnifiedDoc | null>(null);
  const [logAberto, setLogAberto] = useState(false);
  const [excluir, setExcluir] = useState<UnifiedDoc | null>(null);
  const [motivoExclusao, setMotivoExclusao] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [substituir, setSubstituir] = useState<DocSubstituirTarget | null>(null);
  // No celular os filtros começam recolhidos para sobrar tela para a lista.
  const [filtrosAbertos, setFiltrosAbertos] = useState<boolean>(() => {
    try {
      return localStorage.getItem("dp_historico_filtros_mobile") === "1";
    } catch {
      return false;
    }
  });
  const queryClient = useQueryClient();


  const {
    colOrder, colWidths, resize, resetWidth,
    hidden, toggleHidden, resetLayout, visibleOrder,
    dragCol, setDragCol, soltarSobre,
    colFilters, setColFilters, toggleColValue,
    sortKey, sortDir, aplicarSort,
    larguraTotal,
  } = useDpTableColumns<ColKey, SortKey>({
    storageKey: "dp_historico_col",
    screenKey: "dp_historico_documentos",
    defaultOrder: DEFAULT_COL_ORDER,
    defaultWidths: DEFAULT_COL_WIDTHS,
    essentialKeys: ["colaborador"],
    acoesWidth: ACOES_WIDTH,
    defaultSortKey: "default",
    defaultSortDir: "desc",
  });

  const filtrosAtivos = [grupo, tipo, unidadeId, colabId, mes, ano, pendencia].filter((v) => v !== "all").length
    + (busca.trim() ? 1 : 0);

  // A ordem escolhida no celular reaproveita a ordenação da tabela.
  const ordemMobile = `${sortKey}:${sortDir}`;
  const aplicarOrdemMobile = (valor: string) => {
    const [key, dir] = valor.split(":");
    aplicarSort(key as SortKey, dir === "asc" ? "asc" : "desc");
    try {
      localStorage.setItem(ORDEM_MOBILE_STORAGE, valor);
    } catch { /* preferência é opcional */ }
  };
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(ORDEM_MOBILE_STORAGE);
      if (salvo && ORDENS_MOBILE.some((o) => o.value === salvo)) {
        const [key, dir] = salvo.split(":");
        aplicarSort(key as SortKey, dir === "asc" ? "asc" : "desc");
      }
    } catch { /* preferência é opcional */ }
    // Aplica só na abertura da tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colabMap = useMemo(() => {
    const m = new Map<string, { nome: string; unidade_id: string | null; unidade_nome: string | null }>();
    (colabs.data ?? []).forEach((c) => {
      m.set(c.id, { nome: c.nome, unidade_id: (c as any).unidade_id ?? null, unidade_nome: c.unidade_nome ?? null });
    });
    return m;
  }, [colabs.data]);

  const query = useQuery({
    queryKey: ["dp_historico_unified", selectedCompanyId],
    enabled: !!selectedCompanyId && !!colabs.data,
    queryFn: async (): Promise<UnifiedDoc[]> => {
      const cId = selectedCompanyId!;
      // Leitura em lotes com ordem estável: nenhum documento some acima de 1.000.
      const [docs, sols, discs, aceites] = await Promise.all([
        fetchAllPages<any>((from, to) =>
          supabase
            .from("dp_documentos")
            .select("id, titulo, tipo, referencia_data, file_path, mime_type, created_at, colaborador_id, aprovacao_status, exige_aceite, assinatura_detectada, rescisao_grupo_id, comprovante_file_path, comprovante_mime_type, via_assinada_path, via_assinada_mime, via_assinada_em, assinatura_fisica, comprovante_modalidade, comprovante_valor_bancario_cents, comprovante_valor_especie_cents, comprovantes_extra_qtd, comprovantes_extra_cents, valor_liquido_cents")
            .eq("company_id", cId)
            .order("id", { ascending: true })
            .range(from, to)),
        fetchAllPages<any>((from, to) =>
          supabase
            .from("dp_solicitacoes")
            .select("id, tipo, status, data_alvo, arquivo_path, created_at, colaborador_id")
            .is("removido_em", null)
            .eq("company_id", cId)
            .eq("tipo", "atestado" as any)
            .order("id", { ascending: true })
            .range(from, to)),
        fetchAllPages<any>((from, to) =>
          supabase
            .from("dp_registros_disciplinares")
            .select("id, motivo, tipo, data, pdf_storage_path, created_at, colaborador_id")
            .is("removido_em", null)
            .eq("company_id", cId)
            .order("id", { ascending: true })
            .range(from, to)),
        fetchAllPages<any>((from, to) =>
          supabase
            .from("dp_documento_aceites")
            .select("id, documento_id, aceito_em")
            .eq("company_id", cId)
            .not("documento_id", "is", null)
            .order("id", { ascending: true })
            .range(from, to)),
      ]);
      const docsRes = { data: docs };
      const solRes = { data: sols };
      const discRes = { data: discs };

      const aceitos = new Set(aceites.map((a: any) => a.documento_id as string));
      const aceitoEm = new Map<string, string | null>(aceites.map((a: any) => [a.documento_id as string, (a.aceito_em as string) ?? null]));

      const rows: UnifiedDoc[] = [];

      (docsRes.data ?? []).forEach((d: any) => {
        const c = d.colaborador_id ? colabMap.get(d.colaborador_id) : null;
        const comp = fmtCompetencia(d.referencia_data);
        const statusKey = d.aprovacao_status ?? "aprovado";
        rows.push({
          id: `doc:${d.id}`,
          colaborador_nome: c?.nome ?? "—",
          colaborador_id: d.colaborador_id,
          tipo_key: d.tipo,
          tipo_label: TIPO_OPTIONS.find((t) => t.value === d.tipo)?.label ?? docTipoLabel(d.tipo),
          competencia: comp.label,
          competencia_sort: comp.sort,
          unidade_nome: c?.unidade_nome ?? "—",
          unidade_id: c?.unidade_id ?? null,
          status_key: statusKey,
          status_label: statusKey === "aprovado" ? "Disponível" : statusKey.charAt(0).toUpperCase() + statusKey.slice(1),
          data: d.created_at,
          bucket: "dp-documentos",
          file_path: d.file_path,
          mime_type: d.mime_type,
          titulo: d.titulo,
          aceite: d.exige_aceite ? aceitos.has(d.id) : null,
          aceite_em: aceitoEm.get(d.id) ?? null,
          aceiteDispensado: !d.exige_aceite && d.assinatura_detectada === true && !docTipoAssinaturaFisica(d.tipo),
          viaFisica: !d.exige_aceite && (d.assinatura_fisica || docTipoAssinaturaFisica(d.tipo))
            ? { path: d.via_assinada_path ?? null, mime: d.via_assinada_mime ?? null, em: d.via_assinada_em ?? null }
            : null,
           rescisao_grupo_id: d.rescisao_grupo_id ?? null,
          tem_comprovante: !!d.comprovante_file_path,
          comprovante_path: d.comprovante_file_path ?? null,
          comprovante_mime: d.comprovante_mime_type ?? null,
          quitacao: d.comprovante_file_path
            ? consolidarQuitacao({
                liquidoCents: d.valor_liquido_cents,
                temPrincipal: true,
                principalBancarioCents: d.comprovante_modalidade === "especie" ? null : d.comprovante_valor_bancario_cents,
                principalEspecieCents: d.comprovante_modalidade === "bancario" ? null : d.comprovante_valor_especie_cents,
                extraQtd: d.comprovantes_extra_qtd,
                extraCents: d.comprovantes_extra_cents,
              })
            : null,
        });
      });

      (solRes.data ?? []).forEach((s: any) => {
        if (!s.arquivo_path) return;
        const c = s.colaborador_id ? colabMap.get(s.colaborador_id) : null;
        const comp = fmtCompetencia(s.data_alvo ?? s.created_at);
        const statusKey =
          s.status === "aprovada" ? "aprovado" :
          s.status === "recusada" ? "recusado" : "pendente";
        rows.push({
          id: `sol:${s.id}`,
          colaborador_nome: c?.nome ?? "—",
          colaborador_id: s.colaborador_id,
          tipo_key: "atestado",
          tipo_label: "Atestado",
          competencia: comp.label,
          competencia_sort: comp.sort,
          unidade_nome: c?.unidade_nome ?? "—",
          unidade_id: c?.unidade_id ?? null,
          status_key: statusKey,
          status_label: statusKey === "aprovado" ? "Aprovado" : statusKey === "recusado" ? "Recusado" : "Pendente",
          data: s.created_at,
          bucket: "dp-documentos",
          file_path: s.arquivo_path,
          titulo: `Atestado — ${c?.nome ?? ""}`.trim(),
          aceite: null,
        });
      });

      (discRes.data ?? []).forEach((r: any) => {
        const c = r.colaborador_id ? colabMap.get(r.colaborador_id) : null;
        const comp = fmtCompetencia(r.data ?? r.created_at);
        rows.push({
          id: `disc:${r.id}`,
          colaborador_nome: c?.nome ?? "—",
          colaborador_id: r.colaborador_id,
          tipo_key: "disciplinar",
          tipo_label: "Disciplinar",
          competencia: comp.label,
          competencia_sort: comp.sort,
          unidade_nome: c?.unidade_nome ?? "—",
          unidade_id: c?.unidade_id ?? null,
          status_key: "disponivel",
          status_label: "Disponível",
          data: r.created_at,
          bucket: "dp-disciplinar",
          file_path: r.pdf_storage_path,
          titulo: r.motivo ?? "Registro Disciplinar",
          aceite: null,
        });
      });

      rows.sort((a, b) => (a.data < b.data ? 1 : -1));
      return rows;
    },
  });

  const anosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    (query.data ?? []).forEach((r) => {
      if (r.competencia_sort) set.add(r.competencia_sort.slice(0, 4));
    });
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [query.data]);

  const arquivosPorRescisao = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const documento of query.data ?? []) {
      if (!documento.rescisao_grupo_id) continue;
      contagem.set(documento.rescisao_grupo_id, (contagem.get(documento.rescisao_grupo_id) ?? 0) + 1);
    }
    return contagem;
  }, [query.data]);

  // ---------------- Descritores de coluna ----------------
  const COLS: Record<ColKey, {
    label: string;
    sortKey: SortKey;
    center?: boolean;
    value: (r: UnifiedDoc) => string;
    render: (r: UnifiedDoc) => JSX.Element;
    cellClass?: string;
  }> = {
    colaborador: {
      label: "Colaborador", sortKey: "colaborador_nome",
      value: (r) => r.colaborador_nome,
      render: (r) => (
        <span className="block truncate font-semibold text-left" title={r.colaborador_nome}>{r.colaborador_nome}</span>
      ),
      cellClass: "align-top overflow-hidden",
    },
    tipo: {
      label: "Tipo", sortKey: "tipo_label", center: true,
      value: (r) => r.tipo_label,
      render: (r) => (
        <div className="flex flex-col items-center gap-0.5">
          <Badge
            variant="outline"
            className={`max-w-full whitespace-normal break-words text-center leading-tight ${tipoBadgeClass(r.tipo_key)}`}
          >
            {r.tipo_label}
          </Badge>
          {/* A contabilidade manda vários papéis na saída: eles aparecem
              reunidos como um único conjunto da rescisão. */}
          {docTipoGrupo(r.tipo_key) === "desligamento" && (
            <span className="text-[10px] text-muted-foreground">
              {r.rescisao_grupo_id
                ? `Documentos da Rescisão · ${arquivosPorRescisao.get(r.rescisao_grupo_id) ?? 1} arquivos`
                : "Documentos da Rescisão"}
            </span>
          )}
        </div>
      ),
      cellClass: "whitespace-normal break-words align-top text-center",
    },
    competencia: {
      label: "Competência", sortKey: "competencia_sort", center: true,
      value: (r) => r.competencia,
      render: (r) => <span className="font-mono text-sm">{r.competencia}</span>,
      cellClass: "whitespace-nowrap align-top text-center",
    },
    unidade: {
      label: "Unidade", sortKey: "unidade_nome", center: true,
      value: (r) => r.unidade_nome,
      render: (r) => <span className="leading-tight">{r.unidade_nome}</span>,
      cellClass: "whitespace-normal break-words align-top text-center",
    },
    aceite: {
      label: "Aceite", sortKey: "aceite_label", center: true,
      value: (r) => aceiteLabel(r),
      render: (r) => (
        <div className="flex justify-center">
          {r.aceite === null
            ? (r.aceiteDispensado
                ? <Badge variant="outline" className="border-sky-300 text-sky-700 text-[11px]">Dispensado</Badge>
                : <span className="text-xs text-muted-foreground">—</span>)
            : r.aceite
              ? <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[11px]">Aceito</Badge>
              : <Badge variant="outline" className="border-amber-300 text-amber-700 text-[11px]">Aguardando</Badge>}
        </div>
      ),
      cellClass: "whitespace-normal align-top text-center",
    },
  };



  // ---------------- Filtros ----------------
  const baseFiltered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (query.data ?? []).filter((r) => {
      if (tipo !== "all" && r.tipo_key !== tipo) return false;
      if (grupo !== "all" && docTipoGrupo(r.tipo_key) !== grupo) return false;
      if (unidadeId !== "all" && r.unidade_id !== unidadeId) return false;
      if (colabId !== "all" && r.colaborador_id !== colabId) return false;
      if (ano !== "all" && !r.competencia_sort.startsWith(ano)) return false;
      if (mes !== "all" && r.competencia_sort.slice(5, 7) !== mes) return false;
      if (pendencia === "assinatura" && !(r.aceite === false || (r.viaFisica && !r.viaFisica.path))) return false;
      if (pendencia === "comprovante" && (r.tem_comprovante || !aceitaComprovante(r.tipo_key))) return false;
      if (q) {
        const hay = `${r.colaborador_nome} ${r.tipo_label} ${r.unidade_nome} ${r.titulo}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [query.data, tipo, grupo, unidadeId, colabId, mes, ano, busca, pendencia]);


  const filtered = useMemo(() => {
    return baseFiltered.filter((r) =>
      (Object.keys(colFilters) as ColKey[]).every((k) => {
        const sel = colFilters[k];
        if (!sel.length) return true;
        return sel.includes(COLS[k].value(r));
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFiltered, colFilters]);

  /** Opções de cada coluna: valores presentes considerando os demais filtros. */
  const opcoesColuna = (k: ColKey) => {
    const outros = baseFiltered.filter((r) =>
      (Object.keys(colFilters) as ColKey[]).every((other) => {
        if (other === k) return true;
        const sel = colFilters[other];
        if (!sel.length) return true;
        return sel.includes(COLS[other].value(r));
      }),
    );
    const set = new Set<string>();
    outros.forEach((r) => set.add(COLS[k].value(r)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  };


  // ---------------- Ordenação ----------------
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortKey === "default") {
      // "Mais recentes/antigos": ordena pela data/hora em que o documento foi
      // anexado no sistema (created_at), desempatando pelo nome do colaborador.
      arr.sort((a, b) => {
        const dataA = a.data || "";
        const dataB = b.data || "";
        if (dataA !== dataB) {
          const cmp = dataA.localeCompare(dataB);
          return sortDir === "asc" ? cmp : -cmp;
        }
        return (a.colaborador_nome || "").localeCompare(b.colaborador_nome || "", "pt-BR");
      });
      return arr;
    }
    const get = (r: UnifiedDoc) => (sortKey === "aceite_label" ? aceiteLabel(r) : ((r as any)[sortKey] ?? ""));
    arr.sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av === bv) {
        // Na ordenação por Competência, desempata pelo nome do colaborador (A–Z).
        if (sortKey === "competencia_sort") {
          return (a.colaborador_nome || "").localeCompare(b.colaborador_nome || "", "pt-BR");
        }
        return 0;
      }
      const cmp = av > bv ? 1 : -1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  

  // ---------------- Paginação ----------------
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => { setPage(1); }, [tipo, grupo, unidadeId, colabId, mes, ano, busca, pageSize, colFilters]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const paged = useMemo(() => sorted.slice((page - 1) * pageSize, page * pageSize), [sorted, page, pageSize]);

  const limpar = () => {
    setTipo("all"); setGrupo("all"); setUnidadeId("all"); setColabId("all");
    setMes("all"); setAno("all"); setBusca(""); setPendencia("all");
    setColFilters({ colaborador: [], tipo: [], competencia: [], unidade: [], aceite: [] });
  };


  const baixarComprovante = async (row: UnifiedDoc) => {
    try {
      const ok = await abrirDocumentoArquivo(row.id.slice(4), { download: true, variante: "comprovante" });
      if (!ok) toast.error("Comprovante não encontrado. Confira se ele foi anexado ou anexe novamente.");
    } catch {
      toast.error("Não foi possível baixar o comprovante agora. Verifique a conexão e tente de novo.");
    }
  };
  const download = async (row: UnifiedDoc) => {
    const caminho = row.viaFisica?.path ?? row.file_path;
    if (!caminho) return toast.error("Arquivo indisponível");
    const { data, error } = await supabase.storage.from(row.bucket).createSignedUrl(caminho, 60);
    if (error || !data) return toast.error("Erro ao gerar link");
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = row.titulo || "documento";
    a.rel = "noopener noreferrer";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  /** Recarrega histórico e painel de conferência (as pendências derivam dos documentos). */
  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ["dp_historico_unified"] });
    queryClient.invalidateQueries({ queryKey: ["dp_doc_consistencia_janela"] });
    queryClient.invalidateQueries({ queryKey: ["dp_documentos"] });
  };

  const confirmarExclusao = async () => {
    if (!excluir) return;
    setExcluindo(true);
    try {
      await excluirDocumentoHistorico(excluir.id, excluir.file_path, {
        companyId: selectedCompanyId ?? "",
        titulo: excluir.titulo,
        tipo: excluir.tipo_label,
        competencia: excluir.competencia,
        colaborador_id: excluir.colaborador_id,
        colaborador_nome: excluir.colaborador_nome,
        unidade_id: excluir.unidade_id,
        unidade_nome: excluir.unidade_nome,
        motivo: motivoExclusao.trim() || null,
      });
      toast.success("Documento excluído. A pendência voltará a aparecer na Conferência.");
      setExcluir(null);
      setMotivoExclusao("");
      recarregar();
    } catch (e: any) {
      notifyError(e, { surface: "Histórico", action: "concluir a ação", fallback: "Falha ao excluir o documento" });
    } finally {
      setExcluindo(false);
    }
  };


  const abrirSubstituir = (r: UnifiedDoc) => setSubstituir({
    rowId: r.id,
    titulo: r.titulo,
    tipo_key: r.tipo_key,
    colaborador_id: r.colaborador_id,
    colaborador_nome: r.colaborador_nome,
    competencia: r.competencia,
    file_path: r.file_path,
    unidade_id: r.unidade_id,
    unidade_nome: r.unidade_nome,
  });


  const tiposDoSelect = grupo === "all"
    ? DP_DOC_GRUPOS
    : DP_DOC_GRUPOS.filter((g) => g.grupo === grupo);

  const renderColunaHeader = (k: ColKey) => (
    <DpTableColumnHeader
      key={k}
      label={COLS[k].label}
      width={colWidths[k]}
      center={COLS[k].center}
      sortAtivo={sortKey === COLS[k].sortKey}
      sortDir={sortDir}
      onSort={(dir) => aplicarSort(COLS[k].sortKey, dir)}
      onResetSort={() => aplicarSort("default", "desc")}
      ativos={colFilters[k]}
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
  );



  return (
    <DpPage>
      <Helmet><title>Histórico — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={FileText}
        title="Histórico"
        description="Visualize todos os documentos de todos os colaboradores em um único lugar."
        actions={
          <>
            <DpTableColumnsMenu
              columns={DEFAULT_COL_ORDER.map((k) => ({ key: k, label: COLS[k].label }))}
              hidden={hidden}
              essentialKeys={["colaborador"]}
              onToggle={toggleHidden}
              onReset={resetLayout}
            />
            <DpSalvarLargurasButton screenKey="dp_historico_documentos" colOrder={colOrder} colWidths={colWidths} />
            <Button variant="outline" onClick={() => setLogAberto(true)}>
              <HistoryIcon className="mr-1 h-4 w-4" /> Registro de Alterações
            </Button>
          </>
        }

      />
      <DpDocumentosAbas />


      {/* Barra de naturezas: somente os grupos */}
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Natureza do Documento</div>
          {grupo !== "all" && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setGrupo("all"); setTipo("all"); }}>
              Limpar Natureza
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { setGrupo("all"); setTipo("all"); }}
            className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${
              grupo === "all" ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            Todos
          </button>
          {DP_DOC_GRUPOS.map((g) => (
            <button
              key={g.grupo}
              type="button"
              onClick={() => { setGrupo(grupo === g.grupo ? "all" : g.grupo); setTipo("all"); }}
              className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${
                grupo === g.grupo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <DpFilterCard>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="text-sm font-semibold sm:w-20">Filtros</div>
          <div className="relative flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome, tipo ou unidade..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />

          </div>
          <Button variant="ghost" className="sm:ml-auto" onClick={limpar}>Limpar</Button>
        </div>

        {/* Celular: filtros recolhidos e escolha da ordem da lista */}
        <div className="mb-3 flex items-center gap-2 md:hidden">
          <Button
            variant="outline"
            size="sm"
            className="min-h-10 flex-1 justify-between"
            aria-expanded={filtrosAbertos}
            onClick={() => {
              const proximo = !filtrosAbertos;
              setFiltrosAbertos(proximo);
              try {
                localStorage.setItem("dp_historico_filtros_mobile", proximo ? "1" : "0");
              } catch { /* preferência é opcional */ }
            }}
          >
            <span className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtros{filtrosAtivos > 0 ? ` (${filtrosAtivos})` : ""}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${filtrosAbertos ? "rotate-180" : ""}`} />
          </Button>
          <Select value={ordemMobile} onValueChange={aplicarOrdemMobile}>
            <SelectTrigger className="min-h-10 flex-1">
              <span className="flex items-center gap-2 truncate">
                <ArrowDownUp className="h-4 w-4 shrink-0" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {ORDENS_MOBILE.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={`${filtrosAbertos ? "grid" : "hidden md:grid"} gap-3 md:grid-cols-3 lg:grid-cols-5`}>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Pendência</Label>
            <Select value={pendencia} onValueChange={(v) => setPendencia(v as typeof pendencia)}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="assinatura">Falta Assinar / Via Assinada</SelectItem>
                <SelectItem value="comprovante">Falta Comprovante</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {tiposDoSelect.map((g) => (
                  <SelectGroup key={g.grupo}>
                    <SelectLabel>{g.label}</SelectLabel>
                    {g.tipos.filter((t) => t.value !== "ferias" && t.value !== "sindicato").map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Unidade</Label>
            <Select value={unidadeId} onValueChange={setUnidadeId}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(unidades.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Colaborador</Label>
            <Select value={colabId} onValueChange={setColabId}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(colabs.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Mês</Label>
            <Select value={mes} onValueChange={setMes}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {MESES.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1).padStart(2, "0")}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Ano</Label>
            <Select value={ano} onValueChange={setAno}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {anosDisponiveis.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

      </DpFilterCard>

      <DpContentCard contentClassName="p-0 hidden md:block">
        {query.isLoading ? (
          <div className="p-4">
            <TableSkeleton
              columns={6}
              headers={["Colaborador", "Tipo", "Competência", "Unidade", "Aceite", "Ações"]}
            />
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
          <Table className="table-fixed" style={{ width: "100%", minWidth: larguraTotal }}>
            <TableHeader>
              <TableRow>
                {visibleOrder.map((k) => renderColunaHeader(k))}
                <TableHead className="uppercase text-xs text-center" style={{ width: ACOES_WIDTH }}>Ações</TableHead>
              </TableRow>
            </TableHeader>


            <TableBody>
              {paged.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => setDetalhe(r)}
                  title="Ver detalhes do documento"
                >
                  {visibleOrder.map((k) => (
                    <TableCell
                      key={k}
                      className={COLS[k].cellClass}
                      style={{ width: colWidths[k], maxWidth: colWidths[k] }}
                    >
                      {COLS[k].render(r)}
                    </TableCell>
                  ))}
                  <TableCell className="align-middle" style={{ width: ACOES_WIDTH }} onClick={(e) => e.stopPropagation()}>
                    <div className="grid grid-cols-2 gap-0.5 justify-items-center">
                      <Button aria-label="Visualizar documento" size="icon" variant="ghost" className="h-8 w-8" title="Pré-visualizar" onClick={() => setPreview(r)} disabled={!r.file_path}>
                        <Eye className="h-4 w-4 text-primary" />
                      </Button>
                      <Button aria-label="Baixar documento" size="icon" variant="ghost" className="h-8 w-8" title="Baixar" onClick={() => download(r)} disabled={!r.file_path}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {r.id.startsWith("doc:") && r.tem_comprovante && (
                        <Button aria-label="Baixar comprovante de pagamento" size="icon" variant="ghost" className="h-8 w-8" title="Baixar Comprovante" onClick={() => baixarComprovante(r)}>
                          <Receipt className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                      <Button aria-label="Substituir arquivo documento" size="icon" variant="ghost" className="h-8 w-8" title="Substituir arquivo" onClick={() => abrirSubstituir(r)}>
                        <Replace className="h-4 w-4" />
                      </Button>
                      <Button aria-label="Excluir documento" size="icon" variant="ghost" className="h-8 w-8" title="Excluir documento" onClick={() => setExcluir(r)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                      {r.id.startsWith("doc:") && r.viaFisica && (
                        <ViaAssinadaBotao documentoId={r.id.slice(4)} companyId={selectedCompanyId ?? null} colaboradorId={r.colaborador_id} temVia={!!r.viaFisica.path} className="h-8 w-8" onDone={recarregar} />
                      )}
                      {r.id.startsWith("doc:") && (
                        <ComprovanteAcaoBotao
                          alvo={{ documentoId: r.id.slice(4), colaboradorId: r.colaborador_id, tipo: r.tipo_key }}
                          temComprovante={!!r.tem_comprovante}
                          documentoTitulo={r.titulo}
                          colaboradorNome={r.colaborador_nome}
                          competencia={r.competencia}
                          className="h-8 w-8 p-0"
                        />
                      )}
                      <QuitacaoSelo q={r.quitacao} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={visibleOrder.length + 1} className="text-center text-muted-foreground py-10">
                    Nenhum documento encontrado com esses filtros.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        )}
      </DpContentCard>



      {/* Mobile: lista de cards */}
      <div className="md:hidden space-y-3">
        {query.isLoading && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Carregando…</div>
        )}
        {!query.isLoading && paged.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Nenhum documento encontrado com esses filtros.
          </div>
        )}
        {!query.isLoading && paged.map((r) => (
          <div key={r.id} className="rounded-2xl border border-border bg-card p-4 space-y-2 active:scale-[0.98] transition-transform">
            <button type="button" className="w-full text-left" onClick={() => setDetalhe(r)}>
              <div className="min-w-0">
                <div className="font-semibold truncate">{r.colaborador_nome}</div>
                <div className="text-[11px] text-muted-foreground truncate">{r.unidade_nome}</div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <Badge variant="outline" className={tipoBadgeClass(r.tipo_key) + " text-[10px]"}>{r.tipo_label}</Badge>
                <span className="font-mono text-muted-foreground">Comp. {r.competencia}</span>
                <AssinaturaSelo r={r} />
              </div>
            </button>

            <div className="pt-1 border-t border-border/60 space-y-1">
              <div className="grid grid-cols-3 gap-1">
                <Button size="sm" variant="ghost" className="min-h-11 px-1" onClick={() => setPreview(r)} disabled={!r.file_path}>
                  <Eye className="h-4 w-4 mr-1 text-primary" /> Ver
                </Button>
                {r.id.startsWith("doc:") ? (
                  <div className="relative flex">
                    {r.tem_comprovante && r.quitacao && r.quitacao.status !== "sem_referencia" ? (
                      <span
                        aria-label={r.quitacao.status === "menor" || r.quitacao.status === "maior" ? "Valor divergente" : "Valor conferido"}
                        title={fraseConferenciaValor(r.quitacao) ?? undefined}
                        className={`pointer-events-none absolute right-1 top-1 z-10 text-[10px] font-bold leading-none ${r.quitacao.status === "menor" || r.quitacao.status === "maior" ? "text-amber-600" : "text-emerald-600"}`}
                      >
                        {r.quitacao.status === "menor" || r.quitacao.status === "maior" ? "⚠" : "✓"}
                      </span>
                    ) : null}
                    <ComprovanteAcaoBotao
                      alvo={{ documentoId: r.id.slice(4), colaboradorId: r.colaborador_id, tipo: r.tipo_key }}
                      temComprovante={!!r.tem_comprovante}
                      documentoTitulo={r.titulo}
                      colaboradorNome={r.colaborador_nome}
                      competencia={r.competencia}
                      rotulo="Comprovante"
                      className="min-h-11 w-full px-1"
                    />
                  </div>
                ) : <span />}
                <Button size="sm" variant="ghost" className="min-h-11 px-1" onClick={() => download(r)} disabled={!r.file_path}>
                  <Download className="h-4 w-4 mr-1" /> Baixar
                </Button>
              </div>
              {r.id.startsWith("doc:") && r.tem_comprovante && (
                <Button size="sm" variant="outline" className="min-h-11 w-full" onClick={() => baixarComprovante(r)}>
                  <Receipt className="h-4 w-4 mr-1" /> Baixar Comprovante
                </Button>
              )}
              {r.id.startsWith("doc:") && r.viaFisica && (
                <ViaAssinadaBotao rotulo documentoId={r.id.slice(4)} companyId={selectedCompanyId ?? null} colaboradorId={r.colaborador_id} temVia={!!r.viaFisica.path} className="min-h-11 w-full" onDone={recarregar} />
              )}
              <div className="grid grid-cols-2 gap-1">
                <Button size="sm" variant="ghost" className="min-h-11 text-destructive" onClick={() => setExcluir(r)}>
                  <Trash2 className="h-4 w-4 mr-1" /> Excluir
                </Button>
                <Button size="sm" variant="ghost" className="min-h-11" onClick={() => abrirSubstituir(r)}>
                  <Replace className="h-4 w-4 mr-1" /> Substituir
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {sorted.length === 0 ? 0 : (page - 1) * pageSize + 1}
            –{Math.min(page * pageSize, sorted.length)} de {sorted.length}
          </span>
          <span>·</span>
          <span>Total: {query.data?.length ?? 0}</span>
          <span>·</span>
          <span>Por página:</span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-7 w-[70px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button aria-label="Primeira página" size="icon" variant="outline" onClick={() => setPage(1)} disabled={page === 1}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button aria-label="Mês anterior" size="icon" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-3 text-sm">Página {page} de {totalPages}</span>
          <Button aria-label="Mês seguinte" size="icon" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button aria-label="Última página" size="icon" variant="outline" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DocumentPreview
        open={!!preview}
        onOpenChange={(v) => { if (!v) setPreview(null); }}
        title={preview?.titulo}
        bucket={preview?.bucket}
        path={certPreview ? undefined : preview?.viaFisica?.path ?? preview?.file_path ?? undefined}
        url={certPreview?.url}
        mime={certPreview ? "application/pdf" : preview?.viaFisica?.path ? preview.viaFisica.mime : preview?.mime_type}
        acaoRodape={(() => {
          const lista = Array.isArray(query.data) ? (query.data as UnifiedDoc[]) : [];
          const atual = preview ? lista.find((r) => r.id === preview.id) ?? preview : null;
          if (!atual || !atual.id.startsWith("doc:") || !aceitaComprovante(atual.tipo_key)) return null;
          if (atual.tem_comprovante) {
            return (
              <Button size="sm" variant="outline" onClick={() => baixarComprovante(atual)}>
                <Download className="h-4 w-4 mr-2" /> Baixar Comprovante
              </Button>
            );
          }
          return (
            <Button size="sm" onClick={() => setAnexarDoPreview(true)}>
              <Upload className="h-4 w-4 mr-2" /> Importar Comprovante
            </Button>
          );
        })()}
        // Documento aprovado: aguarda o certificado; o original só entra se ele falhar.
        aguardando={certStatus === "carregando" && !certPreview ? "Carregando validação digital..." : null}
        // O comprovante fica sempre visível abaixo do documento.
        comprovanteDocumentoId={preview?.comprovante_path && preview.id.startsWith("doc:") ? preview.id.slice(4) : null}
        comprovantesExtras={extrasPreview.map((e) => ({ id: e.id, path: e.file_path, mime: e.mime_type ?? null }))}
        toolbar={preview && (preview.aceite !== null || preview.aceiteDispensado || preview.viaFisica || preview.quitacao) ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <AssinaturaSelo r={preview} longo />
            <QuitacaoSelo q={preview.quitacao} />
          </div>
        ) : null}
      />

      {preview && preview.id.startsWith("doc:") && (
        <ComprovanteAnexarDialog
          open={anexarDoPreview}
          onOpenChange={(v) => {
            setAnexarDoPreview(v);
            if (!v) queryClient.invalidateQueries({ queryKey: ["dp_historico_unified"] });
          }}
          alvo={{ documentoId: preview.id.slice(4), colaboradorId: preview.colaborador_id, tipo: preview.tipo_key }}
          documentoTitulo={preview.titulo}
          colaboradorNome={preview.colaborador_nome}
          competencia={preview.competencia}
        />
      )}

      <DocSubstituirDialog
        target={substituir}
        companyId={selectedCompanyId ?? null}
        colaboradores={(colabs.data ?? []).map((c) => ({ id: c.id, nome: c.nome }))}
        onOpenChange={(v) => { if (!v) setSubstituir(null); }}
        onDone={recarregar}
      />

      <DocDetalhesDialog
        target={detalhe ? {
          rowId: detalhe.id,
          colaborador_id: detalhe.colaborador_id,
          titulo: detalhe.titulo,
          tipo_key: detalhe.tipo_key,
          tipo_label: detalhe.tipo_label,
          competencia: detalhe.competencia,
          colaborador_nome: detalhe.colaborador_nome,
          unidade_nome: detalhe.unidade_nome,
          data: detalhe.data,
          file_path: detalhe.file_path ?? null,
          aceite: detalhe.aceite ?? null,
        } : null}
        companyId={selectedCompanyId ?? null}
        onOpenChange={(v) => { if (!v) setDetalhe(null); }}
        onPreview={() => { const d = detalhe; setDetalhe(null); if (d) setPreview(d); }}
        onDownload={() => { if (detalhe) download(detalhe); }}
        onSubstituir={() => { const d = detalhe; setDetalhe(null); if (d) abrirSubstituir(d); }}
        onExcluir={() => { const d = detalhe; setDetalhe(null); if (d) setExcluir(d); }}
      />

      <DocEventosDialog
        open={logAberto}
        companyId={selectedCompanyId ?? null}
        onOpenChange={setLogAberto}
      />


      <AlertDialog open={!!excluir} onOpenChange={(v) => { if (!v) { setExcluir(null); setMotivoExclusao(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Documento?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {excluir ? `${docSourceConfig(excluir.id).label} · ${excluir.tipo_label} · ${excluir.colaborador_nome} · ${excluir.competencia}` : ""}
                </p>
                <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800">
                  O arquivo será apagado definitivamente e a pendência deste documento voltará a
                  aparecer na Conferência de Competências. A exclusão fica registrada no log.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Motivo da Exclusão</Label>
            <Textarea
              rows={2}
              placeholder="Ex.: arquivo importado na competência errada"
              value={motivoExclusao}
              onChange={(e) => setMotivoExclusao(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); confirmarExclusao(); }}
              disabled={excluindo}
            >
              {excluindo ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>

  );
}
