export interface TurnstileErrorInfo {
  title: string;
  message: string;
  hint?: string;
  code: string;
}

export const OFFICIAL_DOMAIN = "aveto360.com";

/**
 * Traduz o código de erro do Cloudflare Turnstile para uma mensagem útil em PT-BR.
 * `hostname` é o domínio em que a tela está rodando (window.location.hostname).
 */
export function describeTurnstileError(rawCode: string | null | undefined, hostname: string): TurnstileErrorInfo {
  const code = String(rawCode ?? "unknown").trim() || "unknown";
  const host = hostname || "este domínio";

  // 110200 = hostname não autorizado no widget
  if (code.startsWith("110200")) {
    return {
      code,
      title: "Verificação de segurança indisponível neste domínio.",
      message: `O domínio ${host} não está autorizado no widget de verificação (código ${code}).`,
      hint: `Acesse pelo site oficial ${OFFICIAL_DOMAIN} ou peça ao administrador para adicionar o domínio ${host} na lista de hostnames do widget Turnstile no painel Cloudflare.`,
    };
  }

  if (code === "script-load-failed" || code.startsWith("300") || code.startsWith("network")) {
    return {
      code,
      title: "Não foi possível carregar a verificação de segurança.",
      message: `A verificação de segurança não carregou (código ${code}).`,
      hint: "Verifique sua conexão e se algum bloqueador de anúncios, VPN ou firewall está bloqueando challenges.cloudflare.com. Depois, tente novamente.",
    };
  }

  if (code.startsWith("110")) {
    return {
      code,
      title: "Verificação de segurança recusada.",
      message: `A verificação de segurança foi recusada pelo Cloudflare (código ${code}).`,
      hint: `Tente novamente. Se persistir, acesse pelo site oficial ${OFFICIAL_DOMAIN} ou avise o administrador com o código ${code}.`,
    };
  }

  return {
    code,
    title: "Verificação de segurança indisponível.",
    message: `A verificação de segurança falhou (código ${code}).`,
    hint: "Clique em Tentar novamente. Se o erro continuar, informe o código acima ao suporte.",
  };
}

export function currentHostname(): string {
  return typeof window !== "undefined" ? window.location.hostname : "";
}
