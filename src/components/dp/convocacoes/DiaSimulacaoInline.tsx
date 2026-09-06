import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { useDpOperacaoPanorama } from "@/hooks/useDpOperacaoPanorama";
import { blocosPorFuncionamento, type PessoaPanorama } from "@/lib/dp/operacao-panorama";
import { cn } from "@/lib/utils";

interface Props {
  competencia: string;
  unidadeId: string | null;
  data: string;
  /** Pessoas que receberiam a convocação neste dia, já com o horário resolvido. */
  convocados: PessoaPanorama[];
  vagas: number;
}

/**
 * Rotina do dia simulada dentro da própria linha da data: quem já está previsto
 * na unidade por período e como o quadro fica se a convocação for aceita.
 */
export function DiaSimulacaoInline({ competencia, unidadeId, data, convocados, vagas }: Props) {
  const panorama = useDpOperacaoPanorama(competencia, unidadeId);
  const dia = panorama.diaDe(data);

  const previstas = useMemo(
    () =>
      (dia?.pessoas ?? []).filter(
        (p) =>
          p.categoria === "fixo" ||
          p.categoria === "convocado_aceito" ||
          p.categoria === "convocado_pendente",
      ),
    [dia],
  );

  const pessoas = useMemo(() => {
    const jaPrevistos = new Set(previstas.map((p) => p.colaborador_id));
    return [...previstas, ...convocados.filter((c) => !jaPrevistos.has(c.colaborador_id))];
  }, [previstas, convocados]);

  const blocos = useMemo(
    () =>
      blocosPorFuncionamento({
        data,
        pessoas,
        funcionamentoPorUnidade: panorama.funcionamentoPorUnidade,
        unidades: panorama.unidades,
        unidadeId,
      }),
    [data, pessoas, panorama.funcionamentoPorUnidade, panorama.unidades, unidadeId],
  );

  if (panorama.isLoading) {
    return <p className="text-[11px] text-muted-foreground">Carregando a rotina deste dia…</p>;
  }

  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-2">
      <p className="text-[11px]">
        Hoje: <span className="font-semibold">{previstas.length}</span> pessoa(s) ·{" "}
        {vagas} vaga(s) na convocação · com aceite:{" "}
        <span className="font-semibold text-primary">{pessoas.length}</span>
      </p>
      {blocos.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Sem horário de funcionamento cadastrado para este dia.
        </p>
      ) : (
        blocos.map((b) => (
          <div key={b.key} className="rounded-md border border-border bg-background p-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium">
              <span>
                {b.titulo}
                {b.horario ? ` · ${b.horario}` : ""}
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {b.pessoas.length} pessoa(s)
              </Badge>
            </div>
            <ul className="mt-1 space-y-0.5">
              {b.pessoas.map((p) => (
                <li key={p.colaborador_id} className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={cn("flex-1 truncate", p.origem === "convocacao" && "text-primary")}>
                    {p.nome}
                    {p.origem === "convocacao" && " (a convocar)"}
                  </span>
                  <span className="text-muted-foreground">{p.cargo_nome ?? "—"}</span>
                  <span>{p.entrada && p.saida ? `${p.entrada}–${p.saida}` : "—"}</span>
                </li>
              ))}
              {b.pessoas.length === 0 && (
                <li className="text-[11px] text-muted-foreground">Ninguém previsto neste período.</li>
              )}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
