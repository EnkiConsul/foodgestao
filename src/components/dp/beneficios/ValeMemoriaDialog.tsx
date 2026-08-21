import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { DIA_SEMANA_CURTO } from "@/lib/dp/dsr-rules";
import { CLASSE_DIA_LABEL, MOTIVO_DESCONTO_LABEL, type ClasseDia, type MotivoDesconto } from "@/lib/dp/va-calculo";
import type { LinhaVale } from "@/hooks/useDpValeCalculadora";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataCurta = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

/** Cor de cada classificação no calendário. Tokens semânticos, sem cor fixa. */
const CLASSE_ESTILO: Record<ClasseDia, string> = {
  pago: "bg-primary/15 text-primary border-primary/30",
  folga_semanal: "bg-muted text-muted-foreground border-border",
  folga_dominical: "bg-secondary text-secondary-foreground border-border",
  folga_extra: "bg-accent text-accent-foreground border-border",
  ferias: "bg-destructive/10 text-destructive border-destructive/30",
  atestado: "bg-destructive/10 text-destructive border-destructive/30",
};

const CLASSES_LEGENDA: ClasseDia[] = [
  "pago",
  "folga_semanal",
  "folga_dominical",
  "folga_extra",
  "ferias",
  "atestado",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linha: LinhaVale | null;
  /** Rótulo do benefício, para o título. */
  valeLabel: string;
}

/**
 * Memória de cálculo do vale: mostra dia a dia como o período de cobertura foi
 * classificado, para o gestor conferir de onde vem a quantidade de dias pagos.
 */
export function ValeMemoriaDialog({ open, onOpenChange, linha, valeLabel }: Props) {
  if (!linha) return null;

  const dias = linha.calendario;
  const primeiro = dias[0]?.data;
  const offset = primeiro ? new Date(`${primeiro}T12:00:00`).getDay() : 0;

  const resumo = [
    { label: "Dias de trabalho na escala", valor: `${linha.diasEscala}` },
    { label: "Folgas dominicais previstas", valor: `−${linha.dominicaisDescontadas}` },
    { label: "Folgas e atestados marcados", valor: `−${linha.folgasDescontadas}` },
    { label: "Férias no período", valor: `−${linha.feriasDescontadas}` },
    { label: "Dias previstos a pagar", valor: `${linha.diasPrevistos}` },
    { label: "Dias pagos e não trabalhados antes", valor: `−${linha.descontos.dias}` },
    { label: "Dias a depositar", valor: `${linha.deposito.diasPagos}` },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{linha.nome} — memória de cálculo</DialogTitle>
          <DialogDescription>
            {valeLabel} · cobertura de {dataCurta(linha.periodo.cobertura.inicio)} a{" "}
            {dataCurta(linha.periodo.cobertura.fim)} · conferência de{" "}
            {dataCurta(linha.periodo.conferencia.inicio)} a {dataCurta(linha.periodo.conferencia.fim)} · regra da{" "}
            {linha.origemRegra === "colaborador"
              ? "ficha do colaborador"
              : linha.origemRegra === "unidade"
                ? "unidade"
                : "empresa"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border p-3">
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
              {DIA_SEMANA_CURTO.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: offset }).map((_, i) => (
                <span key={`vazio-${i}`} />
              ))}
              {dias.map((d) => (
                <div
                  key={d.data}
                  title={`${dataCurta(d.data)} · ${CLASSE_DIA_LABEL[d.classe]}`}
                  className={`rounded-md border py-1.5 text-center text-xs font-medium ${CLASSE_ESTILO[d.classe]}`}
                >
                  {d.data.slice(-2)}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {CLASSES_LEGENDA.map((c) => (
                <span
                  key={c}
                  className={`rounded-md border px-2 py-0.5 text-[11px] ${CLASSE_ESTILO[c]}`}
                >
                  {CLASSE_DIA_LABEL[c]}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border">
            {resumo.map((r) => (
              <div
                key={r.label}
                className="flex items-center justify-between border-b border-border px-3 py-2 text-sm last:border-0"
              >
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-medium">{r.valor}</span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {linha.deposito.diasPagos} × {brl(linha.valorDia)}
                {linha.deposito.desconto > 0 && ` − desconto ${brl(linha.deposito.desconto)}`}
              </span>
              <span className="font-semibold">{brl(linha.deposito.depositar)}</span>
            </div>
          </div>

          {linha.descontos.dias > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(linha.descontos.porMotivo) as MotivoDesconto[])
                .filter((m) => linha.descontos.porMotivo[m] > 0)
                .map((m) => (
                  <Badge key={m} variant="secondary" className="text-[11px]">
                    {MOTIVO_DESCONTO_LABEL[m]}: {linha.descontos.porMotivo[m]}
                  </Badge>
                ))}
            </div>
          )}

          {linha.aviso && <p className="text-xs text-muted-foreground">{linha.aviso}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
