import { diasAte } from "@/lib/dp/feriado-regua";

export type FeriadoEscala = { unidadeId: string; unidade: string; data: string; nome: string };
export type OperacaoFeriado = { unidade_id: string; data: string; fechada: boolean; escala_confirmada_em: string | null };

/**
 * Feriados dos próximos 10 dias (inclusive hoje) cuja escala ainda depende
 * de confirmação do gestor. Loja fechada ou escala já confirmada não pedem nada.
 */
export function feriadosPendentesConfirmacao(hoje: string, feriados: FeriadoEscala[], ops: OperacaoFeriado[]): FeriadoEscala[] {
  const resolvido = new Set(
    ops.filter((o) => o.fechada || o.escala_confirmada_em).map((o) => `${o.unidade_id}:${o.data}`),
  );
  const vistos = new Set<string>();
  return feriados
    .filter((f) => {
      const d = diasAte(hoje, f.data);
      const k = `${f.unidadeId}:${f.data}`;
      if (d < 0 || d > 10 || resolvido.has(k) || vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .sort((a, b) => a.data.localeCompare(b.data) || a.unidade.localeCompare(b.unidade));
}

/** Agrupa por data (mesmo feriado em várias lojas) para confirmar em lote. */
export function agruparPorData(itens: FeriadoEscala[]): { data: string; nome: string; lojas: FeriadoEscala[] }[] {
  const m = new Map<string, { data: string; nome: string; lojas: FeriadoEscala[] }>();
  for (const i of itens) {
    const g = m.get(i.data) ?? { data: i.data, nome: i.nome, lojas: [] };
    g.lojas.push(i);
    m.set(i.data, g);
  }
  return [...m.values()];
}
