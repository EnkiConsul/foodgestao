import { MARCACAO_LABEL, TIPO_LABEL, type OcorrenciaMarcacao, type OcorrenciaTipo } from "@/lib/dp/ocorrencias";

interface Base {
  tipo: OcorrenciaTipo;
  marcacao_alvo: OcorrenciaMarcacao | null;
  horario_real: string | null;
  horario_estimado: string | null;
  horario_previsto: string | null;
  previsto_entrada: string | null;
  previsto_saida: string | null;
}

const hm = (v: string | null | undefined) => (v ? v.slice(0, 5) : null);

/** Leitura direta: o que houve, em qual batida, a que horas e contra o previsto. */
export function resumoTratativa(o: Base): { titulo: string; batida: string | null; horario: string | null; previsto: string | null } {
  // "Problema no relógio" do portal chega como divergência com a batida informada.
  const titulo =
    o.tipo === "divergencia_jornada" && o.marcacao_alvo ? "Erro no relógio de ponto" : TIPO_LABEL[o.tipo];
  const batida = o.marcacao_alvo ? MARCACAO_LABEL[o.marcacao_alvo] : null;
  const horario = hm(o.horario_real) ?? hm(o.horario_estimado);
  const previsto =
    o.marcacao_alvo === "entrada"
      ? hm(o.previsto_entrada) ?? hm(o.horario_previsto)
      : o.marcacao_alvo === "saida"
        ? hm(o.previsto_saida) ?? hm(o.horario_previsto)
        : hm(o.horario_previsto);
  return { titulo, batida, horario, previsto };
}
