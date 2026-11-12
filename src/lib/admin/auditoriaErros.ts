/**
 * Regras puras da tela de Auditoria de erros (Backoffice).
 * Sem acesso a banco: a tela e os testes leem as mesmas funções.
 */

/** Fatias para filtros `in` sem estourar o tamanho do endereço (HTTP 414). */
export const TAMANHO_FATIA_IDS = 40;

export function fatiar<T>(itens: T[], tamanho = TAMANHO_FATIA_IDS): T[][] {
  const n = Math.max(1, Math.floor(tamanho));
  const fatias: T[][] = [];
  for (let i = 0; i < itens.length; i += n) fatias.push(itens.slice(i, i + n));
  return fatias;
}

export type ErroResumoEntrada = {
  status: "aberto" | "resolvido" | "ignorado";
  first_seen_at: string;
  occurrences: number;
  reports?: Array<{ status: string }>;
};

export type ResumoErros = {
  abertos: number;
  novos24h: number;
  comChamados: number;
  ocorrencias: number;
};

/** Chamado de cliente que ainda pede atenção do suporte. */
export function temChamadoPendente(l: Pick<ErroResumoEntrada, "reports">): boolean {
  return (l.reports ?? []).some((r) => r.status === "aberto" || r.status === "em_analise");
}

export function resumoErros(linhas: ErroResumoEntrada[], agora = Date.now()): ResumoErros {
  return linhas.reduce<ResumoErros>(
    (acc, l) => {
      if (l.status === "aberto") acc.abertos += 1;
      if (l.status === "aberto" && agora - new Date(l.first_seen_at).getTime() < 86_400_000) acc.novos24h += 1;
      if (temChamadoPendente(l)) acc.comChamados += 1;
      acc.ocorrencias += Math.max(0, Number(l.occurrences) || 0);
      return acc;
    },
    { abertos: 0, novos24h: 0, comChamados: 0, ocorrencias: 0 },
  );
}

/** Nome que o suporte reconhece: nome fantasia, depois razão social. */
export function nomeEmpresa(c: { name?: string | null; trade_name?: string | null } | null | undefined): string | null {
  const nome = (c?.trade_name ?? "").trim() || (c?.name ?? "").trim();
  return nome || null;
}

const soDigitos = (v: string) => v.replace(/\D/g, "");

/** Busca livre: texto em qualquer campo; CNPJ com ou sem pontuação. */
export function casaBusca(campos: Array<string | null | undefined>, termo: string, cnpj?: string | null): boolean {
  const t = termo.trim().toLowerCase();
  if (!t) return true;
  if (campos.some((v) => v && String(v).toLowerCase().includes(t))) return true;
  const digitos = soDigitos(t);
  return digitos.length >= 4 && !!cnpj && soDigitos(cnpj).includes(digitos);
}

/** Decisão em lote: ignorar exige justificativa; resolver aceita sem. */
export function podeConfirmarDecisao(status: "resolvido" | "ignorado", nota: string, quantidade: number): boolean {
  if (quantidade <= 0) return false;
  return status === "resolvido" || nota.trim().length > 0;
}
