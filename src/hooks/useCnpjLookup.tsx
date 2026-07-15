import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isValidCnpj } from "@/lib/cnpj";

export interface CnpjLookupResult {
  cnpj: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  email: string | null;
  telefone: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  situacao: string | null;
  endereco_formatado: string;
  _cached?: boolean;
  _stale?: boolean;
  _fetched_at?: string;
}

// Cache client-side: 6h. Após isso, refetch (que ainda pode voltar do cache do servidor).
const CLIENT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export const cnpjQueryKey = (digits: string) => ["cnpj-lookup", digits] as const;

export function useCnpjLookup() {
  const qc = useQueryClient();

  return useMutation<CnpjLookupResult, Error, string>({
    mutationFn: async (cnpj: string) => {
      const digits = cnpj.replace(/\D/g, "");
      if (digits.length !== 14) throw new Error("Informe um CNPJ com 14 dígitos.");
      if (!isValidCnpj(digits)) throw new Error("CNPJ inválido (dígitos verificadores).");

      // 1) Client cache hit?
      const key = cnpjQueryKey(digits);
      const cached = qc.getQueryData<CnpjLookupResult>(key);
      const cachedAt = qc.getQueryState(key)?.dataUpdatedAt ?? 0;
      if (cached && Date.now() - cachedAt < CLIENT_CACHE_TTL_MS) {
        return { ...cached, _cached: true };
      }

      // 2) Call edge function (which has its own DB cache)
      const { data, error } = await supabase.functions.invoke("lookup-cnpj", {
        body: { cnpj: digits },
      });

      if (error) {
        const anyErr = error as any;
        try {
          const ctxText = anyErr?.context ? await anyErr.context.text() : null;
          if (ctxText) {
            try {
              const parsed = JSON.parse(ctxText);
              throw new Error(parsed.error || ctxText);
            } catch {
              throw new Error(ctxText);
            }
          }
        } catch (e) {
          if (e instanceof Error) throw e;
        }
        throw new Error(error.message || "Falha ao consultar CNPJ");
      }

      if (!data) throw new Error("Sem resposta da consulta.");

      const result = data as CnpjLookupResult;
      qc.setQueryData(key, result);
      return result;
    },
  });
}
