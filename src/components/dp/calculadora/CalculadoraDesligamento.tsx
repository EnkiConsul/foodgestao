import { useEffect, useMemo, useState } from "react";
import { Info, Plus, X, CalendarCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { parseHoras, formatarMinutos } from "@/lib/dp/compensacao/motor";
import {
  simularDesligamento, type ClassificacaoDia, type ModalidadeAviso, type ReducaoArt488,
  type ResultadoDesligamento, type MotivoRejeicao, type MotivoDesligamentoCalc,
} from "@/lib/dp/compensacao/desligamentoMotor";
import { useDpFeriados } from "@/hooks/useDpFeriados";
import { datasDeFeriados } from "@/lib/dp/feriados";

/**
 * Simulação de aviso prévio e término de vínculo (CLT).
 * Só em memória: não lê nem grava dados, não solicita folga, não registra desligamento.
 * Montado apenas para o perfil gestor (ver CalculadoraCompensacao).
 */

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const JORNADA_EXEMPLO = ["0", "8", "8", "8", "8", "8", "4"];

const CLASSE: Record<ClassificacaoDia, { rotulo: string; cls: string }> = {
  trabalho_previsto: { rotulo: "Trabalho", cls: "border-primary/40 bg-primary/10" },
  folga_regular: { rotulo: "DSR / sem expediente", cls: "bg-muted text-muted-foreground" },
  ausencia_legal_aviso: { rotulo: "Ausência legal (art. 488)", cls: "border-destructive/40 bg-destructive/10" },
  folga_compensatoria: { rotulo: "Folga compensatória (simulada)", cls: "border-secondary bg-secondary" },
};

const MOTIVO: Record<MotivoRejeicao, string> = {
  data_invalida: "data inválida",
  duplicada: "data repetida",
  fora_do_periodo_trabalhado: "fora do período de comparecimento",
  dia_sem_jornada: "dia sem jornada (DSR, feriado ou sem expediente)",
  dia_de_ausencia_legal: "dia já coberto pela ausência legal",
  excede_saldo: "saldo insuficiente para essa jornada",
  aviso_indenizado: "aviso indenizado não tem jornadas",
};

/** Grupos de motivo da calculadora: os sem aviso usam "outro" como representante. */
type MotivoCalc = "dispensa_sem_justa_causa" | "pedido_demissao" | "acordo_mutuo" | "outro";
const MOTIVO_ROTULO: Record<MotivoCalc, string> = {
  dispensa_sem_justa_causa: "Dispensa sem justa causa (empresa)",
  pedido_demissao: "Pedido de demissão (colaborador)",
  acordo_mutuo: "Acordo mútuo (art. 484-A)",
  outro: "Outros motivos sem aviso prévio",
};

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const br = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const semana = (iso: string) => DIAS[new Date(`${iso}T00:00:00Z`).getUTCDay()];

/** Concentra folgas nas últimas jornadas efetivas, enquanto o saldo cobre a jornada inteira. */
function concentrarNoFinal(base: ResultadoDesligamento, saldoMin: number): string[] {
  const out: string[] = [];
  let resto = saldoMin;
  const trab = base.calendario.filter((d) => d.classificacao === "trabalho_previsto");
  for (let i = trab.length - 1; i >= 0; i--) {
    if (trab[i].jornadaPrevista > resto) break;
    resto -= trab[i].jornadaPrevista;
    out.push(trab[i].data);
  }
  return out.sort();
}

/** Atalho opcional para a ficha: só leva decisões, nunca grava. */
export type RegistrarDesligamento = {
  rotulo: string;
  bloqueio?: string | null;
  abrir: (r: {
    data_comunicacao: string; modalidade: ModalidadeAviso; reducao: ReducaoArt488 | null;
    motivo: MotivoDesligamentoCalc; data_termino_acordada?: string | null; descontar_aviso?: boolean;
    simulado: { ultimo: string | null; prazo: string; comFolgas: boolean };
  }) => void;
};

export function CalculadoraDesligamento({ chave, admissaoInicial = null, jornadaInicial = null, unidadeId = null, registrar }: {
  chave?: string; admissaoInicial?: string | null; jornadaInicial?: string[] | null; unidadeId?: string | null; registrar?: RegistrarDesligamento;
} = {}) {
  const [admissao, setAdmissao] = useState("");
  const [comunicacao, setComunicacao] = useState(hojeLocal());
  const [motivo, setMotivo] = useState<MotivoCalc>("dispensa_sem_justa_causa");
  const [modalidade, setModalidade] = useState<ModalidadeAviso>("trabalhado");
  const [reducao, setReducao] = useState<ReducaoArt488>("duas_horas");
  const [terminoAcordado, setTerminoAcordado] = useState("");
  const [descontar, setDescontar] = useState(false);
  const [jornada, setJornada] = useState<string[]>(JORNADA_EXEMPLO);
  const [jornadaEditada, setJornadaEditada] = useState(false);
  const [feriadosManuais, setFeriados] = useState<string[]>([]);
  const [novoFeriado, setNovoFeriado] = useState("");
  const [saldoTxt, setSaldoTxt] = useState("");
  const [folgas, setFolgas] = useState<string[]>([]);
  // Feriados cadastrados na unidade do colaborador entram sozinhos (ano da comunicação e seguinte).
  const [feriadosUnidade, setFeriadosUnidade] = useState<string[]>([]);
  useEffect(() => { if (!unidadeId) setFeriadosUnidade([]); }, [unidadeId]);
  const feriados = useMemo(() => [...new Set([...feriadosUnidade, ...feriadosManuais])].sort(), [feriadosUnidade, feriadosManuais]);
  // Colaborador selecionado no topo: preenche admissão e jornada do cadastro (editáveis).
  const jornadaKey = jornadaInicial?.join("|") ?? "";
  useEffect(() => {
    if (!chave) return;
    if (admissaoInicial) setAdmissao(admissaoInicial.slice(0, 10));
    if (jornadaInicial) { setJornada(jornadaInicial); setJornadaEditada(false); }
    setFolgas([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, admissaoInicial, jornadaKey]);

  const semAviso = motivo === "outro";
  const pedidoDispensado = motivo === "pedido_demissao" && modalidade === "indenizado";
  const comJornadas = !semAviso && modalidade === "trabalhado";

  const jornadaMin = jornada.map((t) => {
    if (!t.trim()) return 0;
    const r = parseHoras(t);
    return r.ok && r.minutos >= 0 ? r.minutos : null;
  });
  const jornadaOk = jornadaMin.every((m) => m !== null);
  const saldoParse = parseHoras(saldoTxt);
  const saldoVazio = !saldoTxt.trim();
  // Vazio = 0. Negativo ou inválido bloqueia a simulação — nunca vira 0 em silêncio.
  const saldoMin = saldoVazio ? 0 : saldoParse.ok && saldoParse.minutos >= 0 ? saldoParse.minutos : null;
  const saldoErro = saldoVazio || saldoMin !== null ? null
    : !saldoParse.ok ? ("erro" in saldoParse ? saldoParse.erro : "Saldo inválido.")
    : "Informe apenas saldo positivo.";

  const params = admissao && comunicacao && (semAviso || (jornadaOk && saldoMin !== null)) ? {
    dataAdmissao: admissao, dataComunicacao: comunicacao, modalidade,
    motivo: motivo as MotivoDesligamentoCalc,
    reducao: modalidade === "trabalhado" && motivo === "dispensa_sem_justa_causa" ? reducao : null,
    dataTerminoAcordada: pedidoDispensado && terminoAcordado ? terminoAcordado : null,
    descontarAviso: pedidoDispensado ? descontar : undefined,
    jornadaSemanal: (semAviso ? [0, 0, 0, 0, 0, 0, 0] : jornadaMin) as [number, number, number, number, number, number, number],
    feriados, saldoBancoMinutos: saldoMin ?? 0,
  } : null;

  const base = useMemo(() => (params ? simularDesligamento({ ...params, folgasCompensatorias: [] }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(params)]);
  const sim = useMemo(() => (params ? simularDesligamento({ ...params, folgasCompensatorias: folgas }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(params), folgas]);

  const erro = sim && "erro" in sim ? sim.erro : null;
  const r = sim && !("erro" in sim) ? sim : null;
  const b = base && !("erro" in base) ? base : null;

  const alternar = (d: string) => setFolgas((fs) => (fs.includes(d) ? fs.filter((x) => x !== d) : [...fs, d].sort()));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {unidadeId && <FeriadosUnidade unidadeId={unidadeId} desde={comunicacao} onDatas={setFeriadosUnidade} />}
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Aviso prévio</CardTitle>
            <CardDescription>Motivo e condições do desligamento (regime CLT).</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="mb-1 block">Motivo</Label>
              <RadioGroup value={motivo} onValueChange={(v) => { setMotivo(v as MotivoCalc); setFolgas([]); }} className="grid gap-2">
                {(Object.keys(MOTIVO_ROTULO) as MotivoCalc[]).map((m) => (
                  <div key={m} className="flex items-center gap-2"><RadioGroupItem value={m} id={`mot-${m}`} /><Label htmlFor={`mot-${m}`}>{MOTIVO_ROTULO[m]}</Label></div>
                ))}
              </RadioGroup>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="dsl-adm">Data de admissão</Label>
                <Input id="dsl-adm" type="date" value={admissao} onChange={(e) => { setAdmissao(e.target.value); setFolgas([]); }} /></div>
              <div><Label htmlFor="dsl-com">{semAviso ? "Data do término" : "Comunicação (simulada)"}</Label>
                <Input id="dsl-com" type="date" value={comunicacao} onChange={(e) => { setComunicacao(e.target.value); setFolgas([]); }} /></div>
            </div>
            {!semAviso && (
              <div>
                <Label className="mb-1 block">{motivo === "pedido_demissao" ? "Cumprimento do aviso (30 dias)" : "Modalidade"}</Label>
                <RadioGroup value={modalidade} onValueChange={(v) => { setModalidade(v as ModalidadeAviso); setFolgas([]); }} className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2"><RadioGroupItem value="trabalhado" id="m-trab" /><Label htmlFor="m-trab">Trabalhado</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="indenizado" id="m-ind" />
                    <Label htmlFor="m-ind">{motivo === "pedido_demissao" ? "Empresa dispensa o cumprimento" : "Indenizado"}</Label></div>
                </RadioGroup>
              </div>
            )}
            {modalidade === "trabalhado" && motivo === "dispensa_sem_justa_causa" && (
              <div>
                <Label className="mb-1 block">Redução legal (art. 488 — escolha do colaborador)</Label>
                <RadioGroup value={reducao} onValueChange={(v) => { setReducao(v as ReducaoArt488); setFolgas([]); }} className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2"><RadioGroupItem value="duas_horas" id="r-2h" /><Label htmlFor="r-2h">2 horas por dia</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="sete_dias" id="r-7d" /><Label htmlFor="r-7d">7 dias corridos no final</Label></div>
                </RadioGroup>
              </div>
            )}
            {motivo === "pedido_demissao" && modalidade === "trabalhado" && (
              <p className="text-xs text-muted-foreground">No pedido de demissão não há redução de 2 horas nem de 7 dias (o art. 488 só vale para aviso dado pela empresa).</p>
            )}
            {motivo === "acordo_mutuo" && modalidade === "trabalhado" && (
              <p className="text-xs text-muted-foreground">No acordo mútuo, a redução pela metade (art. 484-A) vale só para o aviso indenizado. Trabalhado: 30 dias cumpridos, sem redução automática de 2 horas ou 7 dias; se as partes combinaram algo diferente, valide com o jurídico.</p>
            )}
            {motivo === "acordo_mutuo" && modalidade === "indenizado" && (
              <p className="text-xs text-muted-foreground">Acordo mútuo com aviso indenizado: a lei reduz o aviso pela metade (art. 484-A, I, “a”).</p>
            )}
            {pedidoDispensado && (
              <div className="space-y-3 rounded-md border p-3">
                <div><Label htmlFor="dsl-term">Término acordado (vazio = na data do pedido)</Label>
                  <Input id="dsl-term" type="date" value={terminoAcordado} min={comunicacao} onChange={(e) => setTerminoAcordado(e.target.value)} /></div>
                <div>
                  <Label className="mb-1 block">Desconto do aviso</Label>
                  <RadioGroup value={descontar ? "com" : "sem"} onValueChange={(v) => setDescontar(v === "com")} className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2"><RadioGroupItem value="sem" id="d-sem" /><Label htmlFor="d-sem">Sem descontar</Label></div>
                    <div className="flex items-center gap-2"><RadioGroupItem value="com" id="d-com" /><Label htmlFor="d-com">Descontar</Label></div>
                  </RadioGroup>
                  <p className="mt-1 text-xs text-muted-foreground">Dispensar o cumprimento é liberalidade da empresa e não exige prova de novo emprego. O desconto do aviso no pedido de demissão é tema controverso: confirme com a contabilidade ou o jurídico.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {comJornadas && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">Jornada por dia da semana
                {!jornadaEditada && <Badge variant="outline">Exemplo editável</Badge>}</CardTitle>
              <CardDescription>Horas líquidas. Deixe 0 no DSR e nos dias sem expediente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-7 gap-1">
                {DIAS.map((d, i) => (
                  <div key={d}><Label htmlFor={`j-${i}`} className="text-xs">{d}</Label>
                    <Input id={`j-${i}`} aria-label={`Jornada ${d}`} inputMode="decimal" className={`px-1 text-center ${jornadaMin[i] === null ? "border-destructive" : ""}`}
                      value={jornada[i]} onChange={(e) => { setJornadaEditada(true); setFolgas([]); setJornada((js) => js.map((x, k) => (k === i ? e.target.value : x))); }} /></div>
                ))}
              </div>
              {!jornadaOk && <p className="text-sm text-destructive">Corrija a jornada destacada (ex.: 8, 7:20, 6h30).</p>}
              <div>
                <Label className="text-xs">Feriados no período</Label>
                <div className="flex gap-2">
                  <Input type="date" aria-label="Novo feriado" value={novoFeriado} onChange={(e) => setNovoFeriado(e.target.value)} />
                  <Button type="button" variant="outline" size="icon" aria-label="Adicionar feriado" disabled={!novoFeriado}
                    onClick={() => { if (!feriados.includes(novoFeriado)) setFeriados([...feriadosManuais, novoFeriado].sort()); setNovoFeriado(""); setFolgas([]); }}>
                    <Plus className="h-4 w-4" /></Button>
                </div>
                {feriados.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{feriados.map((f) => (
                  <Badge key={f} variant="secondary" className="gap-1">{br(f)}
                    {feriadosUnidade.includes(f) ? <span className="text-[10px] text-muted-foreground">unidade</span>
                      : <button type="button" aria-label={`Remover feriado ${br(f)}`} onClick={() => { setFeriados(feriadosManuais.filter((x) => x !== f)); setFolgas([]); }}><X className="h-3 w-3" /></button>}</Badge>
                ))}</div>}
              </div>
            </CardContent>
          </Card>
        )}

        {comJornadas && (
          <Card>
            <CardHeader><CardTitle className="text-base">Banco de horas (simulação)</CardTitle>
              <CardDescription>Saldo positivo. Toque nos dias de trabalho do calendário para simular folgas.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              <Input aria-label="Saldo do banco de horas" inputMode="decimal" placeholder="Ex.: 16 ou 24:30" value={saldoTxt}
                onChange={(e) => { setSaldoTxt(e.target.value); setFolgas([]); }} />
              {saldoErro && <p role="alert" className="text-sm text-destructive">{saldoErro}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={!b || modalidade !== "trabalhado" || !saldoMin}
                  onClick={() => b && saldoMin && setFolgas(concentrarNoFinal(b, saldoMin))}>Concentrar no final</Button>
                <Button type="button" variant="ghost" size="sm" disabled={!folgas.length} onClick={() => setFolgas([])}>Limpar folgas</Button>
              </div>
              <p className="text-xs text-muted-foreground">Concentra folgas consecutivas nas últimas jornadas para antecipar o último dia de trabalho. Para simular folgas intercaladas, selecione os dias diretamente no calendário.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        {!params && <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          {saldoErro ? "Corrija o saldo do banco de horas para simular." : "Informe a data de admissão para simular."}</CardContent></Card>}
        {erro && <Card><CardContent className="py-6 text-sm text-destructive">{erro}</CardContent></Card>}
        {r && b && (r.semAviso ? <ResultadoSemAviso r={r} /> : <Resultado r={r} b={b} onAlternar={alternar} />)}
        {registrar && (
          <Card><CardContent className="space-y-2 py-4">
            <Button className="w-full sm:w-auto" disabled={!r || !!registrar.bloqueio}
              onClick={() => r && registrar.abrir({
                data_comunicacao: comunicacao, modalidade, reducao: modalidade === "trabalhado" && motivo === "dispensa_sem_justa_causa" ? reducao : null,
                motivo: motivo as MotivoDesligamentoCalc,
                data_termino_acordada: pedidoDispensado && terminoAcordado ? terminoAcordado : null,
                descontar_aviso: pedidoDispensado ? descontar : undefined,
                simulado: { ultimo: r.ultimoComparecimento, prazo: r.prazoQuitacao, comFolgas: r.folgasAceitas.length > 0 },
              })}>
              {registrar.rotulo}
            </Button>
            <p className="text-xs text-muted-foreground">{registrar.bloqueio ?? "Abre a ficha na aba Desligamento com estes dados para conferência. Nada é gravado até você confirmar lá; folgas simuladas, saldo e jornada editada aqui não são levados."}</p>
          </CardContent></Card>
        )}
      </div>

      <p className="flex gap-2 text-xs text-muted-foreground lg:col-span-2">
        <Info className="h-4 w-4 shrink-0" />
        Simulação de planejamento. Não registra desligamento, não solicita nem aprova folgas e não altera escala ou banco de horas. Compensação durante o aviso depende de acordo, norma coletiva e análise jurídica de cada empresa.
      </p>
    </div>
  );
}

/** Motivos sem aviso prévio: só o término e o prazo de quitação. */
function ResultadoSemAviso({ r }: { r: ResultadoDesligamento }) {
  return (
    <>
      <Card className="border-primary">
        <CardContent className="space-y-1 py-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarCheck className="h-4 w-4" /> Término do vínculo</p>
          <p className="text-2xl font-bold" data-testid="ultimo-comparecimento">{br(r.dataEfetiva)} ({semana(r.dataEfetiva)})</p>
          <p className="text-xs text-muted-foreground">Sem aviso prévio neste motivo: a data informada é o término.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Prazo de quitação (art. 477, §6º)</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>10º dia corrido, contado de <strong>{br(r.baseQuitacao)}</strong>: <strong data-testid="prazo-quitacao">{br(r.prazoQuitacao)} ({semana(r.prazoQuitacao)})</strong></div>
          {r.sugestaoPagamentoDiaUtilAnterior !== r.prazoQuitacao && (
            <p className="text-xs text-muted-foreground" data-testid="sugestao-pagamento">Sugestão para a empresa: pagar até {br(r.sugestaoPagamentoDiaUtilAnterior)} ({semana(r.sugestaoPagamentoDiaUtilAnterior)}), último dia útil antes do 10º dia.</p>)}
        </CardContent>
      </Card>
      {r.avisos.length > 0 && (
        <div className="space-y-1">{r.avisos.map((a) => <p key={a} className="flex gap-2 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5 shrink-0" />{a}</p>)}</div>
      )}
    </>
  );
}

function Resultado({ r, b, onAlternar }: { r: ResultadoDesligamento; b: ResultadoDesligamento; onAlternar: (d: string) => void }) {
  const indenizado = r.fimPeriodoCumprido === null;
  return (
    <>
      <Card className="border-primary">
        <CardContent className="space-y-1 py-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarCheck className="h-4 w-4" /> Último dia previsto de comparecimento à loja</p>
          {indenizado
            ? <p className="text-lg font-semibold" data-testid="ultimo-comparecimento">Dispensado de comparecer a partir de {br(r.dispensadoDeComparecerDesde)} ({semana(r.dispensadoDeComparecerDesde!)})</p>
            : <p className="text-2xl font-bold" data-testid="ultimo-comparecimento">
                {r.ultimoComparecimento ? `${br(r.ultimoComparecimento)} (${semana(r.ultimoComparecimento)})` : "Sem jornadas no período"}</p>}
          {!indenizado && b.ultimoComparecimento !== r.ultimoComparecimento && (
            <p className="text-xs text-muted-foreground">Sem compensação seria {br(b.ultimoComparecimento)}. O término do contrato não muda.</p>)}
          {r.avisoDispensado && (
            <p className="text-xs text-muted-foreground">Término do vínculo: <strong>{br(r.dataEfetiva)}</strong>{r.descontarAviso ? " · com desconto do aviso (confirmar com a contabilidade)" : " · sem desconto do aviso"}.</p>)}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-2 py-4 text-sm sm:grid-cols-2">
          <div>Início da contagem: <strong>{br(r.inicioAviso)}</strong></div>
          <div>Duração legal: <strong>{r.duracaoLegalDias} dias</strong> <span className="text-muted-foreground">({r.anosCompletos} ano(s) completo(s))</span></div>
          {!indenizado && <div>Comparecimento previsto: <strong>{br(r.inicioAviso)} a {br(r.fimPeriodoCumprido)}</strong></div>}
          <div>Término projetado: <strong>{br(r.terminoProjetado)}</strong></div>
          {r.diasProjetadosIndenizados > 0 && <div>Dias indenizados: <strong>{r.diasProjetadosIndenizados}</strong></div>}
          {r.periodoReducao && <div>Ausência legal: <strong>{br(r.periodoReducao.inicio)} a {br(r.periodoReducao.fim)}</strong></div>}
          {!indenizado && <>
            <div>Jornadas restantes: <strong>{r.jornadasRestantes}</strong></div>
            <div>Folgas simuladas: <strong>{r.folgasAceitas.length}</strong></div>
            <div>Horas compensadas: <strong>{formatarMinutos(r.minutosCompensados)}</strong></div>
            <div>Saldo residual: <strong>{formatarMinutos(r.saldoResidualMinutos)}</strong></div>
          </>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Prazo de quitação (art. 477, §6º)</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>10º dia corrido, contado de <strong>{br(r.baseQuitacao)}</strong>: <strong data-testid="prazo-quitacao">{br(r.prazoQuitacao)} ({semana(r.prazoQuitacao)})</strong></div>
          {r.sugestaoPagamentoDiaUtilAnterior !== r.prazoQuitacao && (
            <p className="text-xs text-muted-foreground" data-testid="sugestao-pagamento">Sugestão para a empresa: pagar até {br(r.sugestaoPagamentoDiaUtilAnterior)} ({semana(r.sugestaoPagamentoDiaUtilAnterior)}), último dia útil antes do 10º dia.</p>)}
        </CardContent>
      </Card>

      {!indenizado && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Comparação de cenários</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            {[["Sem compensação", b], ["Com compensação", r]].map(([t, x]) => {
              const s = x as ResultadoDesligamento;
              return (
                <div key={t as string} className="rounded-md border p-2">
                  <p className="font-medium">{t as string}</p>
                  <p>Último dia: <strong>{br(s.ultimoComparecimento)}</strong></p>
                  <p>Jornadas: <strong>{s.jornadasRestantes}</strong></p>
                  <p>Saldo: <strong>{formatarMinutos(s.saldoResidualMinutos)}</strong></p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {r.folgasRejeitadas.length > 0 && (
        <Card><CardContent className="space-y-1 py-3 text-sm">
          {r.folgasRejeitadas.map((f) => <p key={f.data + f.motivo} className="text-destructive">{br(f.data)}: {MOTIVO[f.motivo]}</p>)}
        </CardContent></Card>
      )}

      {r.avisos.length > 0 && (
        <div className="space-y-1">{r.avisos.map((a) => <p key={a} className="flex gap-2 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5 shrink-0" />{a}</p>)}</div>
      )}

      {!indenizado && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Calendário do aviso</CardTitle>
            <CardDescription>Toque num dia de trabalho para simular folga; toque de novo para desfazer.</CardDescription></CardHeader>
          <CardContent>
            <ul className="max-h-96 space-y-1 overflow-y-auto" aria-label="Calendário do aviso">
              {r.calendario.map((d) => {
                const clicavel = d.classificacao === "trabalho_previsto" || d.classificacao === "folga_compensatoria";
                const ultimo = d.data === r.ultimoComparecimento;
                return (
                  <li key={d.data}>
                    <button type="button" disabled={!clicavel} onClick={() => onAlternar(d.data)} data-dia={d.data} data-classe={d.classificacao}
                      className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${CLASSE[d.classificacao].cls} ${ultimo ? "ring-2 ring-primary" : ""} disabled:cursor-default`}>
                      <span className="font-medium">{br(d.data)} · {semana(d.data)}</span>
                      <span className="text-right">{CLASSE[d.classificacao].rotulo}
                        {d.jornadaPrevista > 0 && ` · ${formatarMinutos(d.jornadaPrevista)}`}
                        {d.minutosCompensados > 0 && ` · −${formatarMinutos(d.minutosCompensados)}`}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}

/** Lê os feriados cadastrados na unidade (ano da comunicação e seguinte, a partir dela). */
function FeriadosUnidade({ unidadeId, desde, onDatas }: { unidadeId: string; desde: string; onDatas: (d: string[]) => void }) {
  const { feriados } = useDpFeriados(unidadeId);
  const ano = Number(desde.slice(0, 4)) || new Date().getFullYear();
  const chave = useMemo(
    () => [...datasDeFeriados(feriados.filter((f) => f.ativo !== false), [ano, ano + 1])].filter((d) => d >= desde).sort().join("|"),
    [feriados, ano, desde]);
  useEffect(() => { onDatas(chave ? chave.split("|") : []); }, [chave, onDatas]);
  return null;
}
