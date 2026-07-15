import { toast } from "sonner";
import type { CnpjLookupResult } from "@/hooks/useCnpjLookup";

interface HandleOptions {
  onSuccess?: (data: CnpjLookupResult) => void;
  onRetry?: () => void;
}

const MESSAGES: Record<string, { title: string; description: string; retry: boolean }> = {
  not_found: {
    title: "CNPJ não encontrado",
    description: "Verifique se o número está correto ou preencha os dados manualmente.",
    retry: false,
  },
  rate_limited: {
    title: "Muitas consultas",
    description: "Aguarde alguns segundos antes de tentar novamente.",
    retry: true,
  },
  timeout: {
    title: "Tempo esgotado",
    description: "A Receita Federal demorou para responder. Tente novamente em instantes.",
    retry: true,
  },
  network_error: {
    title: "Sem conexão",
    description: "Não foi possível contatar a Receita Federal. Verifique sua internet e tente novamente.",
    retry: true,
  },
  upstream_unavailable: {
    title: "Receita Federal indisponível",
    description: "O serviço está fora do ar temporariamente. Tente novamente em alguns minutos ou preencha manualmente.",
    retry: true,
  },
  internal_error: {
    title: "Erro na consulta",
    description: "Ocorreu um erro inesperado. Tente novamente.",
    retry: true,
  },
  empty_response: {
    title: "Sem resposta",
    description: "A consulta retornou vazia. Tente novamente.",
    retry: true,
  },
};

export function notifyCnpjSuccess(data: CnpjLookupResult) {
  if (data._stale) {
    toast.warning("Usando dados salvos", {
      description: "A Receita Federal está indisponível no momento. Os dados exibidos podem estar desatualizados.",
    });
  } else {
    toast.success("CNPJ encontrado", {
      description: data.razao_social ?? undefined,
    });
  }
}

export function notifyCnpjError(err: unknown, options: HandleOptions = {}) {
  const e = err as Error & { code?: string };
  const info = (e.code && MESSAGES[e.code]) || {
    title: "Falha na consulta",
    description: e.message || "Não foi possível consultar o CNPJ.",
    retry: true,
  };
  toast.error(info.title, {
    description: info.description,
    action: info.retry && options.onRetry ? { label: "Tentar novamente", onClick: options.onRetry } : undefined,
  });
}
