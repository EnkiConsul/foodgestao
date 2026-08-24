import { useMemo, useState } from "react";
import { CalendarCheck2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MONTH_NAMES, WEEKDAY_LABELS, formatBR, parseYMD } from "@/lib/dp/folga-rules";
import { useDpIndisponibilidades, type DisponibilidadeDia } from "@/hooks/useDpIndisponibilidades";

interface Props {
  colaboradorId: string | null;
  ano: number;
  mes: number; // 1-12
  onPrev: () => void;
  onNext: () => void;
}

const ESTILO: Record<DisponibilidadeDia, string> = {
  disponivel: "bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10",
  indisponivel: "bg-destructive/10 border-destructive/40",
  convocacao_pendente: "bg-amber-500/10 border-amber-500/40",
  convocacao_confirmada: "bg-primary/10 border-primary/40",
};

const ROTULO: Record<DisponibilidadeDia, string> = {
  disponivel: "Disponível",
  indisponivel: "Indisponível",
  convocacao_pendente: "Convocação aguardando",
  convocacao_confirmada: "Convocação confirmada",
};

const PONTO: Record<DisponibilidadeDia, string> = {
  disponivel: "bg-emerald-500",
  indisponivel: "bg-destructive",
  convocacao_pendente: "bg-amber-500",
  convocacao_confirmada: "bg-primary",
};

const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Agenda de disponibilidade do trabalhador convocável (Intermitente/Freelancer).
 * Mobile-first: toque no dia abre a ação correspondente.
 */
export function MinhaDisponibilidadeCard({ colaboradorId, ano, mes, onPrev, onNext }: Props) {
  const { estadoPorDia, marcar, remover, isLoading } = useDpIndisponibilidades({ colaboradorId, ano, mes });
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const hojeIso = ymdLocal(new Date());

  const celulas = useMemo(() => {
    const primeiro = new Date(ano, mes - 1, 1);
    const total = new Date(ano, mes, 0).getDate();
    const vazias = primeiro.getDay();
    const out: ({ iso: string; dia: number } | null)[] = Array.from({ length: vazias }, () => null);
    for (let d = 1; d <= total; d++) out.push({ iso: ymdLocal(new Date(ano, mes - 1, d)), dia: d });
    return out;
  }, [ano, mes]);

  const estado = (iso: string): DisponibilidadeDia => estadoPorDia.get(iso) ?? "disponivel";
  const estadoSel = selecionado ? estado(selecionado) : null;
  const passado = selecionado ? selecionado < hojeIso : false;

  return (
    <>
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-black">
              <CalendarCheck2 className="size-5 text-primary" /> Minha disponibilidade
            </CardTitle>
            <CardDescription>
              Informe os dias em que você não poderá trabalhar. Nesses dias você não recebe novas convocações.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="icon" variant="outline" className="rounded-full" onClick={onPrev} aria-label="Mês anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs font-bold w-24 text-center">
              {MONTH_NAMES[mes - 1]} {ano}
            </span>
            <Button size="icon" variant="outline" className="rounded-full" onClick={onNext} aria-label="Próximo mês">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-muted-foreground">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celulas.map((c, i) =>
              !c ? (
                <span key={`b${i}`} />
              ) : (
                <button
                  key={c.iso}
                  type="button"
                  disabled={isLoading}
                  onClick={() => setSelecionado(c.iso)}
                  className={cn(
                    "aspect-square rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition",
                    c.iso < hojeIso ? "bg-muted/40 text-muted-foreground" : ESTILO[estado(c.iso)],
                  )}
                  aria-label={`${formatBR(parseYMD(c.iso))} — ${ROTULO[estado(c.iso)]}`}
                >
                  {c.dia}
                  <span className={cn("h-1.5 w-1.5 rounded-full", PONTO[estado(c.iso)])} />
                </button>
              ),
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {(Object.keys(ROTULO) as DisponibilidadeDia[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", PONTO[k])} /> {ROTULO[k]}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selecionado} onOpenChange={(o) => !o && setSelecionado(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">
              {selecionado && formatBR(parseYMD(selecionado))}
            </DialogTitle>
            <DialogDescription>{estadoSel ? ROTULO[estadoSel] : ""}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {passado && <p className="text-muted-foreground">Dias que já passaram não podem ser alterados.</p>}

            {!passado && estadoSel === "convocacao_confirmada" && (
              <p className="text-muted-foreground">
                Você já confirmou uma convocação neste dia. Para informar que não poderá trabalhar, será necessário
                solicitar substituição.
              </p>
            )}

            {!passado && estadoSel === "convocacao_pendente" && (
              <p className="text-amber-600">
                Existe uma convocação aguardando sua resposta neste dia. Ao marcar a data como indisponível, essa
                oferta será encerrada.
              </p>
            )}

            {!passado && estadoSel === "indisponivel" && (
              <Button
                variant="destructive"
                className="w-full"
                disabled={remover.isPending}
                onClick={() =>
                  remover.mutate(selecionado!, { onSuccess: () => setSelecionado(null) })
                }
              >
                {remover.isPending ? "Removendo..." : "Remover indisponibilidade"}
              </Button>
            )}

            {!passado && (estadoSel === "disponivel" || estadoSel === "convocacao_pendente") && (
              <Button
                className="w-full"
                disabled={marcar.isPending}
                onClick={() =>
                  marcar.mutate({ data: selecionado! }, { onSuccess: () => setSelecionado(null) })
                }
              >
                {marcar.isPending ? "Salvando..." : "Marcar como indisponível"}
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" className="w-full" onClick={() => setSelecionado(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
