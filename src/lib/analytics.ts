/**
 * Métricas de marketing — DESATIVADAS (AUD-021).
 *
 * Nenhum SDK de Google Analytics ou pixel da Meta é carregado neste
 * aplicativo, e este módulo não envia, não enfileira e não guarda nada para
 * reenvio futuro: `trackEvent` é intencionalmente um no-op.
 *
 * Motivo: os SDKs leem a URL por conta própria (medição avançada e captura
 * automática de eventos), então nenhuma sanitização feita aqui impediria o
 * vazamento de credenciais temporárias presentes em links de ativação,
 * recuperação, convite e autorização. Enquanto as páginas de marketing não
 * estiverem isoladas das páginas autenticadas, a contenção previsível é não
 * ter tracker algum.
 *
 * Os sanitizadores continuam em `@/lib/security/trackingPrivacy` para o
 * trabalho futuro de reativação. Consulte
 * docs/security/metricas-marketing-desativadas.md antes de religar qualquer
 * coisa; a assinatura pública abaixo é mantida somente para não obrigar as
 * telas a mudar.
 *
 * O registro de violações de CSP (`@/lib/security/cspViolationLogger`) é outra
 * coisa: é segurança, fica apenas no console e permanece ativo.
 */

/** Nome do passo do funil. Nenhum dado de evento é aceito nem lido. */
export function trackEvent(_eventName: string, _params?: Record<string, unknown>): void {
  // Desativado de propósito. Não criar window.dataLayer, não chamar gtag/fbq,
  // não acumular fila para replay: qualquer fila viraria vazamento no futuro.
  return;
}

/** Funnel step names used across the landing → signup flow. */
export const FunnelStep = {
  CtaClick: "cta_click_trial",
  SignupFormView: "signup_form_view",
  SignupStart: "signup_start",
  SignupValidationError: "signup_validation_error",
  SignupSuccess: "sign_up", // GA4 recommended event
  SignupError: "signup_error",
  LeadGenerated: "generate_lead", // GA4 recommended conversion
} as const;
