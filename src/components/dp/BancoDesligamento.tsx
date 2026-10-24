import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatarMinutos, parseHoras } from "@/lib/dp/compensacao/motor";
import type { ResultadoDesligamento } from "@/lib/dp/compensacao/desligamentoMotor";

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
  const datas: string[] = [];
  for (const dia of [...base.calendario].reverse()) {
    if (dia.classificacao !== "trabalho_previsto") continue;
    if (dia.jornadaPrevista > saldo) break;
    saldo -= dia.jornadaPrevista;
    datas.push(dia.data);
  }
  return datas.sort();
}

export function BancoDesligamento({ texto, unidade, horasDia, set, base, resultado, folgas, onFolgas, planejamento = false }: {
  texto: string; unidade: "horas" | "dias"; horasDia: string;
  set: (v: { texto?: string; unidade?: "horas" | "dias"; horasDia?: string }) => void;
  base?: ResultadoDesligamento | null; resultado?: ResultadoDesligamento | null; folgas: string[];
  onFolgas: (datas: string[]) => void; planejamento?: boolean;
}) {
  const saldo = saldoDesligamento(texto, unidade, horasDia);
  return <div className="space-y-3">
    <h4 className="text-sm font-semibold">Banco de horas{planejamento ? " (planejamento)" : ""}</h4>
    <RadioGroup aria-label="Unidade do saldo" value={unidade} onValueChange={(v) => set({ unidade: v as "horas" | "dias" })} className="flex gap-4">
      <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="horas" /> Horas</label>
      <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="dias" /> Dias</label>
    </RadioGroup>
    <Input aria-label="Saldo do banco de horas" inputMode="decimal" placeholder={unidade === "dias" ? "Quantidade de dias" : "Ex.: 16 ou 24:30"} value={texto} onChange={(e) => set({ texto: e.target.value })} />
    {unidade === "dias" && <div className="space-y-1"><Label htmlFor="banco-horas-dia">Horas equivalentes a um dia</Label><Input id="banco-horas-dia" inputMode="decimal" value={horasDia} onChange={(e) => set({ horasDia: e.target.value })} />
      <p className="text-xs text-muted-foreground">Equivalência informada pela contabilidade; cada folga utiliza a jornada efetiva daquela data.</p></div>}
    {saldo.erro && <p role="alert" className="text-sm text-destructive">{saldo.erro}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={!base || !saldo.minutos} onClick={() => base && saldo.minutos && onFolgas(concentrarNoFinal(base, saldo.minutos))}>Concentrar no final</Button>
      <Button type="button" variant="ghost" size="sm" disabled={!folgas.length} onClick={() => onFolgas([])}>Limpar folgas</Button>
    </div>
    {resultado && <>
      <div className="grid grid-cols-2 gap-2 text-sm"><span>Compensado: <strong>{formatarMinutos(resultado.minutosCompensados)}</strong></span><span>Saldo residual: <strong>{formatarMinutos(resultado.saldoResidualMinutos)}</strong></span></div>
      <ul aria-label="Calendário de compensação" className="max-h-80 space-y-1 overflow-y-auto">
        {resultado.calendario.map((dia) => <li key={dia.data}><Button type="button" variant="outline" className="h-auto w-full justify-between gap-2 whitespace-normal text-xs" disabled={!['trabalho_previsto', 'folga_compensatoria'].includes(dia.classificacao)} onClick={() => onFolgas(folgas.includes(dia.data) ? folgas.filter((d) => d !== dia.data) : [...folgas, dia.data].sort())}>
          <span>{dia.data.split('-').reverse().join('/')}</span><span>{dia.classificacao === 'folga_compensatoria' ? 'Folga compensatória' : dia.classificacao === 'trabalho_previsto' ? `Trabalho · ${formatarMinutos(dia.jornadaPrevista)}` : dia.classificacao === 'ausencia_legal_aviso' ? 'Ausência legal' : 'DSR / sem expediente'}</span>
        </Button></li>)}
      </ul>
      {resultado.folgasRejeitadas.length > 0 && <p role="alert" className="text-sm text-destructive">Há folgas incompatíveis com a jornada ou saldo insuficiente. Desmarque essas datas antes de confirmar.</p>}
    </>}
    <p className="text-xs text-muted-foreground">Compensação depende de acordo e conferência da contabilidade. Não altera o término legal nem quita automaticamente o banco.</p>
  </div>;
}