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

/** Resumo em uma linha: dias inteiros compensados no final e sobra a quitar no TRCT. */
export function resumoCompensacao(r: Pick<ResultadoDesligamento, "minutosCompensados" | "saldoResidualMinutos" | "folgasAceitas">) {
  const dias = r.folgasAceitas.length;
  const base = `${formatarMinutos(r.minutosCompensados)} compensadas (${dias} ${dias === 1 ? "dia" : "dias"} de trabalho)`;
  return r.saldoResidualMinutos > 0 ? `${base} · ${formatarMinutos(r.saldoResidualMinutos)} restantes a quitar no TRCT` : base;
}

/**
 * Informar saldo aqui = agrupar no final, automaticamente. Folgas avulsas o gestor marca no
 * calendário da escala, sem informar banco aqui. Props legadas (folgas/onFolgas/limiteOriginal)
 * seguem aceitas por compatibilidade, mas não há mais escolha manual de datas nesta tela.
 */
export function BancoDesligamento({ texto, unidade, horasDia, set, base, resultado, planejamento = false, calculando = false }: {
  texto: string; unidade: "horas" | "dias"; horasDia: string;
  set: (v: { texto?: string; unidade?: "horas" | "dias"; horasDia?: string }) => void;
  base?: ResultadoDesligamento | null; resultado?: ResultadoDesligamento | null; folgas?: string[];
  onFolgas?: (datas: string[]) => void; planejamento?: boolean;
  bloqueado?: boolean; calculando?: boolean;
  limiteOriginal?: string | null;
}) {
  const saldo = saldoDesligamento(texto, unidade, horasDia);
  return <div className="space-y-3">
    <h4 className="text-sm font-semibold">Banco de horas (opcional){planejamento ? " · planejamento" : ""}</h4>
    <RadioGroup aria-label="Unidade do saldo" value={unidade} onValueChange={(v) => { const media = base ? mediaJornadaAviso(base) : 0; set({ unidade: v as "horas" | "dias", ...(v === "dias" && !horasDia && media > 0 ? { horasDia: `${Math.floor(media / 60)}:${String(media % 60).padStart(2, "0")}` } : {}) }); }} className="flex gap-4">
      <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="horas" /> Horas</label>
      <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="dias" /> Dias</label>
    </RadioGroup>
    <Input aria-label="Saldo do banco de horas" inputMode="decimal" placeholder={unidade === "dias" ? "Quantidade de dias" : "Ex.: 16 ou 24:30"} value={texto} onChange={(e) => set({ texto: e.target.value })} />
    {unidade === "dias" && <div className="space-y-1"><Label htmlFor="banco-horas-dia">Horas equivalentes a um dia</Label><Input id="banco-horas-dia" inputMode="decimal" value={horasDia} onChange={(e) => set({ horasDia: e.target.value })} /></div>}
    {saldo.erro && <p role="alert" className="text-sm text-destructive">{saldo.erro}</p>}
    <p className="text-xs text-muted-foreground">Compensar o banco em folgas é opcional. Ao informar o saldo, as folgas são agrupadas no final do aviso, só em dias de trabalho (folgas, feriados e dias de redução legal não consomem horas). Se não informar, o colaborador trabalha até a data regular e o saldo é quitado na rescisão (TRCT). Para folgas em outros dias, marque direto no calendário da escala.</p>
    {calculando && !!saldo.minutos && <p className="text-sm text-muted-foreground">Calculando…</p>}
    {!calculando && resultado && !!saldo.minutos && <>
      <p className="rounded-md bg-muted p-3 text-sm font-medium" data-testid="banco-resumo">{resumoCompensacao(resultado)}</p>
      {resultado.folgasAceitas.length > 0 && <Accordion type="single" collapsible><AccordionItem value="calendario"><AccordionTrigger className="text-sm">Ver dias do aviso</AccordionTrigger><AccordionContent>
        <ul aria-label="Dias do aviso" className="space-y-1 text-xs">
          {resultado.calendario.map((dia) => <li key={dia.data} className="flex justify-between gap-2 rounded border px-2 py-1">
            <span>{dia.data.split('-').reverse().join('/')}</span><span>{dia.classificacao === 'folga_compensatoria' ? 'Folga do banco' : dia.classificacao === 'trabalho_previsto' ? `Trabalho · ${formatarMinutos(dia.jornadaPrevista)}` : dia.classificacao === 'ausencia_legal_aviso' ? 'Redução legal' : 'Folga / sem expediente'}</span>
          </li>)}
        </ul>
      </AccordionContent></AccordionItem></Accordion>}
    </>}
  </div>;
}