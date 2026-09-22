/**
 * Rascunho da ficha de admissão guardado no sistema.
 *
 * O conteúdo fica por empresa e por usuário (tabela dp_admissao_rascunhos), de
 * modo que o gestor retoma o preenchimento em qualquer aparelho. A gravação
 * passa por rotina no servidor, que confere o acesso à empresa e a versão para
 * não sobrescrever um salvamento mais novo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { ConteudoRascunhoAdmissao } from "@/lib/dp/admissao-rascunho";
import { rascunhoTemConteudo } from "@/lib/dp/admissao-rascunho";

export interface RascunhoAdmissaoCarregado {
  dados: ConteudoRascunhoAdmissao;
  versao: number;
  atualizadoEm: string;
}

const ATRASO_MS = 1500;

export function useDpAdmissaoRascunho(chave: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const [salvando, setSalvando] = useState(false);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const versaoRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const pendenteRef = useRef<ConteudoRascunhoAdmissao | null>(null);
  const assinaturaRef = useRef<string | null>(null);

  const cancelar = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendenteRef.current = null;
  }, []);

  useEffect(() => cancelar, [cancelar]);

  /** Lê o rascunho guardado. Devolve null quando não há nada para retomar. */
  const carregar = useCallback(async (): Promise<RascunhoAdmissaoCarregado | null> => {
    if (!selectedCompanyId || !chave) return null;
    const { data, error } = await supabase
      .from("dp_admissao_rascunhos")
      .select("dados, versao, updated_at")
      .eq("company_id", selectedCompanyId)
      .eq("chave", chave)
      .maybeSingle();
    if (error || !data) return null;
    const dados = (data.dados ?? {}) as ConteudoRascunhoAdmissao;
    versaoRef.current = data.versao as number;
    assinaturaRef.current = JSON.stringify(dados);
    if (!rascunhoTemConteudo(dados)) return null;
    return { dados, versao: data.versao as number, atualizadoEm: String(data.updated_at) };
  }, [selectedCompanyId, chave]);

  const salvarAgora = useCallback(
    async (dados: ConteudoRascunhoAdmissao): Promise<boolean> => {
      if (!selectedCompanyId || !chave) return false;
      if (!rascunhoTemConteudo(dados)) return false;
      setSalvando(true);
      try {
        const { data, error } = await supabase.rpc("dp_admissao_rascunho_salvar", {
          p_company_id: selectedCompanyId,
          p_chave: chave,
          p_dados: dados as unknown as Record<string, unknown>,
          p_versao: versaoRef.current,
        });
        if (error) throw error;
        const linha = Array.isArray(data) ? data[0] : data;
        if (linha) {
          versaoRef.current = (linha as { versao: number }).versao;
          setSalvoEm(String((linha as { atualizado_em: string }).atualizado_em));
        }
        assinaturaRef.current = JSON.stringify(dados);
        return true;
      } catch {
        // Rascunho é conveniência: falha não interrompe o preenchimento.
        return false;
      } finally {
        setSalvando(false);
      }
    },
    [selectedCompanyId, chave],
  );

  /** Gravação automática após a pausa na digitação. */
  const agendar = useCallback(
    (dados: ConteudoRascunhoAdmissao) => {
      if (!selectedCompanyId || !chave) return;
      const assinatura = JSON.stringify(dados);
      if (assinatura === assinaturaRef.current) return;
      pendenteRef.current = dados;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const p = pendenteRef.current;
        pendenteRef.current = null;
        if (p) void salvarAgora(p);
      }, ATRASO_MS);
    },
    [selectedCompanyId, chave, salvarAgora],
  );

  const descartar = useCallback(async () => {
    cancelar();
    versaoRef.current = null;
    assinaturaRef.current = null;
    setSalvoEm(null);
    if (!selectedCompanyId || !chave) return;
    try {
      await supabase.rpc("dp_admissao_rascunho_descartar", {
        p_company_id: selectedCompanyId,
        p_chave: chave,
      });
    } catch {
      /* descarte silencioso: o rascunho não bloqueia nada */
    }
  }, [selectedCompanyId, chave, cancelar]);

  /** Reinicia o controle interno ao trocar de ficha. */
  const reiniciar = useCallback(() => {
    cancelar();
    versaoRef.current = null;
    assinaturaRef.current = null;
    setSalvoEm(null);
  }, [cancelar]);

  return { carregar, salvarAgora, agendar, descartar, cancelar, reiniciar, salvando, salvoEm };
}
