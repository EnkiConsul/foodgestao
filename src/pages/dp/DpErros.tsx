import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Bug, CheckCircle2, ChevronDown, EyeOff, RefreshCw, RotateCcw } from "lucide-react";
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
import { DpErrorState } from "@/components/dp/DpErrorState";
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

const SITUACAO_LABEL: Record<AppErrorLog["status"], string> = {
  aberto: "Aberto",
  resolvido: "Resolvido",
  ignorado: "Ignorado",
};

function dataHora(iso: string) {
  return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

type DpErrosProps = {
  /** No backoffice mostramos os erros de todas as empresas. */
  todasEmpresas?: boolean;
};

export default function DpErros({ todasEmpresas = false }: DpErrosProps) {
  const [filtros, setFiltros] = useState<AppErrorFiltros>({ ...FILTROS_ERRO_PADRAO, todasEmpresas });
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useAppErrorLogs(filtros);
  const atualizar = useAppErrorStatus();
  const atualizarChamado = useAppErrorReportStatus();
  const [decisao, setDecisao] = useState<{ log: AppErrorLog; status: "resolvido" | "ignorado" } | null>(null);
  const [nota, setNota] = useState("");
  const [chamado, setChamado] = useState<{ id: string; status: "aberto" | "em_analise" | "resolvido" | "ignorado" } | null>(null);

  const linhas = data ?? [];

  const novos24h = useMemo(
    () =>
      linhas.filter(
        (l) =>
          l.status === "aberto" &&
          Date.now() - new Date(l.first_seen_at).getTime() < 86_400_000,
      ).length,
    [linhas],
  );

  const set = <K extends keyof AppErrorFiltros>(k: K, v: AppErrorFiltros[K]) =>
    setFiltros((prev) => ({ ...prev, [k]: v }));

  const confirmar = async () => {
    if (!decisao) return;
    if (decisao.status === "ignorado" && !nota.trim()) return;
    await atualizar.mutateAsync({ id: decisao.log.id, status: decisao.status, nota: nota.trim() || undefined });
    setDecisao(null);
    setNota("");
  };

  return (
    <DpPage>
      <Helmet>
        <title>Auditoria de erros | Pessoas 360°</title>
        <meta name="description" content="Erros registrados no uso do sistema, agrupados por repetição, para priorizar correções." />
      </Helmet>

      <DpPageHeader
        icon={Bug}
        title="Auditoria de erros"
        description="Tudo que deu errado no uso do sistema, agrupado por repetição."
      />

      {novos24h > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p>
            {novos24h === 1
              ? "1 erro novo apareceu nas últimas 24 horas."
              : `${novos24h} erros novos apareceram nas últimas 24 horas.`}
          </p>
        </div>
      )}

      <DpFilterCard>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5 lg:col-span-2">
            <Label>Buscar</Label>
            <Input
              value={filtros.busca}
              onChange={(e) => set("busca", e.target.value)}
              placeholder="Mensagem, tela, ação ou pessoa"
            />
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
        </div>
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

      <DpContentCard contentClassName="p-4 md:p-5">
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
          <ul className="space-y-3">
            {linhas.map((l) => (
              <li key={l.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={l.severity === "error" ? "destructive" : "secondary"}>
                        {GRAVIDADE_LABEL[l.severity]}
                      </Badge>
                      <Badge variant="outline">{ORIGEM_LABEL[l.source]}</Badge>
                      {l.status !== "aberto" && (
                        <Badge variant="secondary">{SITUACAO_LABEL[l.status]}</Badge>
                      )}
                      {l.occurrences > 1 && (
                        <Badge variant="outline">{l.occurrences}x</Badge>
                      )}
                      {(l.reports?.length ?? 0) > 0 && (
                        <Badge variant="default">{l.reports?.length} chamado{l.reports?.length === 1 ? "" : "s"}</Badge>
                      )}
                    </div>
                    <p className="font-medium">
                      {l.surface ?? "Tela não identificada"}
                      {l.action ? ` — ${l.action}` : ""}
                    </p>
                    <p className="break-words text-sm text-muted-foreground">{l.message}</p>
                    {l.user_message && (
                      <p className="text-xs text-muted-foreground">
                        Mensagem mostrada: “{l.user_message}”
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {l.route ? `${l.route} · ` : ""}
                      {l.user_name ? `${l.user_name} · ` : ""}
                      Primeira vez {dataHora(l.first_seen_at)} · Última{" "}
                      {formatDistanceToNowStrict(new Date(l.last_seen_at), { locale: ptBR, addSuffix: true })}
                      {l.code ? ` · código ${l.code}` : ""}
                    </p>
                    {l.status_note && (
                      <p className="text-xs text-muted-foreground">Observação: {l.status_note}</p>
                    )}
                    {(l.reports?.length ?? 0) > 0 && (
                      <details className="mt-3 rounded-md border bg-muted/30 p-3">
                        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
                          <ChevronDown className="h-4 w-4" /> Relatos dos usuários
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
                              <p className="whitespace-pre-wrap font-medium">{report.description}</p>
                              {report.attempted_action && <p className="mt-2 text-muted-foreground"><strong>Tentava:</strong> {report.attempted_action}</p>}
                              <p className="mt-2 text-xs text-muted-foreground">
                                {report.reporter_name ?? "Usuário"} · {dataHora(report.created_at)}
                              </p>
                              {report.internal_note && <p className="mt-2 text-xs text-muted-foreground">Observação interna: {report.internal_note}</p>}
                              <div className="mt-3 flex flex-wrap gap-2">
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
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {l.status === "aberto" ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => { setDecisao({ log: l, status: "resolvido" }); setNota(""); }}>
                          <CheckCircle2 className="mr-2 h-4 w-4" />Resolvido
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setDecisao({ log: l, status: "ignorado" }); setNota(""); }}>
                          <EyeOff className="mr-2 h-4 w-4" />Ignorar
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => atualizar.mutate({ id: l.id, status: "aberto" })}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />Reabrir
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DpContentCard>

      <Dialog open={!!decisao} onOpenChange={(o) => { if (!o) { setDecisao(null); setNota(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decisao?.status === "resolvido" ? "Marcar como resolvido" : "Ignorar este erro"}
            </DialogTitle>
            <DialogDescription>
              {decisao?.status === "resolvido"
                ? "Se o mesmo erro acontecer de novo, ele volta para a lista de abertos."
                : "Explique por que este erro pode ser ignorado."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>
              Observação{decisao?.status === "ignorado" ? " (obrigatória)" : " (opcional)"}
            </Label>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDecisao(null); setNota(""); }}>Cancelar</Button>
            <Button
              onClick={confirmar}
              disabled={atualizar.isPending || (decisao?.status === "ignorado" && !nota.trim())}
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
