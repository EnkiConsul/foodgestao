import { useMemo, useState } from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, format, isSameMonth, parseISO, startOfMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DpContentCard } from "@/components/dp/DpPage";
import { useDpFerias } from "@/hooks/useDpFerias";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";

const TONE: Record<string, string> = {
  planejado: "bg-amber-500/20 text-amber-700",
  aprovado: "bg-sky-500/20 text-sky-700",
  em_gozo: "bg-primary/20 text-primary",
  concluido: "bg-muted text-muted-foreground",
};

/** Calendário mensal com quem está de férias em cada dia. */
export function FeriasCalendarioPanel() {
  const [mes, setMes] = useState(() => startOfMonth(new Date()));
  const { gozos, gozosLoading } = useDpFerias("todos");
  const { data: colaboradores = [] } = useDpColaboradores();

  const nomes = useMemo(
    () => new Map((colaboradores as any[]).map((c) => [c.id, c.nome as string])),
    [colaboradores],
  );

  const dias = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(mes), end: endOfMonth(mes) }),
    [mes],
  );

  const porDia = useMemo(() => {
    const map = new Map<string, { nome: string; status: string }[]>();
    for (const g of gozos) {
      if (g.status === "cancelado") continue;
      const ini = parseISO(g.data_inicio);
      const fim = parseISO(g.data_fim);
      for (const d of eachDayOfInterval({ start: ini, end: fim })) {
        if (!isSameMonth(d, mes)) continue;
        const chave = format(d, "yyyy-MM-dd");
        const lista = map.get(chave) ?? [];
        lista.push({ nome: nomes.get(g.colaborador_id) ?? "Colaborador", status: g.status });
        map.set(chave, lista);
      }
    }
    return map;
  }, [gozos, mes, nomes]);

  const espacos = dias.length ? dias[0].getDay() : 0;

  return (
    <DpContentCard contentClassName="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setMes((m) => addMonths(m, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <p className="font-semibold capitalize">
          {format(mes, "MMMM 'de' yyyy", { locale: ptBR })}
        </p>
        <Button variant="ghost" size="icon" onClick={() => setMes((m) => addMonths(m, 1))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {gozosLoading ? (
        <p className="py-10 text-center text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid grid-cols-7 gap-1 text-xs">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
            <div key={d} className="pb-1 text-center font-bold uppercase text-muted-foreground">
              {d}
            </div>
          ))}
          {Array.from({ length: espacos }).map((_, i) => (
            <div key={`vazio-${i}`} />
          ))}
          {dias.map((d) => {
            const chave = format(d, "yyyy-MM-dd");
            const pessoas = porDia.get(chave) ?? [];
            return (
              <div
                key={chave}
                className="min-h-20 rounded-lg border border-border p-1 align-top"
              >
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {format(d, "d")}
                </span>
                <div className="mt-1 space-y-0.5">
                  {pessoas.slice(0, 3).map((p, i) => (
                    <div
                      key={`${chave}-${i}`}
                      className={`truncate rounded px-1 py-0.5 ${TONE[p.status] ?? "bg-muted"}`}
                      title={p.nome}
                    >
                      {p.nome}
                    </div>
                  ))}
                  {pessoas.length > 3 && (
                    <div className="px-1 text-[10px] text-muted-foreground">
                      +{pessoas.length - 3}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DpContentCard>
  );
}
