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
import { BancoDesligamento, saldoDesligamento, concentrarNoFinal } from "../BancoDesligamento";
import { CondicoesDesligamento, SEM_AVISO, type CondicoesValor } from "../CondicoesDesligamento";
import { datasDeFeriados } from "@/lib/dp/feriados";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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
type MotivoCalc = MotivoDesligamentoCalc;
const MOTIVO_ROTULO: Partial<Record<MotivoCalc, string>> = {
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

/** Atalho opcional para a ficha: só leva decisões, nunca grava. */
export type RegistrarDesligamento = {
  rotulo: string;
  bloqueio?: string | null;
  abrir: (r: {
    data_comunicacao: string; modalidade: ModalidadeAviso; reducao: ReducaoArt488 | null;
    motivo: MotivoDesligamentoCalc; data_termino_acordada?: string | null; descontar_aviso?: boolean;
    saldo_banco_minutos: number; folgas_compensatorias: string[];
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
  const [saldoUnidade, setSaldoUnidade] = useState<"horas" | "dias">("horas");
  const [horasDia, setHorasDia] = useState("");
  const [declaracoes, setDeclaracoes] = useState({ pedidoEscrito: false, aceiteEmpresa: false, confirmacaoSemAviso: false });
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

  const semAviso = SEM_AVISO.has(motivo);
  const pedidoDispensado = motivo === "pedido_demissao" && modalidade === "indenizado";
  const comJornadas = !semAviso && modalidade === "trabalhado";

  const jornadaMin = jornada.map((t) => {
    if (!t.trim()) return 0;
    const r = parseHoras(t);
    return r.ok && r.minutos >= 0 ? r.minutos : null;
  });
  const jornadaOk = jornadaMin.every((m) => m !== null);
  const saldo = saldoDesligamento(saldoTxt, saldoUnidade, horasDia);
  const saldoMin = saldo.minutos;
  const saldoErro = saldo.erro;
  const cond: CondicoesValor = { motivo, modalidade, reducao, comunicacao, terminoAcordado, descontar, ...declaracoes };
  const setCond = (p: Partial<CondicoesValor>) => {
    if (p.motivo !== undefined) setMotivo(p.motivo as MotivoCalc);
    if (p.modalidade !== undefined) setModalidade(p.modalidade);
    if (p.reducao !== undefined) setReducao(p.reducao);
    if (p.comunicacao !== undefined) setComunicacao(p.comunicacao);
    if (p.terminoAcordado !== undefined) setTerminoAcordado(p.terminoAcordado);
    if (p.descontar !== undefined) setDescontar(p.descontar);
    setDeclaracoes((v) => ({ ...v, ...Object.fromEntries(Object.entries(p).filter(([k]) => ['pedidoEscrito', 'aceiteEmpresa', 'confirmacaoSemAviso'].includes(k))) }));
    setFolgas([]);
  };

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
  useEffect(() => {
    if (b && saldoMin && saldoMin > 0) setFolgas(concentrarNoFinal(b, saldoMin));
    // Recompute when the input calendar changes, not after manual selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)]);

  const alternar = (d: string) => setFolgas((fs) => (fs.includes(d) ? fs.filter((x) => x !== d) : [...fs, d].sort()));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {unidadeId && <FeriadosUnidade unidadeId={unidadeId} desde={comunicacao} onDatas={setFeriadosUnidade} />}
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Aviso prévio</CardTitle>
            <CardDescription>Motivo e condições do desligamento (regime CLT).</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div><Label htmlFor="dsl-adm">Data de admissão</Label>
              <Input id="dsl-adm" type="date" value={admissao} onChange={(e) => { setAdmissao(e.target.value); setFolgas([]); }} /></div>
            <CondicoesDesligamento v={cond} set={setCond} comMotivo planejamento />

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

        {comJornadas && <Card><CardContent className="pt-4">
          <BancoDesligamento texto={saldoTxt} unidade={saldoUnidade} horasDia={horasDia} planejamento base={b} folgas={folgas}
            set={(v) => { if (v.texto !== undefined) setSaldoTxt(v.texto); if (v.unidade) setSaldoUnidade(v.unidade); if (v.horasDia !== undefined) setHorasDia(v.horasDia); setFolgas([]); }} onFolgas={setFolgas} />
        </CardContent></Card>}

      </div>

      <div className="space-y-4">
        {!params && <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          {saldoErro ? "Corrija o saldo do banco de horas para simular." : "Informe a data de admissão para simular."}</CardContent></Card>}
        {erro && <Card><CardContent className="py-6 text-sm text-destructive">{erro}</CardContent></Card>}
        {r && b && (r.semAviso ? <ResultadoSemAviso r={r} /> : <Resultado r={r} b={b} onAlternar={alternar} />)}
        {registrar && (
          <Card><CardContent className="space-y-2 py-4">
            <Button className="w-full sm:w-auto" disabled={!r || r.folgasRejeitadas.length > 0 || !!registrar.bloqueio}
              onClick={() => r && registrar.abrir({
                data_comunicacao: comunicacao, modalidade, reducao: modalidade === "trabalhado" && motivo === "dispensa_sem_justa_causa" ? reducao : null,
                motivo: motivo as MotivoDesligamentoCalc,
                data_termino_acordada: pedidoDispensado && terminoAcordado ? terminoAcordado : null,
                descontar_aviso: pedidoDispensado ? descontar : undefined,
                saldo_banco_minutos: saldoMin ?? 0, folgas_compensatorias: [...r.folgasAceitas],
                simulado: { ultimo: r.ultimoComparecimento, prazo: r.prazoQuitacao, comFolgas: r.folgasAceitas.length > 0 },
              })}>
              {registrar.rotulo}
            </Button>
            <p className="text-xs text-muted-foreground">{registrar.bloqueio ?? "Abre a ficha na aba Desligamento com estes dados para conferência. Nada é gravado até você confirmar lá; saldo e folgas são levados; a jornada e os feriados são recalculados pelo cadastro oficial."}</p>
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
          <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
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
          <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <CalendarCheck className="h-4 w-4" /> Último dia previsto de comparecimento à loja</p>
          {indenizado
            ? <p className="text-lg font-semibold" data-testid="ultimo-comparecimento">Dispensado de comparecer a partir de {br(r.dispensadoDeComparecerDesde)} ({r.dispensadoDeComparecerDesde ? semana(r.dispensadoDeComparecerDesde) : "—"})</p>
            : <p className="text-2xl font-bold" data-testid="ultimo-comparecimento">
                {r.ultimoComparecimento ? `${br(r.ultimoComparecimento)} (${semana(r.ultimoComparecimento)})` : "Sem jornadas no período"}</p>}
          {!indenizado && b.ultimoComparecimento !== r.ultimoComparecimento && (
            <p className="text-xs text-muted-foreground">Sem compensação seria {br(b.ultimoComparecimento)}. O término do contrato não muda.</p>)}
          {!indenizado && <p className="text-sm">Limite sem banco: <strong>{br(b.ultimoComparecimento)}</strong> · término do vínculo: <strong>{br(r.dataEfetiva)}</strong>. A previsão com banco pode mudar após revisão das folgas ou do saldo.</p>}
          {r.avisoDispensado && (
            <p className="text-xs text-muted-foreground">Término do vínculo: <strong>{br(r.dataEfetiva)}</strong>{r.descontarAviso ? " · com desconto do aviso (confirmar com a contabilidade)" : " · sem desconto do aviso"}.</p>)}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-2 py-4 text-sm sm:grid-cols-2">
          <div>Início da contagem: <strong>{br(r.inicioAviso)}</strong></div>
          <div>Duração legal: <strong>{r.duracaoLegalDias} dias</strong> <span className="text-muted-foreground">({r.anosCompletos} ano(s) completo(s))</span></div>
          {!indenizado && <div>Comparecimento previsto: <strong>{br(r.inicioAviso)} a {br(r.fimPeriodoCumprido)}</strong></div>}
          {r.avisoDispensado
            ? <div>Aviso: <strong>cumprimento dispensado pela empresa</strong> (fim teórico do aviso não cumprido: {br(r.terminoProjetado)})</div>
            : <div>Término projetado: <strong>{br(r.terminoProjetado)}</strong></div>}
          {r.diasProjetadosIndenizados > 0 && <div>Dias indenizados: <strong>{r.diasProjetadosIndenizados}</strong></div>}
          {r.periodoReducao && <div>Ausência legal: <strong>{br(r.periodoReducao.inicio)} a {br(r.periodoReducao.fim)}</strong></div>}
          {!indenizado && <>
            <div>Jornadas restantes: <strong>{r.jornadasRestantes}</strong></div>
            <div>Folgas simuladas: <strong>{r.folgasAceitas.length}</strong></div>
            <div>Horas compensadas: <strong>{formatarMinutos(r.minutosCompensados)}</strong></div>
            <div>Sobra para conferir e quitar na rescisão: <strong>{formatarMinutos(r.saldoResidualMinutos)}</strong></div>
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
        <Accordion type="single" collapsible defaultValue="aviso"><AccordionItem value="aviso"><AccordionTrigger>Calendário do aviso</AccordionTrigger><AccordionContent>
            <ul className="space-y-1" aria-label="Calendário do aviso">
              {r.calendario.map((d) => {
                const clicavel = d.classificacao === "trabalho_previsto" || d.classificacao === "folga_compensatoria";
                const ultimo = d.data === r.ultimoComparecimento;
                return (
                  <li key={d.data}>
                    <Button variant="outline" type="button" disabled={!clicavel} onClick={() => onAlternar(d.data)} data-dia={d.data} data-classe={d.classificacao}
                      className={`h-auto w-full justify-between gap-2 whitespace-normal px-2 py-1.5 text-left text-xs ${CLASSE[d.classificacao].cls} ${ultimo ? "ring-2 ring-primary" : ""} disabled:cursor-default`}>
                      <span className="font-medium">{br(d.data)} · {semana(d.data)}</span>
                      <span className="text-right">{CLASSE[d.classificacao].rotulo}
                        {d.jornadaPrevista > 0 && ` · ${formatarMinutos(d.jornadaPrevista)}`}
                        {d.minutosCompensados > 0 && ` · −${formatarMinutos(d.minutosCompensados)}`}</span>
                    </Button>
                  </li>
                );
              })}
            </ul>
        </AccordionContent></AccordionItem></Accordion>
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
