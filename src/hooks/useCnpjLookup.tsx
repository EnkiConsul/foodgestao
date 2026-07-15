import { useMutation } from "@tanstack/react-query";
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
}

export function useCnpjLookup() {
  return useMutation<CnpjLookupResult, Error, string>({
    mutationFn: async (cnpj: string) => {
      const digits = cnpj.replace(/\D/g, "");
      if (digits.length !== 14) throw new Error("Informe um CNPJ com 14 dígitos.");
      if (!isValidCnpj(digits)) throw new Error("CNPJ inválido (dígitos verificadores).");

      const { data, error } = await supabase.functions.invoke("lookup-cnpj", {
        body: { cnpj: digits },
      });

      if (error) {
        // Try to surface the real message returned by the edge function
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
      return data as CnpjLookupResult;
    },
  });
}
