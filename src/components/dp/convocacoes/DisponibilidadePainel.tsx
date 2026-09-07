import { useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, ChevronLeft, ChevronRight, Clock, Loader2, UserCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DpContentCard, DpEmptyState } from "@/components/dp/DpPage";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpDisponibilidadePainel, type DisponibilidadeDiaResumo } from "@/hooks/useDpDisponibilidadePainel";
import { competenciaLabel, diaMes, type DisponibilidadeJanela } from "@/lib/dp/disponibilidade-janela";
import { cn } from "@/lib/utils";

const EMPRESA = "__empresa__";

/** Competência inicial: o mês seguinte ao atual, que é o normalmente planejado. */
function competenciaInicial(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 2).padStart(2, "0")}-01`;
}

function somaMeses(iso: string, delta: number): string {
  const [a, m] = iso.split("-").map(Number);
  const d = new Date(a, (m ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const DIA_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

function avisoJanela(j: DisponibilidadeJanela | undefined) {
  if (!j) return null;
  if (j.estado === "antes")
    return { tom: "info" as const, texto: `O período de informação abre em ${diaMes(j.abre)} e fecha em ${diaMes(j.fecha)}.` };
  if (j.estado === "aberta")
    return { tom: "ok" as const, texto: `Período aberto até ${diaMes(j.fecha)} — dá tempo de cobrar quem não informou.` };
  return { tom: "warn" as const, texto: `Período encerrado em ${diaMes(j.fecha)}. Novas marcações entram como alteração tardia.` };
}

function Chip({ icone: Icone, valor, rotulo, tom }: { icone: any; valor: number; rotulo: string; tom?: "warn" }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-xl border border-border px-3 py-2", tom === "warn" && "border-amber-500/40 bg-amber-500/5")}>
      <Icone className={cn("h-4 w-4 text-muted-foreground", tom === "warn" && "text-amber-600")} />
      <div className="leading-tight">
        <div className="text-sm font-semibold">{valor}</div>
        <div className="text-[11px] text-muted-foreground">{rotulo}</div>
      </div>
    </div>
  );
}

function DiaCelula({ dia }: { dia: DisponibilidadeDiaResumo }) {
  const num = Number(dia.data.slice(8, 10));
  const cheio = dia.disponiveis === 0;
  const apertado = !cheio && dia.indisponiveis > 0 && dia.disponiveis <= 2;
  return (
    <div
      className={cn(
        "rounded-lg border border-border p-1.5 text-center",
        apertado && "border-amber-500/50 bg-amber-500/5",
        cheio && "border-destructive/50 bg-destructive/5",
      )}
      title={`${dia.disponiveis} disponível(is) · ${dia.indisponiveis} indisponível(is) · ${dia.pendentes} aguardando · ${dia.aceitas} confirmada(s)`}
    >
      <div className="text-[10px] text-muted-foreground">{num}</div>
      <div className="text-sm font-semibold">{dia.disponiveis}</div>
      {dia.indisponiveis > 0 ? (
        <div className="text-[10px] text-muted-foreground">−{dia.indisponiveis}</div>
      ) : (
        <div className="text-[10px] text-transparent">·</div>
      )}
    </div>
  );
}

/** Visão do gestor: quem informou disponibilidade e como o mês está coberto. */
export function DisponibilidadePainel() {
  const [escopo, setEscopo] = useState<string>(EMPRESA);
  const [competencia, setCompetencia] = useState<string>(competenciaInicial);
  const unidadeId = escopo === EMPRESA ? null : escopo;

  const unidades = useDpUnidades();
  const painel = useDpDisponibilidadePainel(unidadeId, competencia);
  const dados = painel.data ?? null;

  const aviso = useMemo(() => avisoJanela(dados?.janela), [dados?.janela]);
  const offset = useMemo(() => {
    if (!dados?.dias?.length) return 0;
    return new Date(`${dados.dias[0].data}T12:00:00`).getDay();
  }, [dados?.dias]);

  const pendentesDeInformacao = (dados?.colaboradores ?? []).filter((c) => !c.informou);
  const informaram = (dados?.colaboradores ?? []).filter((c) => c.informou);

  return (
    <div className="space-y-3">
      <DpContentCard>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1 space-y-1">
            <Label className="text-xs">Escopo</Label>
            <Select value={escopo} onValueChange={setEscopo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPRESA}>Toda a empresa</SelectItem>
                {(unidades.data ?? []).map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mês planejado</Label>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => setCompetencia((c) => somaMeses(c, -1))} aria-label="Mês anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[120px] text-center text-sm font-medium">
                {competenciaLabel(dados?.janela?.competencia ?? competencia)}
              </span>
              <Button variant="outline" size="icon" onClick={() => setCompetencia((c) => somaMeses(c, 1))} aria-label="Próximo mês">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {aviso ? (
          <div
            className={cn(
              "mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs",
              aviso.tom === "warn" ? "border-amber-500/40 bg-amber-500/5 text-amber-700" : "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            <CalendarRange className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{aviso.texto}</span>
          </div>
        ) : null}
      </DpContentCard>

      {painel.isLoading ? (
        <DpContentCard>
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando disponibilidade…
          </div>
        </DpContentCard>
      ) : !dados || dados.resumo.convocaveis === 0 ? (
        <DpContentCard>
          <DpEmptyState icon={Users} dashed>
            <span className="font-medium text-foreground">Nenhum convocável neste escopo</span>
            <span>Só entram aqui vínculos que trabalham por convocação (intermitente e freelancer) com cadastro ativo.</span>
          </DpEmptyState>
        </DpContentCard>
      ) : (
        <>
          <DpContentCard>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Chip icone={Users} valor={dados.resumo.convocaveis} rotulo="Convocáveis" />
              <Chip icone={UserCheck} valor={dados.resumo.informaram} rotulo="Informaram" />
              <Chip icone={Clock} valor={dados.resumo.sem_informacao} rotulo="Sem informação" tom={dados.resumo.sem_informacao > 0 ? "warn" : undefined} />
              <Chip icone={AlertTriangle} valor={dados.resumo.alteracoes_tardias} rotulo="Alterações tardias" tom={dados.resumo.alteracoes_tardias > 0 ? "warn" : undefined} />
            </div>
          </DpContentCard>

          <DpContentCard>
            <div className="mb-2 text-sm font-semibold">Disponíveis por dia</div>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
              {DIA_SEMANA.map((d, i) => <span key={i}>{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: offset }, (_, i) => <div key={`v${i}`} />)}
              {dados.dias.map((d) => <DiaCelula key={d.data} dia={d} />)}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              O número grande é quanta gente segue disponível no dia; o valor menor em vermelho é quem já avisou que não pode.
              Dias em âmbar estão apertados e em vermelho ninguém sobrou.
            </p>
          </DpContentCard>

          <DpContentCard>
            <div className="mb-2 text-sm font-semibold">
              Quem ainda não informou
              {pendentesDeInformacao.length > 0 ? (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[11px]">{pendentesDeInformacao.length}</Badge>
              ) : null}
            </div>
            {pendentesDeInformacao.length === 0 ? (
              <p className="text-xs text-muted-foreground">Todos os convocáveis já informaram sua disponibilidade deste mês.</p>
            ) : (
              <div className="space-y-1.5">
                {pendentesDeInformacao.map((c) => (
                  <div key={c.colaborador_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                    <span className="font-medium">{c.nome}</span>
                    <span className="text-muted-foreground">{c.cargo_nome ?? "—"} · {c.unidade_nome ?? "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </DpContentCard>

          <DpContentCard>
            <div className="mb-2 text-sm font-semibold">Já informaram</div>
            {informaram.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ninguém informou disponibilidade para este mês ainda.</p>
            ) : (
              <div className="space-y-1.5">
                {informaram.map((c) => (
                  <div key={c.colaborador_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                    <span className="font-medium">{c.nome}</span>
                    <span className="text-muted-foreground">
                      {c.dias_indisponiveis} dia(s) indisponível(is)
                    </span>
                    {c.alteracoes_tardias > 0 ? (
                      <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-700">
                        {c.alteracoes_tardias} tardia(s)
                      </Badge>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </DpContentCard>
        </>
      )}
    </div>
  );
}
