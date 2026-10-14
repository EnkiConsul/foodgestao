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
  parseHoras, formatarMinutos, sugerirCombinacoes, simularCompensacao,
  type DiaCompensavel, type StatusSimulacao,
} from "@/lib/dp/compensacao/motor";
import { CalculadoraDesligamento } from "./CalculadoraDesligamento";

export type PerfilCalculadora = "gestor" | "colaborador";

interface Jornada { id: number; nome: string; carga: string; qtd: string; picos?: number }

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
}

export const ORIENTACAO_SALDO_COLABORADOR =
  "Consulte seu saldo de banco de horas na folha de ponto disponibilizada pela empresa e informe-o aqui para simular quantos dias de folga podem ser compensados.";

const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

export function CalculadoraCompensacao({ perfil, origem, topo }: { perfil: PerfilCalculadora; origem?: OrigemJornadas; topo?: ReactNode }) {
  // Desligamento só existe na árvore do gestor; o colaborador nunca monta o componente.
  const gestor = perfil === "gestor";
  return (
    <Tabs defaultValue="compensatoria" className="space-y-4">
      <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
        <TabsTrigger value="compensatoria">Folga Compensatória</TabsTrigger>
        {gestor && <TabsTrigger value="desligamento">Desligamento</TabsTrigger>}
      </TabsList>
      <TabsContent value="compensatoria" className="space-y-4">{topo}<HorasFolgas perfil={perfil} origem={origem} /></TabsContent>
      {gestor && <TabsContent value="desligamento"><CalculadoraDesligamento /></TabsContent>}
    </Tabs>
  );
}


function HorasFolgas({ perfil, origem }: { perfil: PerfilCalculadora; origem?: OrigemJornadas }) {
  const [saldoTxt, setSaldoTxt] = useState("");
  const [jornadas, setJornadas] = useState<Jornada[]>(JORNADAS_INICIAIS);
  const [negAtivo, setNegAtivo] = useState(false);
  const [limiteTxt, setLimiteTxt] = useState("");
  const [escolhida, setEscolhida] = useState(0);
  const [editar, setEditar] = useState(false);

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
      ? origem.jornadas.map((j, i) => ({ id: i + 1, nome: j.nome, carga: hhmm(j.minutos), qtd: String(j.qtd), picos: j.picos ?? 0 }))
      : []);
    setEscolhida(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, estado]);

  const gestor = perfil === "gestor";
  const saldo = parseHoras(saldoTxt);
  const saldoMin = saldo.ok ? saldo.minutos : null;
  const limiteParse = parseHoras(limiteTxt);
  // Colaborador nunca tem limite negativo, independentemente do estado da tela.
  const limite = gestor && negAtivo && limiteParse.ok ? Math.abs(limiteParse.minutos) : 0;

  const validas = jornadas
    .map((j) => ({ ...j, min: cargaMin(j.carga), n: Math.min(31, Math.max(0, Math.floor(Number(j.qtd) || 0))) }))
    .filter((j): j is typeof j & { min: number } => j.min !== null);

  const dias: DiaCompensavel[] = useMemo(
    () => validas.flatMap((j) => Array.from({ length: j.n }, (_, i) => ({
      data: `${String(j.id).padStart(4, "0")}-${String(i).padStart(2, "0")}`, minutos: j.min,
      // Os últimos dias do grupo são os de pico (sex/sáb/dom): evitados na sugestão.
      pico: i >= j.n - Math.min(j.n, j.picos ?? 0),
    }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(validas)],
  );
  const nomeDe = (data: string) => validas.find((j) => j.id === Number(data.slice(0, 4)))?.nome ?? "";

  const sugestoes = useMemo(
    () => (saldoMin !== null
      ? sugerirCombinacoes({ saldoMinutos: saldoMin, dias, limiteNegativo: limite, maxDias: 10, maxSugestoes: 5 })
      : Object.assign([], { buscaCompleta: true })),
    [saldoMin, dias, limite],
  );
  const sel = sugestoes[Math.min(escolhida, sugestoes.length - 1)];
  const resultado = sel && saldo.ok ? simularCompensacao({ saldoMinutos: saldo.minutos, dias: sel.dias, limiteNegativo: limite }) : null;

  const agrupar = (ds: DiaCompensavel[]) => {
    const m = new Map<string, { n: number; min: number }>();
    ds.forEach((d) => { const k = nomeDe(d.data); const v = m.get(k) ?? { n: 0, min: d.minutos }; v.n++; m.set(k, v); });
    return [...m.entries()].map(([nome, v]) => `${v.n}× ${nome} (${formatarMinutos(v.min)})`).join(" + ");
  };

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
              {negAtivo && (<>
                <Input value={limiteTxt} onChange={(e) => setLimiteTxt(e.target.value)} placeholder="Limite (ex.: 4 ou 2:30)" aria-label="Limite negativo" />
                {limiteTxt && !limiteParse.ok
                  ? <p className="text-sm text-destructive">{erroDe(limiteParse)}</p>
                  : <p className="text-xs text-muted-foreground">Só análise; não é débito real.</p>}
              </>)}
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
          <CardContent className="space-y-3 text-sm">
            {sugestoes.length === 0 && <p className="text-muted-foreground">Saldo insuficiente para qualquer folga com as jornadas informadas.</p>}
            {resultado && (
              <div className="rounded-md border border-primary bg-accent p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {escolhida === 0 && <Badge variant="outline">Melhor sugestão encontrada</Badge>}
                  {resultado.saldoFinal < 0 && <Badge variant="destructive">Saldo negativo</Badge>}
                </div>
                <div className="mt-2 text-lg font-semibold">{resultado.dias.length} folga(s)</div>
                <div className="font-medium">{agrupar(resultado.dias)}</div>
                <div className="mt-1 text-muted-foreground">
                  Compensa <strong className="text-foreground">{formatarMinutos(resultado.minutosUsados)}</strong> · resta{" "}
                  <strong className={resultado.saldoFinal < 0 ? "text-destructive" : "text-foreground"}>{formatarMinutos(resultado.saldoFinal)}</strong>
                </div>
              </div>
            )}
            {sugestoes.length > 1 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Outras opções (saldo mais próximo de zero primeiro):</p>
                {sugestoes.map((s, i) => (i === Math.min(escolhida, sugestoes.length - 1) ? null : (
                  <button key={i} type="button" onClick={() => setEscolhida(i)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-left text-xs transition-colors hover:bg-accent">
                    <span className="font-medium">{s.dias.length} folga(s) · {agrupar(s.dias)}</span>
                    <span className={s.saldoFinal < 0 ? "font-semibold text-destructive" : "text-muted-foreground"}>
                      {i === 0 ? "Melhor · " : ""}resta {formatarMinutos(s.saldoFinal)}
                      {s.saldoFinal < 0 && <Badge variant="destructive" className="ml-1">Saldo negativo</Badge>}
                    </span>
                  </button>
                )))}
              </div>
            )}
            {sugestoes.length > 0 && !sugestoes.buscaCompleta && (
              <p className="text-xs text-muted-foreground">Muitas combinações possíveis: a busca foi limitada e mostra as melhores encontradas.</p>
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

function AvisoJornada({ texto }: { texto: string }) {
  return <p className="flex gap-2 rounded-md border border-destructive/30 p-2 text-xs text-destructive" role="status"><AlertTriangle className="h-4 w-4 shrink-0" />{texto}</p>;
}
