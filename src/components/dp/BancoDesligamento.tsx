import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatarMinutos, parseHoras } from "@/lib/dp/compensacao/motor";
import type { ResultadoDesligamento } from "@/lib/dp/compensacao/desligamentoMotor";
import { concentrarBancoNoFinal, mediaJornadaAviso } from "@/lib/dp/desligamento-escala-diagnostico";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export function saldoDesligamento(texto: string, unidade: "horas" | "dias", horasDia: string) {
  if (!texto.trim()) return { minutos: 0, erro: null };
  const saldo = parseHoras(texto);
  const dia = parseHoras(horasDia);
  if (!saldo.ok || saldo.minutos < 0) return { minutos: null, erro: "Informe apenas saldo positivo válido." };
  if (unidade === "horas") return { minutos: saldo.minutos, erro: null };
  const dias = Number(texto.replace(",", "."));
  if (!Number.isFinite(dias) || dias < 0 || !dia.ok || dia.minutos <= 0)
    return { minutos: null, erro: "Informe dias válidos e a quantidade de horas equivalente a um dia." };
  return { minutos: Math.round(dias * dia.minutos), erro: null };
}

export function concentrarNoFinal(base: ResultadoDesligamento, saldo: number) {
  return concentrarBancoNoFinal(base, saldo);
}

export function simularBancoSobreCalendario(base: ResultadoDesligamento, saldo: number, folgas: string[]): ResultadoDesligamento {
  let restante = saldo;
  const aceitas: string[] = [];
  const rejeitadas: ResultadoDesligamento["folgasRejeitadas"] = [];
  const calendario = base.calendario.map((dia) => {
    if (!folgas.includes(dia.data)) return { ...dia };
    if (dia.classificacao !== "trabalho_previsto") { rejeitadas.push({ data: dia.data, motivo: "dia_sem_jornada" }); return { ...dia }; }
    if (dia.jornadaPrevista > restante) { rejeitadas.push({ data: dia.data, motivo: "excede_saldo" }); return { ...dia }; }
    restante -= dia.jornadaPrevista;
    aceitas.push(dia.data);
    return { ...dia, classificacao: "folga_compensatoria" as const, minutosCompensados: dia.jornadaPrevista, jornadaPrevista: 0 };
  });
  for (const data of folgas) if (!base.calendario.some((d) => d.data === data)) rejeitadas.push({ data, motivo: "fora_do_periodo_trabalhado" });
  const trabalho = calendario.filter((d) => d.classificacao === "trabalho_previsto");
  return { ...base, calendario, folgasAceitas: aceitas, folgasRejeitadas: rejeitadas, saldoResidualMinutos: restante, minutosCompensados: saldo - restante, ultimoComparecimento: trabalho.at(-1)?.data ?? null, jornadasRestantes: trabalho.length };
}

export function BancoDesligamento({ texto, unidade, horasDia, set, base, resultado, folgas, onFolgas, planejamento = false, bloqueado = false }: {
  texto: string; unidade: "horas" | "dias"; horasDia: string;
  set: (v: { texto?: string; unidade?: "horas" | "dias"; horasDia?: string }) => void;
  base?: ResultadoDesligamento | null; resultado?: ResultadoDesligamento | null; folgas: string[];
  onFolgas: (datas: string[]) => void; planejamento?: boolean;
  bloqueado?: boolean;
}) {
  const saldo = saldoDesligamento(texto, unidade, horasDia);
  return <div className="space-y-3">
    <h4 className="text-sm font-semibold">Banco de horas{planejamento ? " (planejamento)" : ""}</h4>
    <RadioGroup aria-label="Unidade do saldo" value={unidade} onValueChange={(v) => { const media = base ? mediaJornadaAviso(base) : 0; set({ unidade: v as "horas" | "dias", ...(v === "dias" && !horasDia && media > 0 ? { horasDia: `${Math.floor(media / 60)}:${String(media % 60).padStart(2, "0")}` } : {}) }); }} className="flex gap-4">
      <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="horas" /> Horas</label>
      <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="dias" /> Dias</label>
    </RadioGroup>
    <Input aria-label="Saldo do banco de horas" inputMode="decimal" placeholder={unidade === "dias" ? "Quantidade de dias" : "Ex.: 16 ou 24:30"} value={texto} onChange={(e) => set({ texto: e.target.value })} />
    {unidade === "dias" && <div className="space-y-1"><Label htmlFor="banco-horas-dia">Horas equivalentes a um dia</Label><Input id="banco-horas-dia" inputMode="decimal" value={horasDia} onChange={(e) => set({ horasDia: e.target.value })} />
      <p className="text-xs text-muted-foreground">Equivalência informada pela contabilidade; cada folga utiliza a jornada efetiva daquela data.</p></div>}
    {saldo.erro && <p role="alert" className="text-sm text-destructive">{saldo.erro}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={bloqueado || !base || !saldo.minutos} onClick={() => base && saldo.minutos && onFolgas(concentrarNoFinal(base, saldo.minutos))}>Concentrar no final</Button>
      <Button type="button" variant="ghost" size="sm" disabled={!folgas.length} onClick={() => onFolgas([])}>Limpar folgas</Button>
    </div>
    {resultado && <>
      <div className="grid gap-2 text-sm sm:grid-cols-2"><span>Compensado: <strong>{formatarMinutos(resultado.minutosCompensados)}</strong></span><span>Sobra para conferir e quitar na rescisão: <strong>{formatarMinutos(resultado.saldoResidualMinutos)}</strong></span></div>
      <div className="grid gap-2 rounded-md bg-muted p-3 text-sm sm:grid-cols-2">
        <p>Limite de trabalho sem banco: <strong>{base?.ultimoComparecimento?.split('-').reverse().join('/') ?? '—'}</strong></p>
        <p>Comparecimento estimado com banco: <strong>{resultado.ultimoComparecimento?.split('-').reverse().join('/') ?? 'Sem jornadas'}</strong></p>
        <p className="sm:col-span-2">Término do vínculo: <strong>{resultado.dataEfetiva.split('-').reverse().join('/')}</strong> · não muda com a compensação.</p>
      </div>
      <Accordion type="single" collapsible><AccordionItem value="calendario"><AccordionTrigger>Ver dias do aviso / compensação ({resultado.folgasAceitas.length} dias)</AccordionTrigger><AccordionContent>
      <ul aria-label="Calendário de compensação" className="space-y-1">
        {resultado.calendario.map((dia) => <li key={dia.data}><Button type="button" variant="outline" className="h-auto w-full justify-between gap-2 whitespace-normal text-xs" disabled={bloqueado || !['trabalho_previsto', 'folga_compensatoria'].includes(dia.classificacao)} onClick={() => onFolgas(folgas.includes(dia.data) ? folgas.filter((d) => d !== dia.data) : [...folgas, dia.data].sort())}>
          <span>{dia.data.split('-').reverse().join('/')}</span><span>{dia.classificacao === 'folga_compensatoria' ? 'Folga compensatória' : dia.classificacao === 'trabalho_previsto' ? `Trabalho · ${formatarMinutos(dia.jornadaPrevista)}` : dia.classificacao === 'ausencia_legal_aviso' ? 'Ausência legal' : 'DSR / sem expediente'}</span>
        </Button></li>)}
      </ul>
      </AccordionContent></AccordionItem></Accordion>
      {resultado.folgasRejeitadas.length > 0 && <p role="alert" className="text-sm text-destructive">Há folgas incompatíveis com a jornada ou saldo insuficiente. Desmarque essas datas antes de confirmar.</p>}
    </>}
    <p className="text-xs text-muted-foreground">Saldo e comparecimento são estimativas. Trocas de folga podem mudar a previsão. Após faltas, atrasos ou horas extras, informe o saldo atualizado pela contabilidade. A sobra não é quitada automaticamente.</p>
  </div>;
}