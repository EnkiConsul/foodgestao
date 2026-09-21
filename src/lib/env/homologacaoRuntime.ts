/**
 * Guardas de runtime aplicadas SOMENTE quando o build é de homologação
 * (`VITE_APP_ENV=homologacao` + banco de homologação, validado em `appEnv.ts`).
 *
 * Duas responsabilidades, num único ponto para não duplicar regra por tela:
 *  1. Consultas externas de cadastro (CNPJ) respondem por fixture determinística,
 *     sem nenhuma transmissão a provedores.
 *  2. Integrações externas não aprovadas para homologação (pagamentos, Open
 *     Finance, e-mail/WhatsApp, buscadores, IA) são bloqueadas fail-closed.
 *
 * No build de produção nada disto é instalado.
 */
import { isHomologacao } from "./appEnv";
import { cnpjFixture } from "./homologacaoFixtures";

/** Prefixos de funções externas bloqueadas em homologação. */
export const PREFIXOS_BLOQUEADOS_HOM = [
  "asaas-",
  "pluggy-",
  "ai-",
  "inspect-search-console",
] as const;

/** Funções específicas bloqueadas (envio de e-mail/WhatsApp e afins). */
export const FUNCOES_BLOQUEADAS_HOM = [
  "dp-send-broadcast",
  "admin-resend-confirmation",
  "auth-recovery-request",
  "auth-email-hook",
  "sync-extra-companies",
  "validate-coupon",
] as const;

/** Funções cuja resposta é simulada localmente em homologação. */
export const FUNCOES_MOCKADAS_HOM = ["lookup-cnpj"] as const;

export function funcaoBloqueadaEmHomologacao(nome: string): boolean {
  const n = String(nome ?? "");
  if ((FUNCOES_BLOQUEADAS_HOM as readonly string[]).includes(n)) return true;
  return PREFIXOS_BLOQUEADOS_HOM.some((p) => n.startsWith(p));
}

export function funcaoMockadaEmHomologacao(nome: string): boolean {
  return (FUNCOES_MOCKADAS_HOM as readonly string[]).includes(String(nome ?? ""));
}

export class FuncaoBloqueadaError extends Error {
  constructor(nome: string) {
    super(
      `Integração externa "${nome}" está bloqueada no ambiente de homologação. ` +
        "Use o ambiente de produção com autorização específica.",
    );
    this.name = "FuncaoBloqueadaError";
  }
}

type Resposta = { data: unknown; error: unknown };
type Invoke = (nome: string, opcoes?: { body?: unknown }) => Promise<Resposta>;

interface ClienteComFuncoes {
  functions: { invoke: Invoke; __homGuard?: boolean };
}

/** Resposta determinística de CNPJ, sem rede. */
export function respostaMockada(nome: string, body: unknown): Resposta | null {
  if (nome !== "lookup-cnpj") return null;
  const bruto = (body as { cnpj?: unknown } | undefined)?.cnpj;
  const digitos = String(bruto ?? "").replace(/\D/g, "");
  if (digitos.length !== 14) {
    return { data: null, error: new Error("CNPJ inválido (homologação).") };
  }
  return {
    data: { ...cnpjFixture(digitos), _cached: false, _fetched_at: new Date(0).toISOString() },
    error: null,
  };
}

/**
 * Instala as guardas no cliente informado. Idempotente.
 * Retorna `true` quando as guardas ficaram ativas.
 */
export function instalarGuardasHomologacao(
  cliente: ClienteComFuncoes,
  ativo = isHomologacao(),
): boolean {
  if (!ativo) return false;
  if (cliente.functions.__homGuard) return true;

  const original = cliente.functions.invoke.bind(cliente.functions) as Invoke;

  cliente.functions.invoke = async (nome: string, opcoes?: { body?: unknown }) => {
    if (funcaoBloqueadaEmHomologacao(nome)) {
      return { data: null, error: new FuncaoBloqueadaError(nome) };
    }
    const mock = respostaMockada(nome, opcoes?.body);
    if (mock) return mock;
    return original(nome, opcoes);
  };
  cliente.functions.__homGuard = true;
  return true;
}
