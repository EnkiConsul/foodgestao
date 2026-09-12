/**
 * Caminho único para avisar as telas quando uma pendência é resolvida.
 *
 * Toda ação que resolve pendência (documento enviado, importação em lote,
 * adiantamento, licença, férias, ocorrência, solicitação, troca) chama
 * `resolverPendencias`. A rotina faz, nesta ordem:
 *
 * 1. dá baixa imediata dos itens afetados no cache da tela e no retrato local,
 *    para que a lista do Início e a lista completa reflitam a ação na hora;
 * 2. pede a nova apuração no servidor;
 * 3. invalida a lista e o horário de "última atualização" quando ela termina.
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lerPendenciasSnapshot, salvarPendenciasSnapshot } from "@/lib/dp/pendencias-cache";
import type { Pendencia } from "@/hooks/useDpPendencias";

/** Aviso interno para o card do Início aplicar a baixa sem esperar a apuração. */
export const PENDENCIAS_BAIXA_EVENTO = "dp:pendencias-baixa";

export type PendenciasBaixaDetalhe = { companyId: string; ids: string[] };

export type PendenciaMatch = (p: Pendencia) => boolean;

/** Casa pendências pelos identificadores exatos. */
export function porIds(ids: Array<string | null | undefined>): PendenciaMatch {
  const alvo = new Set(ids.filter((x): x is string => !!x));
  return (p) => alvo.has(p.id);
}

/** Casa pendências de documento por tipo/colaborador/unidade/competência. */
export function porDocumento(filtro: {
  docTipo?: string | null;
  colaboradorId?: string | null;
  unidadeId?: string | null;
  competencia?: string | null;
}): PendenciaMatch {
  return (p) => {
    if (!p.docTipo) return false;
    if (filtro.docTipo && p.docTipo !== filtro.docTipo) return false;
    if (filtro.colaboradorId && p.colaboradorId !== filtro.colaboradorId) return false;
    if (filtro.unidadeId && p.unidadeId !== filtro.unidadeId) return false;
    if (filtro.competencia && p.competencia !== filtro.competencia) return false;
    return true;
  };
}

/** Qualquer um dos critérios resolve a pendência. */
export function qualquer(...matches: PendenciaMatch[]): PendenciaMatch {
  return (p) => matches.some((m) => m(p));
}

/**
 * Remove os itens do cache da consulta e do retrato local, avisando o card.
 * Retorna os identificadores efetivamente baixados.
 */
export function baixarPendencias(
  qc: QueryClient,
  companyId: string | null | undefined,
  match: PendenciaMatch,
): string[] {
  if (!companyId) return [];
  const baixados = new Set<string>();

  qc.setQueriesData<Pendencia[] | undefined>(
    { queryKey: ["dp_pendencias", companyId] },
    (atual) => {
      if (!Array.isArray(atual)) return atual;
      const restantes = atual.filter((p) => {
        if (!match(p)) return true;
        baixados.add(p.id);
        return false;
      });
      return restantes.length === atual.length ? atual : restantes;
    },
  );

  const snapshot = lerPendenciasSnapshot(companyId);
  if (snapshot) {
    const restantes = snapshot.data.filter((p) => {
      if (!match(p)) return true;
      baixados.add(p.id);
      return false;
    });
    if (restantes.length !== snapshot.data.length) {
      salvarPendenciasSnapshot(companyId, { ...snapshot, data: restantes });
    }
  }

  const ids = [...baixados];
  if (ids.length > 0 && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<PendenciasBaixaDetalhe>(PENDENCIAS_BAIXA_EVENTO, {
        detail: { companyId, ids },
      }),
    );
  }
  return ids;
}

export type ResolverPendenciasOpcoes = {
  companyId: string | null | undefined;
  /** Itens que a ação resolveu — recebem baixa imediata na tela. */
  match?: PendenciaMatch;
  /** Pede a nova apuração no servidor (padrão: sim). */
  recalcular?: boolean;
};

/**
 * Dá baixa dos itens resolvidos, pede a nova apuração e atualiza as telas.
 * Nunca lança: falha de rede apenas deixa o recálculo para a próxima leitura.
 */
export async function resolverPendencias(
  qc: QueryClient,
  { companyId, match, recalcular = true }: ResolverPendenciasOpcoes,
): Promise<void> {
  if (match) baixarPendencias(qc, companyId, match);

  if (recalcular && companyId) {
    try {
      await supabase.functions.invoke("dp-refresh-pendencias", { body: { companyId } });
    } catch (e) {
      console.warn("pendencias/resolver:", e);
    }
  }

  if (companyId) {
    void qc.invalidateQueries({ queryKey: ["dp_pendencias", companyId] });
  } else {
    void qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
  }
  void qc.invalidateQueries({ queryKey: ["dp_pendencias_apuracao"] });
  void qc.invalidateQueries({ queryKey: ["dp_pendencias_colaborador"] });
}
