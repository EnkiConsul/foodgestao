import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  HeartPulse,
  Plane,
  RotateCcw,
  Sun,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { useDpOperacaoPanorama, type DiaPanorama } from "@/hooks/useDpOperacaoPanorama";
import { useDpCoberturaMinima } from "@/hooks/useDpCoberturaMinima";
import { resolverCoberturaMinima } from "@/lib/dp/cobertura-utils";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import {
  CATEGORIA_LABEL,
  mensagemAlerta,
  somarDias,
  type CategoriaDia,
  type PessoaPanorama,
} from "@/lib/dp/operacao-panorama";

import { DpPage, DpPageHeader, DpFilterCard, DpContentCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { DpStatCard } from "@/components/dp/DpStatCard";
import { DpTabsBar } from "@/components/dp/DpTabsBar";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dataExtenso = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

const competenciaExtenso = (c: string) =>
  new Date(`${c}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

const somarMeses = (competencia: string, n: number) => {
  const [ano, mes] = competencia.split("-").map(Number);
  const d = new Date(ano, mes - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const DOW_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const CATEGORIA_ORDEM: CategoriaDia[] = [
  "fixo",
  "convocado_aceito",
  "convocado_pendente",
  "folga_padrao",
  "folga_extra",
  "ferias",
  "atestado",
];

const CATEGORIA_TONE: Record<CategoriaDia, "primary" | "muted" | "success" | "warning" | "danger"> = {
  fixo: "primary",
  convocado_aceito: "success",
  convocado_pendente: "warning",
  folga_padrao: "muted",
  folga_extra: "muted",
  ferias: "primary",
  atestado: "danger",
};

const CATEGORIA_ICON: Record<CategoriaDia, typeof Users> = {
  fixo: Users,
  convocado_aceito: UserCheck,
  convocado_pendente: Clock,
  folga_padrao: Sun,
  folga_extra: Sun,
  ferias: Plane,
  atestado: HeartPulse,
};

function Secao({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DpContentCard contentClassName="p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </DpContentCard>
  );
}

function SituacaoBadge({ dia }: { dia: DiaPanorama }) {
  if (dia.dispensado) return <Badge variant="outline">Alerta resolvido</Badge>;
  if (dia.avaliacao.situacao === "abaixo")
    return <Badge variant="destructive">Abaixo do padrão ({dia.avaliacao.diferenca})</Badge>;
  if (dia.avaliacao.situacao === "acima")
    return <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400">
      Acima do padrão (+{dia.avaliacao.diferenca})
    </Badge>;
  if (dia.avaliacao.situacao === "ok") return <Badge variant="secondary">Dentro do padrão</Badge>;
  return null;
}

export default function DpOperacaoPanorama() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(() => params.get("data") || hojeIso());
  const [unidade, setUnidade] = useState<string>("todas");
  const [aba, setAba] = useState(params.get("aba") === "mes" ? "mes" : "dia");
  const [detalheCategoria, setDetalheCategoria] = useState<CategoriaDia | null>(null);

  const unidadeId = unidade === "todas" ? null : unidade;
  const competencia = data.slice(0, 7);
  const panorama = useDpOperacaoPanorama(competencia, unidadeId);
  const { regras: regrasCobertura } = useDpCoberturaMinima();

  const dia = panorama.diaDe(data);

  const trocarAba = (v: string) => {
    setAba(v);
    const next = new URLSearchParams(params);
    next.set("aba", v);
    setParams(next, { replace: true });
  };

  const irParaDia = (iso: string) => {
    setData(iso);
    trocarAba("dia");
  };

  /** Turnos presentes no dia, com cobertura mínima exigida. */
  const blocos = useMemo(() => {
    if (!dia) return [];
    const trabalhando = dia.pessoas.filter(
      (p) => p.categoria === "fixo" || p.categoria === "convocado_aceito" || p.categoria === "convocado_pendente",
    );
    const mapa = new Map<string, { id: string | null; nome: string; pessoas: PessoaPanorama[] }>();
    for (const p of trabalhando) {
      const chave = p.turno_id ?? "sem-turno";
      const atual = mapa.get(chave) ?? { id: p.turno_id, nome: p.turno_nome ?? "Sem turno definido", pessoas: [] };
      atual.pessoas.push(p);
      mapa.set(chave, atual);
    }
    const minimos = resolverCoberturaMinima({
      regras: regrasCobertura,
      data,
      unidadeId,
      turnoIds: panorama.turnos.map((t) => t.id),
    });
    return [...mapa.values()]
      .map((b) => ({ ...b, minimo: b.id ? minimos[b.id] ?? 0 : 0 }))
      .sort((a, b) => (a.pessoas[0]?.entrada ?? "").localeCompare(b.pessoas[0]?.entrada ?? ""));
  }, [dia, regrasCobertura, data, unidadeId, panorama.turnos]);

  const cargaPrevista = useMemo(
    () => (dia?.pessoas ?? []).reduce((acc, p) => acc + p.carga_prevista_horas, 0),
    [dia],
  );

  const diasAlerta = useMemo(() => panorama.dias.filter((d) => d.alerta), [panorama.dias]);

  const dispensar = (d: DiaPanorama) =>
    panorama.dispensarAlerta.mutate(
      { data: d.data, previsto: d.trabalhando, padrao: d.avaliacao.padrao ?? 0 },
      {
        onSuccess: () => toast.success("Alerta marcado como resolvido."),
        onError: (e: unknown) => toast.error((e as Error).message ?? "Não foi possível dispensar o alerta."),
      },
    );

  const reativar = (d: DiaPanorama) =>
    panorama.reativarAlerta.mutate(d.data, {
      onSuccess: () => toast.success("Alerta reativado."),
      onError: (e: unknown) => toast.error((e as Error).message ?? "Não foi possível reativar o alerta."),
    });

  if (panorama.error) return <DpErrorState message="Não foi possível carregar o painel da operação." />;

  const pessoasDaCategoria = detalheCategoria
    ? (dia?.pessoas ?? []).filter((p) => p.categoria === detalheCategoria)
    : [];

  return (
    <DpPage>
      <Helmet>
        <title>Painel da Operação | Pessoas 360°FOOD</title>
        <meta
          name="description"
          content="Acompanhe quantos colaboradores fixos, intermitentes convocados, folgas, férias e atestados a operação tem em cada dia."
        />
      </Helmet>

      <DpPageHeader
        title="Painel da Operação"
        description="Quantas pessoas a operação tem em cada dia — sem precisar gerar escala."
        icon={CalendarClock}
      />

      <DpFilterCard>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="data-panorama">{aba === "mes" ? "Competência" : "Dia"}</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Anterior"
                onClick={() =>
                  setData(aba === "mes" ? `${somarMeses(competencia, -1)}-01` : somarDias(data, -1))
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {aba === "mes" ? (
                <Input
                  id="data-panorama"
                  type="month"
                  value={competencia}
                  onChange={(e) => setData(`${e.target.value || hojeIso().slice(0, 7)}-01`)}
                />
              ) : (
                <Input
                  id="data-panorama"
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value || hojeIso())}
                />
              )}
              <Button
                variant="outline"
                size="icon"
                aria-label="Próximo"
                onClick={() =>
                  setData(aba === "mes" ? `${somarMeses(competencia, 1)}-01` : somarDias(data, 1))
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Unidade</Label>
            <Select value={unidade} onValueChange={setUnidade}>
              <SelectTrigger>
                <SelectValue placeholder="Todas as unidades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as unidades</SelectItem>
                {panorama.unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setData(hojeIso())}>
            Hoje
          </Button>
          <span className="text-sm text-muted-foreground first-letter:uppercase">
            {aba === "mes" ? competenciaExtenso(competencia) : dataExtenso(data)}
          </span>
          {dia && <SituacaoBadge dia={dia} />}
        </div>
      </DpFilterCard>

      <Tabs value={aba} onValueChange={trocarAba} className="space-y-4">
        <DpTabsBar>
          <TabsTrigger value="dia">Rotina do Dia</TabsTrigger>
          <TabsTrigger value="mes">Rotina do Mês</TabsTrigger>
        </DpTabsBar>

        <TabsContent value="dia" className="space-y-4">
          {panorama.isLoading || !dia ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {CATEGORIA_ORDEM.map((cat) => (
                  <DpStatCard
                    key={cat}
                    icon={CATEGORIA_ICON[cat]}
                    tone={CATEGORIA_TONE[cat]}
                    label={CATEGORIA_LABEL[cat]}
                    value={dia.contagens[cat]}
                    onClick={dia.contagens[cat] > 0 ? () => setDetalheCategoria(cat) : undefined}
                  />
                ))}
                <DpStatCard
                  icon={Clock}
                  tone="muted"
                  label="Carga Prevista"
                  value={formatarHoras(cargaPrevista)}
                  hint={`${dia.trabalhando} pessoa(s) na operação`}
                />
              </div>

              {dia.avaliacao.situacao !== "sem_padrao" && dia.avaliacao.situacao !== "ok" && (
                <Secao
                  title="Fora do Padrão"
                  description={mensagemAlerta(dia, dia.avaliacao, unidadeId ? undefined : null)}
                  action={
                    dia.dispensado ? (
                      <Button variant="ghost" size="sm" onClick={() => reativar(dia)}>
                        <RotateCcw className="mr-1.5 h-4 w-4" />
                        Reativar alerta
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => dispensar(dia)}>
                        <Check className="mr-1.5 h-4 w-4" />
                        Está ok
                      </Button>
                    )
                  }
                >
                  <p className="text-sm text-muted-foreground">
                    O padrão vem da mediana das últimas 8 semanas para este dia da semana
                    {unidadeId ? " nesta unidade" : ""}.
                  </p>
                </Secao>
              )}

              {blocos.length ? (
                blocos.map((bloco) => (
                  <Secao
                    key={bloco.id ?? "sem-turno"}
                    title={bloco.nome}
                    description={`${bloco.pessoas.length} pessoa(s)${bloco.minimo ? ` · mínimo ${bloco.minimo}` : ""}`}
                    action={
                      bloco.minimo > bloco.pessoas.length ? (
                        <Badge variant="destructive">
                          Falta {bloco.minimo - bloco.pessoas.length}
                        </Badge>
                      ) : undefined
                    }
                  >
                    <ul className="divide-y">
                      {bloco.pessoas.map((p) => (
                        <li key={p.colaborador_id} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{p.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {p.entrada ?? "--:--"} às {p.saida ?? "--:--"}
                              {p.termina_no_dia_seguinte ? " (+1)" : ""} · {formatarHoras(p.carga_prevista_horas)}
                            </p>
                          </div>
                          <Badge variant={p.categoria === "convocado_pendente" ? "outline" : "secondary"}>
                            {CATEGORIA_LABEL[p.categoria]}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </Secao>
                ))
              ) : (
                <Secao title="Ninguém na Operação Neste Dia">
                  <p className="text-sm text-muted-foreground">
                    Nenhum fixo com jornada prevista e nenhuma convocação para {dataExtenso(data)}.
                  </p>
                </Secao>
              )}

              {(["folga_padrao", "folga_extra", "ferias", "atestado"] as CategoriaDia[]).some(
                (c) => dia.contagens[c] > 0,
              ) && (
                <Secao title="Fora da Operação" description="Folgas, férias e afastamentos do dia">
                  <ul className="divide-y">
                    {dia.pessoas
                      .filter((p) =>
                        ["folga_padrao", "folga_extra", "ferias", "atestado"].includes(p.categoria),
                      )
                      .map((p) => (
                        <li key={p.colaborador_id} className="flex items-center justify-between gap-3 py-2">
                          <span className="truncate text-sm">{p.nome}</span>
                          <Badge variant="outline">{CATEGORIA_LABEL[p.categoria]}</Badge>
                        </li>
                      ))}
                  </ul>
                </Secao>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="mes" className="space-y-4">
          {panorama.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <DpStatCard
                  icon={CalendarDays}
                  label="Dias no Mês"
                  value={panorama.dias.length}
                  hint={competenciaExtenso(competencia)}
                />
                <DpStatCard
                  icon={Users}
                  label="Média de Pessoas por Dia"
                  value={
                    panorama.dias.length
                      ? Math.round(
                          panorama.dias.reduce((a, d) => a + d.trabalhando, 0) / panorama.dias.length,
                        )
                      : 0
                  }
                />
                <DpStatCard
                  icon={AlertTriangle}
                  tone={diasAlerta.length ? "warning" : "muted"}
                  label="Dias Fora do Padrão"
                  value={diasAlerta.length}
                  hint="Sem alertas resolvidos"
                />
                <DpStatCard
                  icon={UserX}
                  tone="muted"
                  label="Dias Sem Ninguém"
                  value={panorama.dias.filter((d) => d.trabalhando === 0).length}
                />
              </div>

              <Secao
                title="Calendário da Operação"
                description="Clique em um dia para ver o detalhamento por turno."
              >
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
                  {DOW_CURTO.map((d) => (
                    <div key={d} className="py-1">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: panorama.dias[0]?.dow ?? 0 }).map((_, i) => (
                    <div key={`vazio-${i}`} />
                  ))}
                  {panorama.dias.map((d) => (
                    <button
                      key={d.data}
                      type="button"
                      onClick={() => irParaDia(d.data)}
                      className={`rounded-md border p-1.5 text-left transition-colors hover:bg-muted/50 ${
                        d.alerta
                          ? d.avaliacao.situacao === "abaixo"
                            ? "border-destructive/50 bg-destructive/5"
                            : "border-amber-500/50 bg-amber-500/5"
                          : "border-border"
                      } ${d.data === data ? "ring-2 ring-primary" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{Number(d.data.slice(-2))}</span>
                        {d.dispensado && <Check className="h-3 w-3 text-muted-foreground" />}
                        {d.alerta && <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />}
                      </div>
                      <p className="text-[11px] font-medium">{d.trabalhando} pessoa(s)</p>
                      <p className="text-[10px] leading-tight text-muted-foreground">
                        {d.contagens.fixo}F · {d.contagens.convocado_aceito + d.contagens.convocado_pendente}I ·{" "}
                        {d.contagens.folga_padrao + d.contagens.folga_extra}FG
                      </p>
                      {d.avaliacao.padrao != null && (
                        <p className="text-[10px] text-muted-foreground">padrão {d.avaliacao.padrao}</p>
                      )}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  F = fixos escalados · I = intermitentes convocados · FG = folgas
                </p>
              </Secao>

              <Secao
                title="Dias Para Avaliar"
                description={
                  diasAlerta.length
                    ? `${diasAlerta.length} dia(s) fora do padrão histórico`
                    : "Nenhum dia fora do padrão neste mês."
                }
              >
                <ul className="divide-y">
                  {diasAlerta.map((d) => (
                    <li key={d.data} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          className="text-sm font-medium underline-offset-2 hover:underline"
                          onClick={() => irParaDia(d.data)}
                        >
                          <span className="first-letter:uppercase">{dataExtenso(d.data)}</span>
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {mensagemAlerta(d, d.avaliacao, null)}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => dispensar(d)}>
                        <Check className="mr-1.5 h-4 w-4" />
                        Está ok
                      </Button>
                    </li>
                  ))}
                  {!diasAlerta.length && (
                    <li className="py-2 text-sm text-muted-foreground">
                      A operação está dentro do padrão aprendido pelo sistema.
                    </li>
                  )}
                </ul>
              </Secao>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!detalheCategoria} onOpenChange={(o) => !o && setDetalheCategoria(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detalheCategoria ? CATEGORIA_LABEL[detalheCategoria] : ""}</DialogTitle>
            <DialogDescription className="first-letter:uppercase">{dataExtenso(data)}</DialogDescription>
          </DialogHeader>
          <ul className="max-h-[60vh] divide-y overflow-y-auto">
            {pessoasDaCategoria.map((p) => (
              <li key={p.colaborador_id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-sm">{p.nome}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {p.entrada ? `${p.entrada} às ${p.saida ?? "--:--"}` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </DpPage>
  );
}
