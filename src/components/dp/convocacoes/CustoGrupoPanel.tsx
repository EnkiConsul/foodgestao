import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { remuneracaoDoSnapshot, type ConvocacaoRemuneracao } from "@/lib/dp/convocacao-remuneracao";
import { RemuneracaoDiaDetalhe } from "./RemuneracaoDiaDetalhe";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const rotuloData = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });

export interface ConvocacaoComValor {
  id: string;
  data: string;
  status: string;
  entrada: string | null;
  saida: string | null;
  termina_no_dia_seguinte: boolean | null;
  remuneracao_snapshot: unknown;
  dp_colaboradores?: { nome: string } | null;
}

interface Item {
  id: string;
  data: string;
  nome: string;
  status: string;
  remuneracao: ConvocacaoRemuneracao;
}

const STATUS_LABEL: Record<string, string> = {
  aceita: "confirmado",
  pendente: "aguardando resposta",
  recusada: "recusado",
  cancelada: "cancelado",
  expirada: "sem resposta no prazo",
};

/**
 * Custo previsto da convocação para o gestor: soma dos dias já ofertados,
 * com a abertura do valor de cada pessoa em cada dia.
 * Usa sempre o snapshot gravado na publicação — nada é recalculado aqui.
 */
export function CustoGrupoPanel({ convocacoes }: { convocacoes: ConvocacaoComValor[] }) {
  const [open, setOpen] = useState(false);

  const itens = useMemo<Item[]>(() => {
    return convocacoes
      .filter((c) => c.status === "aceita" || c.status === "pendente")
      .map((c) => {
        const remuneracao = remuneracaoDoSnapshot(c.remuneracao_snapshot, {
          entrada: c.entrada,
          saida: c.saida,
          termina_no_dia_seguinte: c.termina_no_dia_seguinte,
        });
        if (!remuneracao) return null;
        return {
          id: c.id,
          data: c.data,
          nome: c.dp_colaboradores?.nome ?? "—",
          status: c.status,
          remuneracao,
        };
      })
      .filter((i): i is Item => !!i)
      .sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome));
  }, [convocacoes]);

  const totais = useMemo(() => {
    return itens.reduce(
      (acc, i) => ({
        liquido: acc.liquido + i.remuneracao.liquido,
        bruto: acc.bruto + i.remuneracao.bruto,
        fgts: acc.fgts + i.remuneracao.fgts,
        confirmados: acc.confirmados + (i.status === "aceita" ? i.remuneracao.bruto + i.remuneracao.fgts : 0),
      }),
      { liquido: 0, bruto: 0, fgts: 0, confirmados: 0 },
    );
  }, [itens]);

  if (itens.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[11px] text-muted-foreground">
            Custo previsto da empresa ({itens.length} dia-pessoa)
          </span>
          <span className="text-sm font-semibold text-primary">
            {moeda(totais.bruto + totais.fgts)}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            Já confirmado: {moeda(totais.confirmados)} · a receber pelas pessoas:{" "}
            {moeda(totais.liquido)} · FGTS: {moeda(totais.fgts)}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="mt-2 space-y-2">
          {itens.map((i) => (
            <div key={i.id}>
              <p className="text-[11px] text-muted-foreground">
                {rotuloData(i.data)} · <span className="font-medium text-foreground">{i.nome}</span> ·{" "}
                {STATUS_LABEL[i.status] ?? i.status}
              </p>
              <RemuneracaoDiaDetalhe
                remuneracao={i.remuneracao}
                titulo="A pessoa recebe neste dia"
                className="mt-1"
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
