import { useMemo, useState } from "react";
import { Info, AlertTriangle } from "lucide-react";
import { MonthGridCalendar, type MonthGridDay } from "@/components/dp/convocacoes/MonthGridCalendar";
import { useDpFeriados } from "@/hooks/useDpFeriados";
import { useBloqueiosEfetivos } from "@/hooks/useBloqueiosEfetivos";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { datasDeFeriados } from "@/lib/dp/feriados";
import { getMonthDays, ymd } from "@/lib/dp/folga-rules";
import { formatarMinutos } from "@/lib/dp/compensacao/motor";

/**
 * Opção 4: o próprio usuário escolhe as datas. Folga da escala e feriado já são
 * descanso e não podem ser escolhidos; bloqueio só é sinalizado. Nada é gravado.
 */
export function CalendarioSimulacao({ minutosPorDow, saldoMin, unidadeId, companyId }: {
  minutosPorDow: Map<number, number>;
  saldoMin: number;
  unidadeId?: string | null;
  companyId?: string | null;
}) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const { selectedCompanyId } = useCompanyContext();
  const empresa = companyId ?? selectedCompanyId;

  const dias = useMemo(() => getMonthDays(ano, mes - 1), [ano, mes]);
  const de = dias.length ? ymd(dias[0]) : undefined;
  const ate = dias.length ? ymd(dias[dias.length - 1]) : undefined;
  const { feriados } = useDpFeriados(unidadeId ?? null);
  const bloq = useBloqueiosEfetivos(empresa, unidadeId ?? null, de, ate);
  const fer = useMemo(() => datasDeFeriados(feriados.filter((f) => f.ativo !== false), [ano]), [feriados, ano]);
  const hojeIso = ymd(hoje);

  const info: Record<string, MonthGridDay> = {};
  for (const d of dias) {
    const iso = ymd(d);
    const min = minutosPorDow.get(d.getDay());
    if (iso < hojeIso) info[iso] = { desabilitado: true, titulo: "Data passada" };
    else if (fer.has(iso)) info[iso] = { selo: "Feriado", tom: "neutro", desabilitado: true, titulo: "Feriado já é descanso" };
    else if (!min) info[iso] = { selo: "Folga", tom: "neutro", desabilitado: true, titulo: "Dia de folga da escala" };
    else if (bloq.data?.has(iso)) info[iso] = { selo: "Bloqueado", tom: "atencao", titulo: bloq.data.get(iso)?.motivo || "Data bloqueada para folga" };
    else info[iso] = { selo: formatarMinutos(min), tom: "neutro" };
  }

  const escolhidos = [...sel].sort();
  const usado = escolhidos.reduce((s, iso) => s + (minutosPorDow.get(new Date(`${iso}T12:00:00`).getDay()) ?? 0), 0);
  const restricoes = escolhidos.filter((iso) => bloq.data?.has(iso)).length;
  const resta = saldoMin - usado;

  const alternar = (iso: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(iso)) n.delete(iso); else n.add(iso);
    return n;
  });

  return (
    <div className="space-y-3">
      <MonthGridCalendar ano={ano} mes={mes} onMesChange={(a, m) => { setAno(a); setMes(m); }} selecionados={sel} onToggleDia={alternar} info={info} />
      <div className="rounded-md border p-3 text-sm">
        <div className="font-semibold">{escolhidos.length} folga(s) escolhida(s)</div>
        <div className="text-muted-foreground">
          Compensa <strong className="text-foreground">{formatarMinutos(usado)}</strong> · resta{" "}
          <strong className={resta < 0 ? "text-destructive" : "text-foreground"}>{formatarMinutos(resta)}</strong>
        </div>
      </div>
      {restricoes > 0 && (
        <p className="flex gap-2 rounded-md border border-destructive/30 p-2 text-xs text-destructive" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {restricoes} dia(s) escolhido(s) estão bloqueados na escala da unidade.
        </p>
      )}
      <p className="flex gap-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />
        Simulação: as datas não ficam reservadas. A folga só vale depois de solicitada e aprovada pelo gestor.
      </p>
    </div>
  );
}
