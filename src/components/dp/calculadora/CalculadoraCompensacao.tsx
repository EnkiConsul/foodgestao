import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Trash2, Info, Loader2, AlertTriangle } from "lucide-react";
import type { JornadaCarregada } from "@/lib/dp/compensacao/jornadasColaborador";
import { DOW_CURTO_CALC } from "@/lib/dp/compensacao/jornadasColaborador";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  parseHoras, formatarMinutos, simularCompensacao,
  type DiaCompensavel, type StatusSimulacao,
} from "@/lib/dp/compensacao/motor";
import { CalculadoraDesligamento, type RegistrarDesligamento } from "./CalculadoraDesligamento";
import { CalendarioSimulacao } from "./CalendarioSimulacao";
import { cenariosCompensacao, type Cenario, type GrupoJornada } from "@/lib/dp/compensacao/cenarios";

export type PerfilCalculadora = "gestor" | "colaborador";

interface Jornada { id: number; nome: string; carga: string; qtd: string; picos?: number; dows?: number[] }

const JORNADAS_INICIAIS: Jornada[] = [
  { id: 1, nome: "JORNADA A", carga: "8", qtd: "4" },
  { id: 2, nome: "JORNADA B", carga: "7", qtd: "2" },
];

const STATUS: Record<StatusSimulacao, { rotulo: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  positivo: { rotulo: "Saldo positivo", variant: "secondary" },
  zerado: { rotulo: "Saldo zerado", variant: "default" },
  negativo_permitido: { rotulo: "Saldo negativo (simulação)", variant: "destructive" },
  excede_limite: { rotulo: "Excede o limite", variant: "destructive" },
};

/** Ignora o "-" e devolve minutos positivos da carga, ou null. */
function cargaMin(s: string): number | null {
  const r = parseHoras(s);
  return r.ok && r.minutos > 0 ? r.minutos : null;
}

function erroDe(r: ReturnType<typeof parseHoras>): string {
  return "erro" in r ? r.erro : "";
}

function teveArredondamento(entrada: string): boolean {
  const m = entrada.trim().replace(",", ".").match(/^[-+]?\d+\.(\d+)$/);
  if (!m) return false;
  return Math.abs((Number(`0.${m[1]}`) * 60) % 1) > 1e-9;
}

/** Jornadas vindas do cadastro (somente leitura). Ausente = modo manual/avulso. */
export interface OrigemJornadas {
  /** Muda a cada colaborador; ao mudar, saldo e resultados são limpos. */
  chave: string;
  estado: "carregando" | "erro" | "sem_config" | "sem_vinculo" | "ok";
  jornadas: JornadaCarregada[];
  incompletos: number[];
  /** Unidade do colaborador: feriados e bloqueios do calendário. */
  unidadeId?: string | null;
  companyId?: string | null;
  colaboradorId?: string | null;
}

export const ORIENTACAO_SALDO_COLABORADOR =
  "Consulte seu saldo de banco de horas na folha de ponto disponibilizada pela empresa e informe-o aqui para simular quantos dias de folga podem ser compensados.";

const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

export function CalculadoraCompensacao({ perfil, origem, topo, admissao, onAbaChange, registrar }: {
  perfil: PerfilCalculadora; origem?: OrigemJornadas; topo?: ReactNode; admissao?: string | null;
  onAbaChange?: (aba: string) => void; registrar?: RegistrarDesligamento;
}) {
  // Desligamento só existe na árvore do gestor; o colaborador nunca monta o componente.
  const gestor = perfil === "gestor";
  // Jornada por dia da semana do cadastro, herdada pela aba Desligamento.
  const jornadaDow = origem?.estado === "ok" ? (() => {
    const arr = ["0", "0", "0", "0", "0", "0", "0"];
    origem.jornadas.forEach((j) => j.dows?.forEach((d) => { arr[d] = hhmm(j.minutos); }));
    return arr;
  })() : null;
  return (
    <div className="space-y-4">
      {topo}
      <Tabs defaultValue="compensatoria" className="space-y-4" onValueChange={onAbaChange}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="compensatoria">Folga Compensatória</TabsTrigger>
          {gestor && <TabsTrigger value="desligamento">Desligamento</TabsTrigger>}
        </TabsList>
        <TabsContent value="compensatoria" forceMount className="space-y-4 data-[state=inactive]:hidden"><HorasFolgas perfil={perfil} origem={origem} /></TabsContent>
        {gestor && <TabsContent value="desligamento" forceMount className="data-[state=inactive]:hidden"><CalculadoraDesligamento chave={origem?.chave} admissaoInicial={admissao ?? null} jornadaInicial={jornadaDow} unidadeId={origem?.unidadeId ?? null} registrar={registrar} /></TabsContent>}
      </Tabs>
    </div>
  );
}


function HorasFolgas({ perfil, origem }: { perfil: PerfilCalculadora; origem?: OrigemJornadas }) {
  const [saldoTxt, setSaldoTxt] = useState("");
  const [jornadas, setJornadas] = useState<Jornada[]>(JORNADAS_INICIAIS);
  const [negAtivo, setNegAtivo] = useState(false);
  const [escolhida, setEscolhida] = useState(0);
  const [editar, setEditar] = useState(false);
  const [diasCal, setDiasCal] = useState<Set<string>>(new Set());
  useEffect(() => { setDiasCal(new Set()); }, [origem?.chave]);

  const chave = origem?.chave ?? "manual";
  const estado = origem?.estado;
  // Troca de colaborador (ou volta ao manual): mantém o saldo digitado e recalcula.
  useEffect(() => {
    setEscolhida(0); setEditar(false);
    if (!origem) setJornadas(JORNADAS_INICIAIS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  // Nunca inventa jornada: sem cadastro completo, a lista fica vazia até o usuário digitar.
  useEffect(() => {
    if (!origem || estado === "carregando") return;
    setJornadas(estado === "ok"
      ? origem.jornadas.map((j, i) => ({ id: i + 1, nome: j.nome, carga: hhmm(j.minutos), qtd: String(j.qtd), picos: j.picos ?? 0, dows: j.dows }))
      : []);
    setEscolhida(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, estado]);

  const gestor = perfil === "gestor";
  const saldo = parseHoras(saldoTxt);
  const saldoMin = saldo.ok ? saldo.minutos : null;
  const validas = jornadas
    .map((j) => ({ ...j, min: cargaMin(j.carga), n: Math.min(31, Math.max(0, Math.floor(Number(j.qtd) || 0))) }))
    .filter((j): j is typeof j & { min: number } => j.min !== null);

  // Saldo negativo (só gestor): permite ficar devendo até uma jornada, sem digitar limite.
  const limite = gestor && negAtivo ? Math.max(0, ...validas.map((j) => j.min)) : 0;

  // Folgas podem cair em semanas diferentes: até 4 semanas de cada dia da escala.
  const SEMANAS = 4;
  const grupos: GrupoJornada[] = validas.flatMap((j) => {
    const p = Math.min(j.n, j.picos ?? 0);
    return [
      { rotulo: j.nome, minutos: j.min, pico: false, max: (j.n - p) * SEMANAS },
      { rotulo: j.nome, minutos: j.min, pico: true, max: p * SEMANAS },
    ];
  });
  const cenarios = useMemo(
    () => (saldoMin !== null ? cenariosCompensacao(grupos, saldoMin, limite) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saldoMin, limite, JSON.stringify(grupos)],
  );
  // Calendário só quando se sabe em que dia da semana cada jornada cai (escala do cadastro).
  const minutosPorDow = new Map<number, number>();
  if (origem?.estado === "ok" && !editar) validas.forEach((j) => j.dows?.forEach((d) => minutosPorDow.set(d, j.min)));
  const podeCalendario = minutosPorDow.size > 0;
  const calendario = escolhida === -1 && podeCalendario;
  const sel = calendario ? undefined : cenarios[Math.min(Math.max(escolhida, 0), cenarios.length - 1)];
  const resultado = sel && saldo.ok ? simularCompensacao({ saldoMinutos: saldo.minutos, dias: diasDoCenario(sel), limiteNegativo: limite }) : null;

  const agrupar = (c: Cenario) => c.itens.map((i) => `${i.n}× ${i.rotulo} (${formatarMinutos(i.minutos)})`).join(" + ");

  const atualizar = (id: number, campo: keyof Jornada, v: string) =>
    setJornadas((js) => js.map((j) => (j.id === id ? { ...j, [campo]: campo === "nome" ? v.toUpperCase() : v } : j)));

  const resumoEscala = validas.map((j) => `${j.n}× ${formatarMinutos(j.min)}`).join(" + ");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="calc-saldo" className="text-xs">Saldo de horas <span className="text-muted-foreground">(ex.: 32:54 · 32,9 · 45min)</span></Label>
            {!gestor && <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">{ORIENTACAO_SALDO_COLABORADOR}</p>}
            <Input id="calc-saldo" inputMode="decimal" value={saldoTxt} onChange={(e) => { setSaldoTxt(e.target.value); setEscolhida(0); }} placeholder="Informe o saldo" aria-label="Saldo de horas" />
            {gestor && <p className="text-xs text-muted-foreground">Digitado por você; não vem do cadastro e continua ao trocar de colaborador.</p>}
            {saldoTxt && (saldo.ok
              ? <p className="text-sm">Equivale a <strong>{formatarMinutos(saldo.minutos)}</strong>
                  {teveArredondamento(saldoTxt) && <span className="text-xs text-muted-foreground"> (arredondado ao minuto)</span>}</p>
              : <p className="text-sm text-destructive">{erroDe(saldo)}</p>)}
          </div>
          {gestor && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Switch checked={negAtivo} onCheckedChange={(v) => { setNegAtivo(v); setEscolhida(0); }} id="neg" />
                <Label htmlFor="neg" className="text-sm">Simulação de saldo negativo</Label>
                <span title="Apenas para análise do gestor. Não representa débito real." aria-label="Apenas para análise do gestor. Não representa débito real."><Info className="h-4 w-4 text-muted-foreground" /></span>
              </div>
              {negAtivo && <p className="text-xs text-muted-foreground">As sugestões podem passar do saldo em até uma jornada. Só análise; não é débito real.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardContent className="space-y-2 pt-4">
          {origem?.estado === "carregando" && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando jornadas…</p>}
          {origem?.estado === "erro" && <AvisoJornada texto="Não foi possível ler as jornadas cadastradas. Informe-as manualmente ou tente novamente." />}
          {origem?.estado === "sem_config" && <AvisoJornada texto="Não há configuração de trabalho vigente cadastrada. Informe as jornadas manualmente." />}
          {origem?.estado === "sem_vinculo" && <AvisoJornada texto="Seu acesso não está vinculado a um cadastro de colaborador ativo. Informe as jornadas manualmente." />}
          {origem?.estado === "ok" && origem.incompletos.length > 0 && (
            <AvisoJornada texto={`Sem horário cadastrado em: ${origem.incompletos.map((d) => DOW_CURTO_CALC[d]).join(", ")}. Esses dias não entraram na simulação.`} />
          )}
          {origem?.estado === "ok" && !editar ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span><span className="text-muted-foreground">Escala do cadastro:</span> <strong>{resumoEscala || "—"}</strong></span>
              <Button variant="ghost" size="sm" onClick={() => setEditar(true)}>Ajustar jornadas</Button>
            </div>
          ) : (<>
            {origem?.estado === "ok" && (
              <p className="flex gap-2 rounded-md bg-muted p-2 text-xs text-muted-foreground"><Info className="h-4 w-4 shrink-0" />Ajuste só desta simulação — o cadastro e a escala do colaborador não mudam.</p>
            )}
            <p className="text-xs text-muted-foreground">Horas líquidas por dia e quantos dias dessa jornada podem virar folga.</p>
            {jornadas.map((j) => (
              <div key={j.id} className="grid grid-cols-[1fr_5rem_4rem_auto] items-end gap-2">
                <div><Label className="text-xs">Nome</Label><Input value={j.nome} onChange={(e) => atualizar(j.id, "nome", e.target.value)} /></div>
                <div><Label className="text-xs">Horas</Label><Input value={j.carga} onChange={(e) => atualizar(j.id, "carga", e.target.value)}
                  className={j.carga && cargaMin(j.carga) === null ? "border-destructive" : ""} /></div>
                <div><Label className="text-xs">Dias</Label><Input inputMode="numeric" value={j.qtd} onChange={(e) => atualizar(j.id, "qtd", e.target.value.replace(/\D/g, ""))} /></div>
                <Button variant="ghost" size="icon" aria-label="Remover jornada" onClick={() => setJornadas((js) => js.filter((x) => x.id !== j.id))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setJornadas((js) => [...js, { id: Math.max(0, ...js.map((x) => x.id)) + 1, nome: `JORNADA ${String.fromCharCode(65 + js.length)}`, carga: "", qtd: "1" }])}>
              <Plus className="h-4 w-4" /> Adicionar jornada
            </Button>
          </>)}
        </CardContent>
      </Card>


      {saldo.ok && (
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Resultado</CardTitle>
            {resultado && <Badge variant={STATUS[resultado.status].variant}>{STATUS[resultado.status].rotulo}</Badge>}
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {cenarios.length === 0 && <p className="text-muted-foreground">Saldo insuficiente para qualquer folga com as jornadas informadas.</p>}
            {cenarios.map((c, i) => {
              const ativo = !calendario && sel === c;
              return (
                <button key={c.tipo} type="button" onClick={() => setEscolhida(i)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${ativo ? "border-primary bg-accent" : "hover:bg-accent/60"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">Opção {i + 1} · {c.tipo === "menor_sobra" && c.saldoFinal < 0 ? "Menor saldo devedor" : ROTULO_CENARIO[c.tipo]}</span>
                    {i === 0 && <Badge variant="outline">Melhor sugestão encontrada</Badge>}
                    {c.saldoFinal < 0 && <Badge variant="destructive">Saldo negativo</Badge>}
                  </div>
                  <div className={ativo ? "mt-1 text-lg font-semibold" : "mt-1 font-semibold"}>{c.dias} folga(s)</div>
                  <div className="font-medium">{agrupar(c)}</div>
                  <div className="text-muted-foreground">
                    Compensa <strong className="text-foreground">{formatarMinutos(c.minutosUsados)}</strong> · resta{" "}
                    <strong className={c.saldoFinal < 0 ? "text-destructive" : "text-foreground"}>{formatarMinutos(c.saldoFinal)}</strong>
                  </div>
                </button>
              );
            })}
            {cenarios.length > 0 && <p className="text-xs text-muted-foreground">As folgas podem cair em semanas diferentes.</p>}
            {podeCalendario ? (
              <div className={`rounded-md border p-3 ${calendario ? "border-primary" : ""}`}>
                <button type="button" className="w-full text-left" onClick={() => setEscolhida(calendario ? 0 : -1)}>
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Opção {cenarios.length + 1} · Escolher no calendário</span>
                  {!calendario && <div className="text-muted-foreground">Escolha os dias e veja quanto sobra.</div>}
                </button>
                {calendario && (
                  <div className="mt-3">
                    <CalendarioSimulacao minutosPorDow={minutosPorDow} saldoMin={saldo.minutos} unidadeId={origem?.unidadeId} companyId={origem?.companyId} colaboradorId={origem?.colaboradorId} sel={diasCal} setSel={setDiasCal} />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Para escolher no calendário, selecione um colaborador e use a escala do cadastro.</p>
            )}
          </CardContent>
        </Card>
      )}

      <p className="flex gap-2 text-xs text-muted-foreground lg:col-span-2">
        <Info className="h-4 w-4 shrink-0" />
        Esta ferramenta realiza apenas simulações. O resultado não representa saldo oficial, aprovação de folga ou autorização de desconto.
      </p>
    </div>
  );
}

const ROTULO_CENARIO: Record<Cenario["tipo"], string> = {
  meio_semana: "Só meio de semana",
  menor_sobra: "Menor saldo restante",
  fim_semana: "Só fim de semana",
};

/** Dias fictícios do cenário, só para o motor de simulação conferir o status. */
function diasDoCenario(c: Cenario): DiaCompensavel[] {
  let k = 0;
  return c.itens.flatMap((i) => Array.from({ length: i.n }, () => ({ data: `c-${String(k++).padStart(3, "0")}`, minutos: i.minutos, pico: i.pico })));
}

function AvisoJornada({ texto }: { texto: string }) {
  return <p className="flex gap-2 rounded-md border border-destructive/30 p-2 text-xs text-destructive" role="status"><AlertTriangle className="h-4 w-4 shrink-0" />{texto}</p>;
}
