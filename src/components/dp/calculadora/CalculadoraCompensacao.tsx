import { useMemo, useState } from "react";
import { Plus, Trash2, Info } from "lucide-react";
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

export type PerfilCalculadora = "gestor" | "colaborador";

interface Jornada { id: number; nome: string; carga: string; qtd: string }

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

function teveArredondamento(entrada: string): boolean {
  const m = entrada.trim().replace(",", ".").match(/^[-+]?\d+\.(\d+)$/);
  if (!m) return false;
  return Math.abs((Number(`0.${m[1]}`) * 60) % 1) > 1e-9;
}

export function CalculadoraCompensacao({ perfil }: { perfil: PerfilCalculadora }) {
  return (
    <Tabs defaultValue="horas" className="space-y-4">
      <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
        <TabsTrigger value="horas">Horas & Folgas</TabsTrigger>
        <TabsTrigger value="ferias">Férias</TabsTrigger>
        <TabsTrigger value="prazos">Prazos & Rescisão</TabsTrigger>
      </TabsList>
      <TabsContent value="horas"><HorasFolgas perfil={perfil} /></TabsContent>
      <TabsContent value="ferias"><EmBreve /></TabsContent>
      <TabsContent value="prazos"><EmBreve /></TabsContent>
    </Tabs>
  );
}

function EmBreve() {
  return (
    <Card><CardContent className="py-10 text-center text-muted-foreground">
      <Badge variant="outline" className="mb-2">Em breve</Badge>
      <p className="text-sm">Esta calculadora estará disponível em uma próxima etapa.</p>
    </CardContent></Card>
  );
}

function HorasFolgas({ perfil }: { perfil: PerfilCalculadora }) {
  const [saldoTxt, setSaldoTxt] = useState("");
  const [jornadas, setJornadas] = useState<Jornada[]>(JORNADAS_INICIAIS);
  const [criterio, setCriterio] = useState<"menor_sobra" | "menor_folgas">("menor_sobra");
  const [negAtivo, setNegAtivo] = useState(false);
  const [limiteTxt, setLimiteTxt] = useState("");
  const [escolhida, setEscolhida] = useState(0);

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
    }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(validas)],
  );
  const nomeDe = (data: string) => validas.find((j) => j.id === Number(data.slice(0, 4)))?.nome ?? "";

  const sugestoes = useMemo(
    () => (saldoMin !== null ? sugerirCombinacoes({ saldoMinutos: saldoMin, dias, limiteNegativo: limite, criterio, maxDias: 10, maxSugestoes: 5 }) : []),
    [saldoMin, dias, limite, criterio],
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

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Saldo disponível</CardTitle>
          <CardDescription>Ex.: 32,9 · 32.9 · 32:54 · 32h54 · 45min</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <Input inputMode="decimal" value={saldoTxt} onChange={(e) => { setSaldoTxt(e.target.value); setEscolhida(0); }} placeholder="Informe o saldo" aria-label="Saldo de horas" />
          {saldoTxt && (saldo.ok
            ? <p className="text-sm">Equivale a <strong>{formatarMinutos(saldo.minutos)}</strong>
                {teveArredondamento(saldoTxt) && <span className="text-xs text-muted-foreground"> (arredondado ao minuto)</span>}</p>
            : <p className="text-sm text-destructive">{saldo.erro}</p>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Jornadas</CardTitle>
          <CardDescription>Horas líquidas por dia e quantos dias dessa jornada podem virar folga.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
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
        </CardContent>
      </Card>

      {saldo.ok && validas.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Comparação por jornada</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {validas.map((j) => {
              const disp = Math.max(0, saldo.minutos);
              const n = Math.floor(disp / j.min);
              return (
                <div key={j.id} className="flex flex-wrap justify-between gap-2 rounded-md border p-2 text-sm">
                  <span className="font-medium">{j.nome} · {formatarMinutos(j.min)}</span>
                  <span>{n} folga(s) · usa {formatarMinutos(n * j.min)} · sobra {formatarMinutos(disp - n * j.min)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {gestor && (
        <Card>
          <CardHeader><CardTitle className="text-base">Simulação de saldo negativo</CardTitle>
            <CardDescription>Apenas para análise do gestor. Não representa débito real.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2"><Switch checked={negAtivo} onCheckedChange={(v) => { setNegAtivo(v); setEscolhida(0); }} id="neg" /><Label htmlFor="neg">Permitir ficar negativo</Label></div>
            {negAtivo && (<>
              <Input value={limiteTxt} onChange={(e) => setLimiteTxt(e.target.value)} placeholder="Limite (ex.: 4 ou 2:30)" aria-label="Limite negativo" />
              {limiteTxt && !limiteParse.ok && <p className="text-sm text-destructive">{limiteParse.erro}</p>}
            </>)}
          </CardContent>
        </Card>
      )}

      {saldo.ok && (
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Sugestões</CardTitle>
            <Tabs value={criterio} onValueChange={(v) => { setCriterio(v as typeof criterio); setEscolhida(0); }}>
              <TabsList>
                <TabsTrigger value="menor_sobra">Menor sobra</TabsTrigger>
                <TabsTrigger value="menor_folgas">Menos folgas</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="space-y-2">
            {sugestoes.length === 0 && <p className="text-sm text-muted-foreground">Saldo insuficiente para qualquer folga com as jornadas informadas.</p>}
            {sugestoes.map((s, i) => (
              <button key={i} type="button" onClick={() => setEscolhida(i)}
                className={`w-full rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent ${sel === s ? "border-primary bg-accent" : ""}`}>
                <div className="font-medium">{agrupar(s.dias)}</div>
                <div className="text-muted-foreground">
                  {s.dias.length} dia(s) · compensa {formatarMinutos(s.minutosUsados)} · resta{" "}
                  <span className={s.saldoFinal < 0 ? "font-semibold text-destructive" : ""}>{formatarMinutos(s.saldoFinal)}</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {resultado && (
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Resultado</CardTitle>
            <Badge variant={STATUS[resultado.status].variant}>{STATUS[resultado.status].rotulo}</Badge>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <div>Saldo inicial: <strong>{formatarMinutos(resultado.saldoInicial)}</strong></div>
            <div>Folgas: <strong>{resultado.dias.length}</strong></div>
            <div className="sm:col-span-2">Jornadas: <strong>{agrupar(resultado.dias)}</strong></div>
            <div>Horas compensadas: <strong>{formatarMinutos(resultado.minutosUsados)}</strong></div>
            <div>Saldo restante: <strong className={resultado.saldoFinal < 0 ? "text-destructive" : ""}>{formatarMinutos(resultado.saldoFinal)}</strong></div>
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
