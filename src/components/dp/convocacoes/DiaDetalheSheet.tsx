import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { coberturaDoDia } from "@/lib/dp/convocacoes-planejamento";
import type { ModalidadeConvocacao, RascunhoOcorrencia } from "@/lib/dp/convocacoes-planejamento";

export interface TrabalhadorDoDia {
  id: string;
  nome: string;
  regime: string | null;
  situacao: string;
}

interface DiaDetalheSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ocorrencia: RascunhoOcorrencia | null;
  cargoNome: string;
  modalidade: ModalidadeConvocacao | null;
  origem: string;
  situacao: string;
  confirmados: number;
  aguardando: number;
  minimo: number | null;
  trabalhadores: TrabalhadorDoDia[];
}

const REGIME_LABEL: Record<string, string> = {
  intermitente: "Intermitente",
  freelancer: "Freelancer",
  clt: "CLT",
  pj: "PJ",
  mei: "MEI",
  socio: "Sócio",
};

const linha = (rotulo: string, valor: string) => (
  <div className="flex items-start justify-between gap-3 border-b border-border/60 py-1.5 text-xs last:border-0">
    <span className="text-muted-foreground">{rotulo}</span>
    <span className="text-right font-medium">{valor}</span>
  </div>
);

/** Detalhe do dia — somente leitura neste bloco. */
export function DiaDetalheSheet({
  open, onOpenChange, ocorrencia, cargoNome, modalidade, origem, situacao,
  confirmados, aguardando, minimo, trabalhadores,
}: DiaDetalheSheetProps) {
  const o = ocorrencia;
  const cobertura = coberturaDoDia({ minimo, confirmados, aguardando });

  const horario =
    !o
      ? "—"
      : o.horario_modo === "jornada_individual"
        ? "Jornada de cada pessoa"
        : `${o.entrada ?? "—"}–${o.saida ?? "—"}${o.termina_no_dia_seguinte ? " (+1 dia)" : ""}${
            o.intervalo_minutos ? ` · ${o.intervalo_minutos} min de intervalo` : ""
          }`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {o?.data
              ? new Date(`${o.data}T12:00:00`).toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "2-digit",
                })
              : "Dia"}
          </SheetTitle>
          <SheetDescription>Detalhe somente leitura do dia e do cargo.</SheetDescription>
        </SheetHeader>

        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-border p-3">
            {linha("Cargo", cargoNome || "—")}
            {linha("Modalidade", modalidade === "individual" ? "Individual" : modalidade === "aberta" ? "Aberta" : "—")}
            {linha(
              "Necessidade",
              o
                ? `${o.necessidade_entrada ?? "—"}–${o.necessidade_saida ?? "—"}${
                    o.necessidade_termina_no_dia_seguinte ? " (+1 dia)" : ""
                  }`
                : "—",
            )}
            {linha("Horário ofertado", horario)}
            {linha("Origem", origem)}
            {linha("Situação", situacao)}
            {linha("Vagas", String(o?.vagas ?? 0))}
            {linha("Confirmados", String(cobertura.confirmados))}
            {linha("Aguardando", String(cobertura.aguardando))}
            {linha(
              "Mínimo do cargo",
              cobertura.minimo == null
                ? "Sem mínimo cadastrado"
                : `${cobertura.confirmados}/${cobertura.minimo}${
                    cobertura.faltam ? ` · faltam ${cobertura.faltam}` : ""
                  }`,
            )}
          </div>

          <div className="rounded-xl border border-border p-3">
            <div className="text-sm font-semibold">Trabalhadores</div>
            {trabalhadores.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Ninguém vinculado a este dia ainda.
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {trabalhadores.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-2 py-1.5 text-xs"
                  >
                    <span className="font-medium">{t.nome}</span>
                    <span className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {REGIME_LABEL[t.regime ?? ""] ?? t.regime ?? "—"}
                      </Badge>
                      <span className="text-muted-foreground">{t.situacao}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
