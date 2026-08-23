import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Eye, Download, Search, ArrowUp, ArrowDown, ChevronsUpDown,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, Trash2, Replace,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
import { DP_DOC_TIPOS, DP_DOC_GRUPOS, docTipoBadgeClass, docTipoGrupo } from "@/lib/dp/documentoTipos";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DocSubstituirDialog, type DocSubstituirTarget } from "@/components/dp/documentos/DocSubstituirDialog";
import { docSourceConfig, excluirDocumentoHistorico } from "@/lib/dp/historicoDocAcoes";

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
  /** Validação digital dispensada porque o documento já veio assinado. */
  aceiteDispensado?: boolean;
};

const TIPO_OPTIONS = [
  ...DP_DOC_TIPOS.filter((t) => t.value !== "sindicato").map((t) => ({ value: t.value as string, label: t.label })),
  { value: "act_cct", label: "Negociação Sindical" },
];

const STATUS_OPTIONS = [
  { value: "aprovado", label: "Aprovado" },
  { value: "pendente", label: "Pendente" },
  { value: "recusado", label: "Recusado" },
  { value: "disponivel", label: "Disponível" },
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

function statusBadgeClass(key: string) {
  switch (key) {
    case "aprovado":
    case "disponivel":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "pendente":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "recusado":
      return "bg-rose-100 text-rose-700 border-rose-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function tipoBadgeClass(key: string) {
  if (key === "act_cct") return "border-rose-300 text-rose-700";
  return docTipoBadgeClass(key);
}

type ColKey = "colaborador" | "tipo" | "competencia" | "unidade" | "status" | "aceite" | "data";
type SortKey = "colaborador_nome" | "tipo_label" | "competencia_sort" | "unidade_nome" | "status_label" | "aceite_label" | "data";

const COL_ORDER_STORAGE = "dp_historico_col_order";
const DEFAULT_COL_ORDER: ColKey[] = ["colaborador", "tipo", "competencia", "unidade", "status", "aceite", "data"];

function aceiteLabel(r: UnifiedDoc) {
  if (r.aceite === null) return r.aceiteDispensado ? "Dispensado" : "—";
  return r.aceite ? "Aceito" : "Aguardando";
}

/** Cabeçalho de coluna com menu de ordenação + filtro por valores e suporte a arrastar. */
function ColunaFiltroHeader(props: {
  label: string;
  width: string;
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
}) {
  const [buscaOpcao, setBuscaOpcao] = useState("");
  const opcoes = props.getOpcoes().filter((o) =>
    o.toLowerCase().includes(buscaOpcao.trim().toLowerCase()),
  );
  return (
    <TableHead
      className={`uppercase text-xs select-none ${props.width} ${props.arrastando ? "opacity-50" : ""}`}
      draggable
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
            className="flex w-full cursor-grab items-center gap-1 text-left uppercase hover:text-foreground"
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
    </TableHead>
  );
}

export default function DpHistoricoCompleto() {

  const { selectedCompanyId } = useCompanyContext();
  const colabs = useDpColaboradores();
  const unidades = useDpUnidades();

  const [tipo, setTipo] = useState("all");
  const [grupo, setGrupo] = useState("all");
  const [colFilters, setColFilters] = useState<Record<ColKey, string[]>>({
    colaborador: [], tipo: [], competencia: [], unidade: [], status: [], aceite: [], data: [],
  });
  const [unidadeId, setUnidadeId] = useState("all");
  const [colabId, setColabId] = useState("all");
  const [mes, setMes] = useState("all");
  const [ano, setAno] = useState("all");
  const [status, setStatus] = useState("all");
  const [busca, setBusca] = useState("");
  const [preview, setPreview] = useState<UnifiedDoc | null>(null);
  const [excluir, setExcluir] = useState<UnifiedDoc | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [substituir, setSubstituir] = useState<DocSubstituirTarget | null>(null);
  const queryClient = useQueryClient();

  const [sortKey, setSortKey] = useState<SortKey>("data");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [colOrder, setColOrder] = useState<ColKey[]>(() => {
    try {
      const raw = localStorage.getItem(COL_ORDER_STORAGE);
      if (raw) {
        const parsed = JSON.parse(raw) as ColKey[];
        const validos = parsed.filter((k) => DEFAULT_COL_ORDER.includes(k));
        const faltantes = DEFAULT_COL_ORDER.filter((k) => !validos.includes(k));
        if (validos.length) return [...validos, ...faltantes];
      }
    } catch { /* ignora storage inválido */ }
    return DEFAULT_COL_ORDER;
  });
  const [dragCol, setDragCol] = useState<ColKey | null>(null);

  useEffect(() => {
    try { localStorage.setItem(COL_ORDER_STORAGE, JSON.stringify(colOrder)); } catch { /* noop */ }
  }, [colOrder]);

  const colabMap = useMemo(() => {
    const m = new Map<string, { nome: string; unidade_id: string | null; unidade_nome: string | null }>();
    (colabs.data ?? []).forEach((c) => {
      m.set(c.id, { nome: c.nome, unidade_id: (c as any).unidade_id ?? null, unidade_nome: c.unidade_nome ?? null });
    });
    return m;
  }, [colabs.data]);

  const unidadeMap = useMemo(() => {
    const m = new Map<string, string>();
    (unidades.data ?? []).forEach((u) => m.set(u.id, u.nome));
    return m;
  }, [unidades.data]);

  const query = useQuery({
    queryKey: ["dp_historico_unified", selectedCompanyId],
    enabled: !!selectedCompanyId && !!colabs.data,
    queryFn: async (): Promise<UnifiedDoc[]> => {
      const cId = selectedCompanyId!;
      const [docsRes, solRes, sindRes, discRes, aceitesRes] = await Promise.all([
        supabase
          .from("dp_documentos")
          .select("id, titulo, tipo, referencia_data, file_path, mime_type, created_at, colaborador_id, aprovacao_status, exige_aceite, assinatura_detectada")
          .eq("company_id", cId),
        supabase
          .from("dp_solicitacoes")
          .select("id, tipo, status, data_alvo, arquivo_path, created_at, colaborador_id")
          .eq("company_id", cId)
          .eq("tipo", "atestado" as any),
        supabase
          .from("dp_sindicato_negociacoes")
          .select("id, arquivo_nome, pdf_path, ano, mes, data_base, tipo_documento, unidade_id, created_at, dp_unidades(nome)")
          .eq("company_id", cId),
        supabase
          .from("dp_registros_disciplinares")
          .select("id, motivo, tipo, data, pdf_storage_path, created_at, colaborador_id")
          .eq("company_id", cId),
        supabase
          .from("dp_documento_aceites")
          .select("documento_id")
          .eq("company_id", cId)
          .not("documento_id", "is", null),
      ]);

      const aceitos = new Set((aceitesRes.data ?? []).map((a: any) => a.documento_id as string));

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
          tipo_label: TIPO_OPTIONS.find((t) => t.value === d.tipo)?.label ?? d.tipo,
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
          aceiteDispensado: !d.exige_aceite && d.assinatura_detectada === true,
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
          bucket: "dp-atestados",
          file_path: s.arquivo_path,
          titulo: `Atestado — ${c?.nome ?? ""}`.trim(),
          aceite: null,
        });
      });

      (sindRes.data ?? []).forEach((n: any) => {
        if (!n.pdf_path) return;
        const unidadeNome = n.dp_unidades?.nome ?? (n.unidade_id ? unidadeMap.get(n.unidade_id) ?? "—" : "—");
        const mm = n.mes ? String(n.mes).padStart(2, "0") : (n.data_base ? String(new Date(n.data_base).getMonth() + 1).padStart(2, "0") : "");
        const yyyy = n.ano ?? (n.data_base ? new Date(n.data_base).getFullYear() : "");
        const compLabel = mm && yyyy ? `${mm}/${yyyy}` : "—";
        const compSort = mm && yyyy ? `${yyyy}-${mm}` : "";
        rows.push({
          id: `sind:${n.id}`,
          colaborador_nome: `ACT/CCT - ${unidadeNome}`,
          colaborador_id: null,
          tipo_key: "act_cct",
          tipo_label: "ACT/CCT",
          competencia: compLabel,
          competencia_sort: compSort,
          unidade_nome: unidadeNome,
          unidade_id: n.unidade_id,
          status_key: "disponivel",
          status_label: "Disponível",
          data: n.created_at,
          bucket: "dp-sindicato",
          file_path: n.pdf_path,
          titulo: n.arquivo_nome ?? `Negociação Sindical ${unidadeNome}`,
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

  // ---------------- Descritores de coluna ----------------
  const COLS: Record<ColKey, {
    label: string;
    width: string;
    sortKey: SortKey;
    value: (r: UnifiedDoc) => string;
    render: (r: UnifiedDoc) => JSX.Element;
    cellClass?: string;
  }> = {
    colaborador: {
      label: "Colaborador", width: "w-[230px]", sortKey: "colaborador_nome",
      value: (r) => r.colaborador_nome,
      render: (r) => <span className="font-semibold" title={r.colaborador_nome}>{r.colaborador_nome}</span>,
      cellClass: "truncate",
    },
    tipo: {
      label: "Tipo", width: "w-[190px]", sortKey: "tipo_label",
      value: (r) => r.tipo_label,
      render: (r) => (
        <Badge variant="outline" className={`max-w-full truncate ${tipoBadgeClass(r.tipo_key)}`}>{r.tipo_label}</Badge>
      ),
      cellClass: "truncate",
    },
    competencia: {
      label: "Competência", width: "w-[150px]", sortKey: "competencia_sort",
      value: (r) => r.competencia,
      render: (r) => <span className="font-mono text-sm">{r.competencia}</span>,
      cellClass: "whitespace-nowrap",
    },
    unidade: {
      label: "Unidade", width: "w-[180px]", sortKey: "unidade_nome",
      value: (r) => r.unidade_nome,
      render: (r) => <span title={r.unidade_nome}>{r.unidade_nome}</span>,
      cellClass: "truncate",
    },
    status: {
      label: "Status", width: "w-[140px]", sortKey: "status_label",
      value: (r) => r.status_label,
      render: (r) => (
        <Badge variant="outline" className={`max-w-full truncate ${statusBadgeClass(r.status_key)}`}>{r.status_label}</Badge>
      ),
      cellClass: "truncate",
    },
    aceite: {
      label: "Aceite", width: "w-[140px]", sortKey: "aceite_label",
      value: (r) => aceiteLabel(r),
      render: (r) => (
        r.aceite === null
          ? (r.aceiteDispensado
              ? <Badge variant="outline" className="border-sky-300 text-sky-700 text-[11px]">Dispensado</Badge>
              : <span className="text-xs text-muted-foreground">—</span>)
          : r.aceite
            ? <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[11px]">Aceito</Badge>
            : <Badge variant="outline" className="border-amber-300 text-amber-700 text-[11px]">Aguardando</Badge>
      ),
      cellClass: "truncate",
    },
    data: {
      label: "Data", width: "w-[120px]", sortKey: "data",
      value: (r) => new Date(r.data).toLocaleDateString("pt-BR"),
      render: (r) => (
        <span className="font-mono text-sm text-muted-foreground">{new Date(r.data).toLocaleDateString("pt-BR")}</span>
      ),
      cellClass: "whitespace-nowrap",
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
      if (status !== "all" && r.status_key !== status) return false;
      if (ano !== "all" && !r.competencia_sort.startsWith(ano)) return false;
      if (mes !== "all" && r.competencia_sort.slice(5, 7) !== mes) return false;
      if (q) {
        const hay = `${r.colaborador_nome} ${r.tipo_label} ${r.status_label} ${r.unidade_nome} ${r.titulo}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [query.data, tipo, grupo, unidadeId, colabId, mes, ano, status, busca]);

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

  const toggleColValue = (k: ColKey, v: string) =>
    setColFilters((prev) => {
      const sel = prev[k];
      return { ...prev, [k]: sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v] };
    });

  // ---------------- Ordenação ----------------
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const get = (r: UnifiedDoc) => (sortKey === "aceite_label" ? aceiteLabel(r) : ((r as any)[sortKey] ?? ""));
    arr.sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const aplicarSort = (key: SortKey, dir: "asc" | "desc") => { setSortKey(key); setSortDir(dir); };

  // ---------------- Paginação ----------------
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => { setPage(1); }, [tipo, grupo, unidadeId, colabId, mes, ano, status, busca, pageSize, colFilters]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const paged = useMemo(() => sorted.slice((page - 1) * pageSize, page * pageSize), [sorted, page, pageSize]);

  const limpar = () => {
    setTipo("all"); setGrupo("all"); setUnidadeId("all"); setColabId("all");
    setMes("all"); setAno("all"); setStatus("all"); setBusca("");
    setColFilters({ colaborador: [], tipo: [], competencia: [], unidade: [], status: [], aceite: [], data: [] });
  };

  const download = async (row: UnifiedDoc) => {
    if (!row.file_path) return toast.error("Arquivo indisponível");
    const { data, error } = await supabase.storage.from(row.bucket).createSignedUrl(row.file_path, 60);
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
      await excluirDocumentoHistorico(excluir.id, excluir.file_path);
      toast.success("Documento excluído. A pendência voltará a aparecer na Conferência.");
      setExcluir(null);
      recarregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir o documento");
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
  });

  // ---------------- Drag & drop de colunas ----------------
  const soltarSobre = (alvo: ColKey) => {
    if (!dragCol || dragCol === alvo) return setDragCol(null);
    setColOrder((prev) => {
      const arr = prev.filter((k) => k !== dragCol);
      const idx = arr.indexOf(alvo);
      arr.splice(idx, 0, dragCol);
      return arr;
    });
    setDragCol(null);
  };

  const tiposDoSelect = grupo === "all"
    ? DP_DOC_GRUPOS
    : DP_DOC_GRUPOS.filter((g) => g.grupo === grupo);

  const renderColunaHeader = (k: ColKey) => (
    <ColunaFiltroHeader
      key={k}
      label={COLS[k].label}
      width={COLS[k].width}
      sortAtivo={sortKey === COLS[k].sortKey}
      sortDir={sortDir}
      onSort={(dir) => aplicarSort(COLS[k].sortKey, dir)}
      ativos={colFilters[k]}
      getOpcoes={() => opcoesColuna(k)}
      onToggle={(v) => toggleColValue(k, v)}
      onSelecionarTodos={() => setColFilters((p) => ({ ...p, [k]: opcoesColuna(k) }))}
      onLimpar={() => setColFilters((p) => ({ ...p, [k]: [] }))}
      arrastando={dragCol === k}
      onDragStart={() => setDragCol(k)}
      onDrop={() => soltarSobre(k)}
      onDragEnd={() => setDragCol(null)}
    />
  );


  return (
    <DpPage>
      <Helmet><title>Histórico — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={FileText}
        title="Histórico"
        description="Visualize todos os documentos de todos os colaboradores em um único lugar."
      />

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
              placeholder="Buscar por nome, tipo ou status..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Button variant="ghost" className="sm:ml-auto" onClick={limpar}>Limpar</Button>
        </div>


        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Tipo</Label>
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
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Unidade</Label>
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
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Colaborador</Label>
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
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Mês</Label>
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
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Ano</Label>
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
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
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
              columns={8}
              headers={["Colaborador", "Tipo", "Competência", "Unidade", "Status", "Aceite", "Data", "Ações"]}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
          <Table className="w-full min-w-[1300px] table-fixed">
            <TableHeader>
              <TableRow>
                {colOrder.map((k) => renderColunaHeader(k))}
                <TableHead className="uppercase text-xs text-right w-[150px]">Ações</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {paged.map((r) => (
                <TableRow key={r.id}>
                  {colOrder.map((k) => (
                    <TableCell key={k} className={COLS[k].cellClass}>{COLS[k].render(r)}</TableCell>
                  ))}
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="icon" variant="ghost" title="Pré-visualizar" onClick={() => setPreview(r)} disabled={!r.file_path}>
                      <Eye className="h-4 w-4 text-primary" />
                    </Button>
                    <Button size="icon" variant="ghost" title="Baixar" onClick={() => download(r)} disabled={!r.file_path}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" title="Substituir arquivo" onClick={() => abrirSubstituir(r)}>
                      <Replace className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" title="Excluir documento" onClick={() => setExcluir(r)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colOrder.length + 1} className="text-center text-muted-foreground py-10">
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
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{r.colaborador_nome}</div>
                <div className="text-[11px] text-muted-foreground truncate">{r.unidade_nome}</div>
              </div>
              <Badge variant="outline" className={statusBadgeClass(r.status_key) + " shrink-0 text-[10px]"}>
                {r.status_label}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <Badge variant="outline" className={tipoBadgeClass(r.tipo_key) + " text-[10px]"}>{r.tipo_label}</Badge>
              <span className="font-mono text-muted-foreground">Comp. {r.competencia}</span>
              <span className="font-mono text-muted-foreground">· {new Date(r.data).toLocaleDateString("pt-BR")}</span>
            </div>
            <div className="grid grid-cols-2 gap-1 pt-1 border-t border-border/60">
              <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setPreview(r)} disabled={!r.file_path}>
                <Eye className="h-4 w-4 mr-1 text-primary" /> Ver
              </Button>
              <Button size="sm" variant="ghost" className="min-h-11" onClick={() => download(r)} disabled={!r.file_path}>
                <Download className="h-4 w-4 mr-1" /> Baixar
              </Button>
              <Button size="sm" variant="ghost" className="min-h-11" onClick={() => abrirSubstituir(r)}>
                <Replace className="h-4 w-4 mr-1" /> Substituir
              </Button>
              <Button size="sm" variant="ghost" className="min-h-11 text-destructive" onClick={() => setExcluir(r)}>
                <Trash2 className="h-4 w-4 mr-1" /> Excluir
              </Button>
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
          <Button size="icon" variant="outline" onClick={() => setPage(1)} disabled={page === 1}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-3 text-sm">Página {page} de {totalPages}</span>
          <Button size="icon" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DocumentPreview
        open={!!preview}
        onOpenChange={(v) => { if (!v) setPreview(null); }}
        title={preview?.titulo}
        bucket={preview?.bucket}
        path={preview?.file_path ?? undefined}
        mime={preview?.mime_type}
      />

      <DocSubstituirDialog
        target={substituir}
        companyId={selectedCompanyId ?? null}
        colaboradores={(colabs.data ?? []).map((c) => ({ id: c.id, nome: c.nome }))}
        onOpenChange={(v) => { if (!v) setSubstituir(null); }}
        onDone={recarregar}
      />

      <AlertDialog open={!!excluir} onOpenChange={(v) => { if (!v) setExcluir(null); }}>
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
                  aparecer na Conferência de Competências.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
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
