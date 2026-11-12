import { Helmet } from "react-helmet-async";
import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle, Bug, Building2, CheckCircle2, ChevronDown, Copy, EyeOff, Headset, RefreshCw, RotateCcw, SlidersHorizontal, X,
} from "lucide-react";
import { toast } from "sonner";
import { DpPage, DpPageHeader, DpFilterCard, DpContentCard } from "@/components/dp/DpPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { podeConfirmarDecisao, resumoErros, temChamadoPendente } from "@/lib/admin/auditoriaErros";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { errorDetailsToText, separarDetalhes, usuarioLabel } from "@/lib/errorDetailsText";
import {
  useAppErrorLogs, useAppErrorStatus, useAppErrorReportStatus, FILTROS_ERRO_PADRAO,
  type AppErrorFiltros, type AppErrorLog,
} from "@/hooks/useAppErrorLogs";

const ORIGEM_LABEL: Record<AppErrorLog["source"], string> = {
  client: "Tela",
  database: "Banco de dados",
  edge: "Servidor",
  import: "Importação",
};

const GRAVIDADE_LABEL: Record<AppErrorLog["severity"], string> = {
  error: "Erro",
  warning: "Alerta",
  info: "Informação",
};

/** Como o suporte deve ler o registro: defeito para corrigir ou aviso esperado. */
const NATUREZA_LABEL: Record<AppErrorLog["severity"], string> = {
  error: "Falha do sistema",
  warning: "Aviso / regra",
  info: "Informação",
};

const PERIODO_LABEL: Record<string, string> = {
  "1": "24 horas", "7": "7 dias", "30": "30 dias", "90": "90 dias", "0": "Tudo",
};

const SITUACAO_LABEL: Record<AppErrorLog["status"], string> = {
  aberto: "Aberto",
  resolvido: "Resolvido",
  ignorado: "Ignorado",
};

function dataHora(iso: string) {
  return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function LinhaDetalhe({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  if (!valor || !String(valor).trim()) return null;
  return (
    <div className="flex flex-wrap gap-1">
      <span className="text-muted-foreground">{rotulo}:</span>
      <span className="min-w-0 break-words font-medium">{valor}</span>
    </div>
  );
}

function textoDetalhes(log: AppErrorLog) {
  return errorDetailsToText({
    message: log.message,
    surface: log.surface,
    action: log.action,
    route: log.route,
    source: ORIGEM_LABEL[log.source],
    severity: GRAVIDADE_LABEL[log.severity],
    code: log.code,
    userMessage: log.user_message,
    userName: log.user_name,
    userEmail: log.user_email,
    companyId: log.company_id,
    companyName: log.company_name,
    occurrences: log.occurrences,
    firstSeenAt: dataHora(log.first_seen_at),
    lastSeenAt: dataHora(log.last_seen_at),
    details: log.details,
  });
}

async function copiarDetalhes(log: AppErrorLog) {
  try {
    await navigator.clipboard.writeText(textoDetalhes(log));
    toast.success("Detalhes copiados.");
  } catch {
    toast.error("Não foi possível copiar. Abra os detalhes técnicos e selecione o texto.");
  }
}

/** Tudo que o suporte precisa para investigar: contexto, pilha e repetições. */
function DetalhesTecnicos({ log }: { log: AppErrorLog }) {
  const { stack, componentStack, agent, extra } = separarDetalhes(log.details);

  return (
    <details className="rounded-md border bg-muted/30 p-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
        <ChevronDown className="h-4 w-4" /> Detalhes técnicos
      </summary>
      <div className="mt-3 space-y-3 text-xs">
        <div className="grid gap-1.5 sm:grid-cols-2">
          <LinhaDetalhe rotulo="Tela" valor={log.surface ?? "Não identificada"} />
          <LinhaDetalhe rotulo="Ação" valor={log.action} />
          <LinhaDetalhe rotulo="Endereço" valor={log.route} />
          <LinhaDetalhe rotulo="Origem" valor={ORIGEM_LABEL[log.source]} />
          <LinhaDetalhe rotulo="Código" valor={log.code} />
          <LinhaDetalhe rotulo="Repetições" valor={`${log.occurrences}x`} />
          <LinhaDetalhe rotulo="Usuário" valor={usuarioLabel({ nome: log.user_name, email: log.user_email })} />
          <LinhaDetalhe rotulo="Empresa" valor={log.company_name ?? (log.company_id ? log.company_id : "Não identificada")} />
          <LinhaDetalhe rotulo="CNPJ" valor={log.company_cnpj} />
          <LinhaDetalhe rotulo="Primeira vez" valor={dataHora(log.first_seen_at)} />
          <LinhaDetalhe rotulo="Última vez" valor={dataHora(log.last_seen_at)} />
          <LinhaDetalhe rotulo="Navegador" valor={agent} />
        </div>
        <div>
          <p className="mb-1 font-semibold">Mensagem completa</p>
          <p className="whitespace-pre-wrap break-words rounded-md bg-background p-2">{log.message}</p>
        </div>
        {Object.keys(extra).length > 0 && (
          <div>
            <p className="mb-1 font-semibold">Contexto</p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background p-2">{JSON.stringify(extra, null, 2)}</pre>
          </div>
        )}
        {componentStack && (
          <div>
            <p className="mb-1 font-semibold">Componentes</p>
            <pre className="max-h-40 overflow-auto rounded-md bg-background p-2">{componentStack}</pre>
          </div>
        )}
        {stack ? (
          <div>
            <p className="mb-1 font-semibold">Pilha técnica</p>
            <pre className="max-h-56 overflow-auto rounded-md bg-background p-2">{stack}</pre>
          </div>
        ) : (
          <p className="text-muted-foreground">Sem pilha técnica gravada para este erro.</p>
        )}
        {(log.ocorrencias?.length ?? 0) > 0 && (
          <div>
            <p className="mb-1 font-semibold">Últimas ocorrências</p>
            <ul className="space-y-1">
              {log.ocorrencias?.map((oc) => (
                <li key={oc.id} className="break-words rounded-md bg-background p-2">
                  {dataHora(oc.created_at)} · {usuarioLabel({ nome: oc.user_name, email: oc.user_email })}
                  {oc.route ? ` · ${oc.route}` : ""}
                  {oc.code ? ` · código ${oc.code}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

function Metrica({
  rotulo, valor, destaque, ativo, onClick,
}: { rotulo: string; valor: number; destaque?: boolean; ativo?: boolean; onClick?: () => void }) {
  const conteudo = (
    <>
      <span className={cn("text-xl font-bold leading-none", destaque && valor > 0 && "text-destructive")}>{valor}</span>
      <span className="text-xs text-muted-foreground">{rotulo}</span>
    </>
  );
  const classe = cn(
    "flex min-h-[64px] flex-col items-start justify-center gap-1 rounded-lg border bg-card p-3 text-left",
    destaque && valor > 0 && "border-destructive/40 bg-destructive/5",
    ativo && "ring-2 ring-primary",
  );
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={ativo} className={cn(classe, "transition-colors hover:bg-muted/50")}>
      {conteudo}
    </button>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

type Decisao = { ids: string[]; status: "resolvido" | "ignorado" };

/** Tela do Backoffice: erros de todas as empresas da plataforma. */
export default function AdminAuditoriaErros() {
  const isMobile = useIsMobile();
  const [filtros, setFiltros] = useState<AppErrorFiltros>({
    ...FILTROS_ERRO_PADRAO, todasEmpresas: true, empresaId: "todas", comChamados: false,
  });
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useAppErrorLogs(filtros);
  const atualizar = useAppErrorStatus();
  const atualizarChamado = useAppErrorReportStatus();
  const [decisao, setDecisao] = useState<Decisao | null>(null);
  const [nota, setNota] = useState("");
  const [chamado, setChamado] = useState<{ id: string; status: "aberto" | "em_analise" | "resolvido" | "ignorado" } | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  // Empresas já vistas: o seletor não encolhe quando uma empresa é filtrada.
  const [empresas, setEmpresas] = useState<Map<string, string>>(new Map());

  const linhas = useMemo(() => data ?? [], [data]);
  const resumo = useMemo(() => resumoErros(linhas), [linhas]);

  useEffect(() => {
    setEmpresas((prev) => {
      let mudou = false;
      const next = new Map(prev);
      linhas.forEach((l) => {
        if (l.company_id && !next.has(l.company_id)) {
          next.set(l.company_id, l.company_name ?? "Empresa sem nome");
          mudou = true;
        }
      });
      return mudou ? next : prev;
    });
    // Seleção só vale para o que está na lista.
    setSelecionados((prev) => {
      const visiveis = new Set(linhas.map((l) => l.id));
      const next = new Set([...prev].filter((id) => visiveis.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [linhas]);

  const empresasOrdenadas = useMemo(
    () => [...empresas.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")),
    [empresas],
  );

  const set = <K extends keyof AppErrorFiltros>(k: K, v: AppErrorFiltros[K]) =>
    setFiltros((prev) => ({ ...prev, [k]: v }));

  const resumoFiltros = [
    PERIODO_LABEL[String(filtros.dias)] ?? `${filtros.dias} dias`,
    filtros.status === "todos" ? "Todas as situações" : SITUACAO_LABEL[filtros.status] + "s",
    filtros.severity !== "todos" ? GRAVIDADE_LABEL[filtros.severity] : null,
    filtros.source !== "todos" ? ORIGEM_LABEL[filtros.source] : null,
    filtros.empresaId === "sem" ? "Sem empresa" : filtros.empresaId && filtros.empresaId !== "todas" ? empresas.get(filtros.empresaId) : null,
    filtros.comChamados ? "Com chamados" : null,
  ].filter(Boolean).join(" · ");

  const selecionadosLista = linhas.filter((l) => selecionados.has(l.id));
  const algumFechado = selecionadosLista.some((l) => l.status !== "aberto");
  const algumAberto = selecionadosLista.some((l) => l.status === "aberto");
  const todosMarcados = linhas.length > 0 && selecionados.size === linhas.length;

  const alternar = (id: string, marcado: boolean) =>
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (marcado) next.add(id); else next.delete(id);
      return next;
    });

  const abrirDecisao = (ids: string[], status: Decisao["status"]) => {
    setDecisao({ ids, status });
    setNota("");
  };

  const confirmar = async () => {
    if (!decisao || !podeConfirmarDecisao(decisao.status, nota, decisao.ids.length)) return;
    await atualizar.mutateAsync({
      id: decisao.ids.length === 1 ? decisao.ids[0] : decisao.ids,
      status: decisao.status,
      nota: nota.trim() || undefined,
    });
    setSelecionados((prev) => new Set([...prev].filter((id) => !decisao.ids.includes(id))));
    setDecisao(null);
    setNota("");
  };

  const reabrirSelecionados = async () => {
    const ids = selecionadosLista.filter((l) => l.status !== "aberto").map((l) => l.id);
    if (ids.length === 0) return;
    await atualizar.mutateAsync({ id: ids.length === 1 ? ids[0] : ids, status: "aberto" });
    setSelecionados(new Set());
  };

  const camposFiltro = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="erros-busca">Buscar</Label>
        <Input
          id="erros-busca"
          value={filtros.busca}
          onChange={(e) => set("busca", e.target.value)}
          placeholder="Mensagem, tela, pessoa, empresa ou CNPJ"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Empresa</Label>
        <Select value={filtros.empresaId ?? "todas"} onValueChange={(v) => set("empresaId", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="sem">Sem empresa identificada</SelectItem>
            {empresasOrdenadas.map(([id, nome]) => (
              <SelectItem key={id} value={id}>{nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Período</Label>
        <Select value={String(filtros.dias)} onValueChange={(v) => set("dias", Number(v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Últimas 24 horas</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="0">Tudo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Situação</Label>
        <Select value={filtros.status} onValueChange={(v) => set("status", v as AppErrorFiltros["status"])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="aberto">Abertos</SelectItem>
            <SelectItem value="resolvido">Resolvidos</SelectItem>
            <SelectItem value="ignorado">Ignorados</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Gravidade</Label>
        <Select value={filtros.severity} onValueChange={(v) => set("severity", v as AppErrorFiltros["severity"])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="error">Erro</SelectItem>
            <SelectItem value="warning">Alerta</SelectItem>
            <SelectItem value="info">Informação</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Origem</Label>
        <Select value={filtros.source} onValueChange={(v) => set("source", v as AppErrorFiltros["source"])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="client">Tela</SelectItem>
            <SelectItem value="database">Banco de dados</SelectItem>
            <SelectItem value="edge">Servidor</SelectItem>
            <SelectItem value="import">Importação</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end">
        <Button
          type="button"
          variant={filtros.comChamados ? "default" : "outline"}
          className="w-full"
          aria-pressed={filtros.comChamados}
          onClick={() => set("comChamados", !filtros.comChamados)}
        >
          <Headset className="mr-2 h-4 w-4" />Com chamados
        </Button>
      </div>
    </div>
  );

  return (
    <DpPage className={selecionados.size > 0 ? "pb-28" : undefined}>
      <Helmet>
        <title>Auditoria de erros | Backoffice</title>
        <meta name="description" content="Erros registrados no uso do sistema, agrupados por repetição, para priorizar correções." />
      </Helmet>

      <DpPageHeader
        icon={Bug}
        title="Auditoria de erros"
        description="Tudo que deu errado no uso do sistema, agrupado por repetição."
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metrica
          rotulo="Abertos"
          valor={resumo.abertos}
          ativo={filtros.status === "aberto"}
          onClick={() => set("status", "aberto")}
        />
        <Metrica rotulo="Novos em 24h" valor={resumo.novos24h} destaque />
        <Metrica
          rotulo="Com chamados de clientes"
          valor={resumo.comChamados}
          destaque
          ativo={filtros.comChamados}
          onClick={() => set("comChamados", !filtros.comChamados)}
        />
        <Metrica rotulo="Ocorrências" valor={resumo.ocorrencias} />
      </div>

      {resumo.novos24h > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p>
            {resumo.novos24h === 1
              ? "1 erro novo apareceu nas últimas 24 horas."
              : `${resumo.novos24h} erros novos apareceram nas últimas 24 horas.`}
          </p>
        </div>
      )}

      <DpFilterCard>
        {isMobile ? (
          <Collapsible open={filtrosAbertos} onOpenChange={setFiltrosAbertos}>
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center gap-2 text-left">
                <SlidersHorizontal className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Filtros</span>
                  <span className="block truncate text-xs text-muted-foreground">{resumoFiltros}</span>
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", filtrosAbertos && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">{camposFiltro}</CollapsibleContent>
          </Collapsible>
        ) : (
          camposFiltro
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-muted-foreground">
              Última atualização: {dataHora(new Date(dataUpdatedAt).toISOString())}
            </span>
          )}
        </div>
      </DpFilterCard>

      <DpContentCard contentClassName="p-3 md:p-5">
        {error ? (
          <DpErrorState message="Não foi possível carregar os erros." onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : linhas.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum erro registrado com esses filtros. Ótimo sinal.
          </p>
        ) : (
          <>
            <label className="mb-3 flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-1 text-sm">
              <Checkbox
                checked={todosMarcados}
                onCheckedChange={(v) => setSelecionados(v ? new Set(linhas.map((l) => l.id)) : new Set())}
                aria-label="Selecionar todos os erros da lista"
              />
              <span>
                {selecionados.size > 0
                  ? `${selecionados.size} de ${linhas.length} selecionado${selecionados.size === 1 ? "" : "s"}`
                  : `Selecionar todos (${linhas.length})`}
              </span>
            </label>
            <ul className="space-y-3">
              {linhas.map((l) => {
                const chamadosPendentes = (l.reports ?? []).filter((r) => r.status === "aberto" || r.status === "em_analise");
                const marcado = selecionados.has(l.id);
                return (
                  <li
                    key={l.id}
                    className={cn(
                      "rounded-lg border p-3",
                      temChamadoPendente(l) && "border-destructive/40",
                      marcado && "bg-primary/5 ring-1 ring-primary",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        className="mt-1"
                        checked={marcado}
                        onCheckedChange={(v) => alternar(l.id, !!v)}
                        aria-label={`Selecionar erro: ${l.surface ?? "tela não identificada"}`}
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="max-w-full gap-1 border-primary/40 bg-primary/10">
                            <Building2 className="h-3 w-3 shrink-0" />
                            <span className="truncate">{l.company_name ?? "Sem empresa identificada"}</span>
                          </Badge>
                          {chamadosPendentes.map((r) => (
                            <Badge key={r.id} variant="destructive">Chamado {r.protocol}</Badge>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={l.severity === "error" ? "destructive" : "secondary"}>
                            {NATUREZA_LABEL[l.severity]}
                          </Badge>
                          <Badge variant="outline">{ORIGEM_LABEL[l.source]}</Badge>
                          {l.status !== "aberto" && (
                            <Badge variant="secondary">{SITUACAO_LABEL[l.status]}</Badge>
                          )}
                          {l.occurrences > 1 && <Badge variant="outline">{l.occurrences}x</Badge>}
                        </div>
                        <p className="break-words font-medium">
                          {l.surface ?? "Tela não identificada"}
                          {l.action ? ` — ${l.action}` : ""}
                        </p>
                        <p className="break-words text-sm text-muted-foreground">{l.message}</p>
                        {l.user_message && (
                          <p className="break-words text-xs text-muted-foreground">
                            Mensagem mostrada: “{l.user_message}”
                          </p>
                        )}
                        <p className="break-words text-xs text-muted-foreground">
                          {usuarioLabel({ nome: l.user_name, email: l.user_email })}
                          {" · "}
                          {formatDistanceToNowStrict(new Date(l.last_seen_at), { locale: ptBR, addSuffix: true })}
                          {l.route ? ` · ${l.route}` : ""}
                          {l.code ? ` · código ${l.code}` : ""}
                        </p>
                        {l.status_note && (
                          <p className="break-words text-xs text-muted-foreground">Observação: {l.status_note}</p>
                        )}
                        <DetalhesTecnicos log={l} />
                        {(l.reports?.length ?? 0) > 0 && (
                          <details className="rounded-md border bg-muted/30 p-3" open={chamadosPendentes.length > 0 && !isMobile}>
                            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
                              <ChevronDown className="h-4 w-4" /> Relatos dos usuários ({l.reports?.length})
                            </summary>
                            <div className="mt-3 space-y-3">
                              {l.reports?.map((report) => (
                                <div key={report.id} className="rounded-md border bg-background p-3 text-sm">
                                  <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <Badge variant="outline">{report.protocol}</Badge>
                                    <Badge variant={report.status === "aberto" ? "destructive" : "secondary"}>
                                      {report.status === "em_analise" ? "Em análise" : SITUACAO_LABEL[report.status]}
                                    </Badge>
                                  </div>
                                  <p className="whitespace-pre-wrap break-words font-medium">{report.description}</p>
                                  {report.attempted_action && <p className="mt-2 break-words text-muted-foreground"><strong>Tentava:</strong> {report.attempted_action}</p>}
                                  <p className="mt-2 break-words text-xs text-muted-foreground">
                                    {usuarioLabel({ nome: report.reporter_name, email: report.reporter_email })} · {dataHora(report.created_at)}
                                  </p>
                                  {report.internal_note && <p className="mt-2 break-words text-xs text-muted-foreground">Observação interna: {report.internal_note}</p>}
                                  <div className="mt-3 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                                    {report.status !== "em_analise" && <Button size="sm" variant="outline" onClick={() => { setChamado({ id: report.id, status: "em_analise" }); setNota(""); }}>Em análise</Button>}
                                    {report.status !== "resolvido" && <Button size="sm" variant="outline" onClick={() => { setChamado({ id: report.id, status: "resolvido" }); setNota(""); }}>Resolver</Button>}
                                    {report.status !== "ignorado" && <Button size="sm" variant="ghost" onClick={() => { setChamado({ id: report.id, status: "ignorado" }); setNota(""); }}>Ignorar</Button>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 sm:flex sm:flex-wrap sm:justify-end">
                      <Button size="sm" variant="outline" className="h-10 sm:h-9" onClick={() => void copiarDetalhes(l)}>
                        <Copy className="mr-2 h-4 w-4" />Copiar detalhes
                      </Button>
                      {l.status === "aberto" ? (
                        <>
                          <Button size="sm" variant="outline" className="h-10 sm:h-9" onClick={() => abrirDecisao([l.id], "resolvido")}>
                            <CheckCircle2 className="mr-2 h-4 w-4" />Resolvido
                          </Button>
                          <Button size="sm" variant="ghost" className="col-span-2 h-10 sm:col-span-1 sm:h-9" onClick={() => abrirDecisao([l.id], "ignorado")}>
                            <EyeOff className="mr-2 h-4 w-4" />Ignorar
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-10 sm:h-9"
                          onClick={() => atualizar.mutate({ id: l.id, status: "aberto" })}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />Reabrir
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </DpContentCard>

      {selecionados.size > 0 && (
        <div
          role="region"
          aria-label="Ações para os erros selecionados"
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center justify-between gap-2 sm:flex-1">
              <span className="text-sm font-semibold">
                {selecionados.size} selecionado{selecionados.size === 1 ? "" : "s"}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())}>
                <X className="mr-1 h-4 w-4" />Limpar
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {algumAberto && (
                <>
                  <Button
                    size="sm"
                    className="h-10"
                    onClick={() => abrirDecisao(selecionadosLista.filter((l) => l.status === "aberto").map((l) => l.id), "resolvido")}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />Resolver
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-10"
                    onClick={() => abrirDecisao(selecionadosLista.filter((l) => l.status === "aberto").map((l) => l.id), "ignorado")}
                  >
                    <EyeOff className="mr-2 h-4 w-4" />Ignorar
                  </Button>
                </>
              )}
              {algumFechado && (
                <Button
                  size="sm"
                  variant="outline"
                  className={cn("h-10", !algumAberto && "col-span-2")}
                  onClick={() => void reabrirSelecionados()}
                  disabled={atualizar.isPending}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />Reabrir
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!decisao} onOpenChange={(o) => { if (!o) { setDecisao(null); setNota(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decisao?.status === "resolvido"
                ? (decisao.ids.length > 1 ? `Marcar ${decisao.ids.length} erros como resolvidos` : "Marcar como resolvido")
                : (decisao && decisao.ids.length > 1 ? `Ignorar ${decisao.ids.length} erros` : "Ignorar este erro")}
            </DialogTitle>
            <DialogDescription>
              {decisao?.status === "resolvido"
                ? "Se o mesmo erro acontecer de novo, ele volta para a lista de abertos."
                : "Explique por que pode ser ignorado. A mesma justificativa vale para todos os selecionados."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="erros-nota">
              Observação{decisao?.status === "ignorado" ? " (obrigatória)" : " (opcional)"}
            </Label>
            <Textarea id="erros-nota" value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDecisao(null); setNota(""); }}>Cancelar</Button>
            <Button
              onClick={confirmar}
              disabled={atualizar.isPending || !decisao || !podeConfirmarDecisao(decisao.status, nota, decisao.ids.length)}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!chamado} onOpenChange={(open) => { if (!open) { setChamado(null); setNota(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atualizar chamado</DialogTitle>
            <DialogDescription>Registre uma observação para manter o histórico da análise.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Observação interna</Label>
            <Textarea value={nota} onChange={(event) => setNota(event.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChamado(null)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!chamado) return;
                await atualizarChamado.mutateAsync({ id: chamado.id, status: chamado.status, nota });
                setChamado(null);
                setNota("");
              }}
              disabled={atualizarChamado.isPending}
            >Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DpPage>
  );
}
