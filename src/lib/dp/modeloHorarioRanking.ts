import type { DiaConfig } from "@/lib/dp/config-trabalho";
import type { HorarioSimples } from "@/lib/dp/turno-resolver";

export interface ModeloHorarioRanking {
  cargo_id: string | null;
  horario: HorarioSimples | null;
  dias: DiaConfig[];
  folga_variavel: boolean;
  usado_em: string;
}

export function assinaturaModeloHorario(modelo: ModeloHorarioRanking): string {
  return JSON.stringify({
    horario: modelo.horario,
    folga_variavel: modelo.folga_variavel,
    dias: [...modelo.dias]
      .sort((a, b) => a.dow - b.dow)
      .map(({ dow, trabalha, turno_id, entrada, saida, intervalo_minutos }) => ({
        dow, trabalha, turno_id, entrada, saida, intervalo_minutos,
      })),
  });
}

/** Mais frequente no cargo; sem histórico no cargo, mais frequente na empresa. */
export function sugerirModeloHorario<T extends ModeloHorarioRanking>(modelos: T[], cargoId?: string | null): T | null {
  const candidatosCargo = cargoId ? modelos.filter((m) => m.cargo_id === cargoId) : [];
  const candidatos = candidatosCargo.length > 0 ? candidatosCargo : modelos;
  const grupos = new Map<string, { quantidade: number; recente: string; modelo: T }>();
  for (const modelo of candidatos) {
    if (!modelo.horario) continue;
    const assinatura = assinaturaModeloHorario(modelo);
    const atual = grupos.get(assinatura);
    if (!atual) grupos.set(assinatura, { quantidade: 1, recente: modelo.usado_em, modelo });
    else {
      atual.quantidade += 1;
      if (modelo.usado_em > atual.recente) {
        atual.recente = modelo.usado_em;
        atual.modelo = modelo;
      }
    }
  }
  return [...grupos.values()]
    .sort((a, b) => b.quantidade - a.quantidade || b.recente.localeCompare(a.recente))[0]?.modelo ?? null;
}