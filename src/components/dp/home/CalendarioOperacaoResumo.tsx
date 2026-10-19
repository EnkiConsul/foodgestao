import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  const [competencia, setCompetencia] = useState(hoje.slice(0, 7));
  const [aba, setAba] = useState<"hoje" | "mes">("hoje");
  const [selecionado, setSelecionado] = useState(hoje);
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

  const mudarMes = (delta: number) => {
    const [a, m] = competencia.split("-").map(Number);
    const d = new Date(a, m - 1 + delta, 1);
    setCompetencia(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const irHoje = () => { setAba("hoje"); setCompetencia(hoje.slice(0, 7)); setSelecionado(hoje); };

  const dia = p.diaDe(selecionado);
  const offset = p.dias[0] ? p.dias[0].dow : 0;
  const rotuloMes = useMemo(() => {
    const [a, m] = competencia.split("-").map(Number);
    return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }, [competencia]);
  const rotuloDia = new Date(`${selecionado}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });

  return (
    <Card className="min-w-0 p-3">
      <div className="mb-2 flex items-center gap-2">
        <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="text-sm font-semibold">Calendário</h2>
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-muted p-0.5 text-xs">
          {(["hoje", "mes"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => (t === "hoje" ? irHoje() : setAba("mes"))}
              className={cn("rounded-md px-2.5 py-1 font-medium", aba === t ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {t === "hoje" ? "Hoje" : "Mês"}
            </button>
          ))}
        </div>
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
          {aba === "mes" && (
            <>
              <div className="mb-1 flex items-center justify-between">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => mudarMes(-1)} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm font-medium capitalize">{rotuloMes}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => mudarMes(1)} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-muted-foreground">
                {SEMANA.map((s, i) => <div key={i}>{s}</div>)}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {Array.from({ length: offset }).map((_, i) => <div key={`v${i}`} />)}
                {p.dias.map((d) => {
                  const ativo = d.data === selecionado;
                  const ehHoje = d.data === hoje;
                  return (
                    <button
                      key={d.data}
                      type="button"
                      onClick={() => setSelecionado(d.data)}
                      title={d.feriado_nome ?? undefined}
                      className={cn(
                        "relative flex min-h-[40px] flex-col items-center justify-center rounded-lg border text-xs",
                        ativo ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border hover:bg-muted/60",
                        ehHoje && !ativo && "ring-1 ring-primary/50",
                        diaEhPico(d.data, d.feriado_nome) && !ativo && "bg-muted/40",
                      )}
                    >
                      <span className="tabular-nums">{Number(d.data.slice(8))}</span>
                      <span className="text-[9px] tabular-nums text-muted-foreground">{d.trabalhando}</span>
                      {d.alerta && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-destructive" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {dia ? (
            <div className={cn("rounded-lg bg-muted/40 p-2.5", aba === "mes" && "mt-2")}>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                <span className="font-medium capitalize">{selecionado === hoje ? "Hoje" : rotuloDia}</span>
                {dia.feriado_nome && <span>🎉 {dia.feriado_nome}</span>}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {resumo(dia).map((i) => (
                  <div key={i.k} className="rounded-md bg-background px-2 py-1.5">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className={cn("h-1.5 w-1.5 rounded-full", i.cor)} />{i.k}
                    </div>
                    <div className="text-base font-semibold tabular-nums">{i.v}</div>
                  </div>
                ))}
              </div>
              {dia.alerta && <p className="mt-1.5 text-xs text-destructive">Equipe fora do padrão neste dia.</p>}
            </div>
          ) : (
            <p className="py-3 text-center text-xs text-muted-foreground">Sem informações para este dia.</p>
          )}
        </>
      )}
    </Card>
  );
}
