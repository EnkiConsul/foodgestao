import { useEffect, useMemo, useReducer, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calendarioResumoNavigation } from "./calendarioResumoNavigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDpOperacaoPanorama, type DiaPanorama } from "@/hooks/useDpOperacaoPanorama";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { hojeIsoLocal } from "@/lib/dp/dataLocal";
import { diaEhPico } from "@/lib/dp/calendario-rotina";

const UNIDADE_KEY = "operacao_unidade"; // mesma preferência do Calendário completo
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

function resumo(d: DiaPanorama) {
  const c = d.contagens;
  return [
    { k: "Trabalhando", v: d.trabalhando, cor: "bg-primary" },
    { k: "Folgas", v: c.folga_padrao + c.folga_extra, cor: "bg-emerald-500" },
    { k: "Férias", v: c.ferias, cor: "bg-sky-500" },
    { k: "Atestados", v: c.atestado, cor: "bg-violet-500" },
    { k: "Faltas", v: c.ausente, cor: "bg-rose-500" },
    { k: "Aguardando", v: d.aguardando, cor: "bg-amber-500" },
  ].filter((i) => i.v > 0 || i.k === "Trabalhando");
}

/** Resumo do Calendário da Rotina no Início — mesma rotina oficial, sem cálculo próprio. */
export function CalendarioOperacaoResumo() {
  const hoje = hojeIsoLocal();
  const [{ competencia, aba, selecionado }, navegar] = useReducer(calendarioResumoNavigation, {
    competencia: hoje.slice(0, 7), aba: "hoje", selecionado: hoje,
  });
  const [unidade, setUnidade] = useState("");
  const { prefs, save } = useDpUserPrefs();
  const p = useDpOperacaoPanorama(competencia, unidade || null);

  useEffect(() => {
    if (unidade || !p.unidades.length) return;
    const salva = (prefs.extras as Record<string, unknown>)?.[UNIDADE_KEY];
    if (typeof salva === "string" && p.unidades.some((u) => u.id === salva)) return setUnidade(salva);
    const maior = [...p.unidades].sort(
      (a, b) => (p.contagemPorUnidade.get(b.id) ?? 0) - (p.contagemPorUnidade.get(a.id) ?? 0),
    )[0];
    setUnidade(maior?.id ?? "");
  }, [unidade, p.unidades, p.contagemPorUnidade, prefs.extras]);

  const trocarUnidade = (v: string) => {
    setUnidade(v);
    save({ extras: { ...(prefs.extras ?? {}), [UNIDADE_KEY]: v } });
  };

  const dia = selecionado.slice(0, 7) === competencia ? p.diaDe(selecionado) : undefined;
  const offset = p.dias[0] ? p.dias[0].dow : 0;
  const rotuloMes = useMemo(() => {
    const [a, m] = competencia.split("-").map(Number);
    return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }, [competencia]);
  const rotuloDia = new Date(`${selecionado}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });

  return (
    <Card className="min-w-0 p-3" role="region" aria-label="Calendário do início">
      <div className="mb-2 flex items-center gap-2">
        <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="text-sm font-semibold">Calendário</h2>
        <Tabs value={aba} onValueChange={(value) => {
          if (value === "hoje" || value === "mes") navegar({ type: "aba", aba: value });
        }} className="ml-auto">
          <TabsList className="h-8 p-0.5" aria-label="Visualização do calendário">
            <TabsTrigger value="hoje" className="px-2.5 py-1 text-xs">Hoje</TabsTrigger>
            <TabsTrigger value="mes" className="px-2.5 py-1 text-xs">Mês</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button asChild variant="ghost" size="icon" className="h-8 w-8" aria-label="Abrir calendário completo">
          <Link to="/dp/rotina/calendario"><ExternalLink className="h-4 w-4" /></Link>
        </Button>
      </div>

      {p.unidades.length > 1 && (
        <Select value={unidade} onValueChange={trocarUnidade}>
          <SelectTrigger className="mb-2 h-9"><SelectValue placeholder="Unidade" /></SelectTrigger>
          <SelectContent>
            {p.unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {p.error ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Não foi possível carregar o calendário.</p>
      ) : p.isLoading || !unidade ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      ) : (
        <>
          <div className="mb-2 flex min-h-9 items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navegar({ type: "avancar", delta: -1 })} aria-label={aba === "mes" ? "Mês anterior" : "Dia anterior"}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-0 flex-1 text-center text-xs font-medium capitalize" aria-live="polite">
              {aba === "mes" ? rotuloMes : selecionado === hoje ? `Hoje, ${rotuloDia}` : rotuloDia}
            </span>
            {(selecionado !== hoje || competencia !== hoje.slice(0, 7)) && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => navegar({ type: "hoje", data: hoje })} aria-label="Voltar para hoje">Hoje</Button>}
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navegar({ type: "avancar", delta: 1 })} aria-label={aba === "mes" ? "Próximo mês" : "Próximo dia"}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          {aba === "mes" && (
            <>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-muted-foreground">
                {SEMANA.map((s, i) => <div key={i}>{s}</div>)}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {Array.from({ length: offset }).map((_, i) => <div key={`v${i}`} />)}
                {p.dias.map((d) => {
                  const ativo = d.data === selecionado;
                  const ehHoje = d.data === hoje;
                  return (
                    <Button
                      variant="ghost"
                      aria-label={`Selecionar ${d.data}`}
                      aria-pressed={ativo}
                      aria-current={ehHoje ? "date" : undefined}
                      key={d.data}
                      type="button"
                      onClick={() => navegar({ type: "selecionar", data: d.data })}
                      title={d.feriado_nome ?? undefined}
                      className={cn(
                        "relative flex h-10 min-w-0 flex-col items-center justify-center gap-0 rounded-lg border p-0 text-xs",
                        ativo ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border hover:bg-muted/60",
                        ehHoje && !ativo && "ring-1 ring-primary/50",
                        diaEhPico(d.data, d.feriado_nome) && !ativo && "bg-muted/40",
                      )}
                    >
                      <span className="tabular-nums">{Number(d.data.slice(8))}</span>
                      <span className="text-[9px] tabular-nums text-muted-foreground">{d.trabalhando}</span>
                      {d.alerta && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-destructive" />}
                    </Button>
                  );
                })}
              </div>
            </>
          )}

          {dia ? (
            <div className={cn("rounded-lg bg-muted/40 p-2.5", aba === "mes" && "mt-2")}>
              {(aba === "mes" || dia.feriado_nome) && <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                {aba === "mes" && <span className="font-medium capitalize">{selecionado === hoje ? `Hoje, ${rotuloDia}` : rotuloDia}</span>}
                {dia.feriado_nome && <span>🎉 {dia.feriado_nome}</span>}
              </div>}
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                {resumo(dia).map((i) => (
                  <div key={i.k} className="flex items-center gap-1 text-xs">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", i.cor)} />
                    <span className="font-semibold tabular-nums">{i.v}</span>
                    <span className="text-muted-foreground">{i.k}</span>
                  </div>
                ))}
              </div>
              {dia.alerta && <p className="mt-1.5 text-xs text-destructive">Equipe fora do padrão neste dia.</p>}
            </div>
          ) : selecionado.slice(0, 7) === competencia ? (
            <p className="py-3 text-center text-xs text-muted-foreground">Sem informações para este dia.</p>
          ) : null}
        </>
      )}
    </Card>
  );
}
