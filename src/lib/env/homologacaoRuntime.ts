/**
 * Guardas de runtime aplicadas SOMENTE quando o build é de homologação
 * (`VITE_APP_ENV=homologacao` + banco de homologação, validado em `appEnv.ts`).
 *
 * Três responsabilidades, num único ponto para não duplicar regra por tela:
 *  1. Consultas externas de cadastro (CNPJ) respondem por fixture determinística,
 *     sem nenhuma transmissão a provedores.
 *  2. Funções de servidor seguem ALLOWLIST: só as internas aprovadas passam;
 *     qualquer nome desconhecido é negado por padrão (default deny).
 *  3. Fluxos nativos de e-mail do Auth (cadastro, reenvio de confirmação,
 *     recuperação de senha, link mágico, troca de e-mail) são bloqueados para
 *     que nenhum e-mail real saia em homologação. Login com senha continua
 *     liberado (usuários de fixture já existentes no banco de homologação).
 *
 * No build de produção nada disto é instalado.
 */
import { isHomologacao } from "./appEnv";
import { cnpjFixture } from "./homologacaoFixtures";

/**
 * Funções internas APROVADAS em homologação. Tudo fora desta lista (e fora da
 * lista de simuladas) é negado — inclusive nomes novos que venham a surgir.
 *
 * Critério: função que só fala com o banco de homologação, sem provedor externo,
 * sem pagamento, sem IA e sem envio de e-mail/WhatsApp.
 */
export const FUNCOES_PERMITIDAS_HOM = [
  "dp-refresh-pendencias",
  "dp-sorteio-folgas",
  "dp-preadmissao-gestor",
  "dp-preadmissao-publica",
  "dp-preadmissao-arquivo",
  "dp-doc-bulk-approve",
  "dp-doc-bulk-discard",
  "dp-bloquear-acesso-colaborador",
  "auth-config",
] as const;

/** Funções cuja resposta é simulada localmente em homologação (sem rede). */
export const FUNCOES_MOCKADAS_HOM = ["lookup-cnpj", "check-onboarding-cnpj"] as const;

/**
 * Métodos do Auth que disparam e-mail real pelo provedor do projeto.
 * Bloqueados em homologação. `signInWithPassword` NÃO entra aqui.
 */
export const METODOS_AUTH_BLOQUEADOS_HOM = [
  "signUp",
  "resend",
  "resetPasswordForEmail",
  "signInWithOtp",
  "reauthenticate",
] as const;

/** CNPJ de fixture tratado como "já cadastrado" para testar o caminho duplicado. */
export const CNPJ_FIXTURE_REGISTRADO = "19131243000197";

export function funcaoPermitidaEmHomologacao(nome: string): boolean {
  return (FUNCOES_PERMITIDAS_HOM as readonly string[]).includes(String(nome ?? ""));
}

export function funcaoMockadaEmHomologacao(nome: string): boolean {
  return (FUNCOES_MOCKADAS_HOM as readonly string[]).includes(String(nome ?? ""));
}

/** Default deny: bloqueado é tudo que não está explicitamente permitido nem simulado. */
export function funcaoBloqueadaEmHomologacao(nome: string): boolean {
  const n = String(nome ?? "");
  if (!n) return true;
  return !funcaoPermitidaEmHomologacao(n) && !funcaoMockadaEmHomologacao(n);
}

export class FuncaoBloqueadaError extends Error {
  constructor(nome: string) {
    super(
      `Função de servidor "${nome}" não está na lista aprovada para o ambiente de ` +
        "homologação (bloqueio padrão). Nenhuma chamada foi enviada.",
    );
    this.name = "FuncaoBloqueadaError";
  }
}

export class AuthEmailBloqueadoError extends Error {
  constructor(metodo: string) {
    super(
      `"${metodo}" envia e-mail real e está bloqueado no ambiente de homologação. ` +
        "Use os usuários de teste já existentes com login e senha.",
    );
    this.name = "AuthEmailBloqueadoError";
  }
}

type Resposta = { data: unknown; error: unknown };
type Invoke = (nome: string, opcoes?: { body?: unknown }) => Promise<Resposta>;

interface ClienteComFuncoes {
  functions: { invoke: Invoke; __homGuard?: boolean };
  auth?: Record<string, unknown> & { __homGuard?: boolean };
}

const digitosDe = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Respostas determinísticas, sem rede, das funções simuladas. */
export function respostaMockada(nome: string, body: unknown): Resposta | null {
  const cnpj = digitosDe((body as { cnpj?: unknown } | undefined)?.cnpj);

  if (nome === "lookup-cnpj") {
    if (cnpj.length !== 14) {
      return { data: null, error: new Error("CNPJ inválido (homologação).") };
    }
    return {
      data: { ...cnpjFixture(cnpj), _cached: false, _fetched_at: new Date(0).toISOString() },
      error: null,
    };
  }

  if (nome === "check-onboarding-cnpj") {
    if (cnpj.length !== 14) {
      return { data: null, error: new Error("CNPJ inválido (homologação).") };
    }
    return {
      data:
        cnpj === CNPJ_FIXTURE_REGISTRADO
          ? { status: "registered" }
          : { status: "available" },
      error: null,
    };
  }

  return null;
}

function instalarGuardaAuth(cliente: ClienteComFuncoes): void {
  const auth = cliente.auth;
  if (!auth || auth.__homGuard) return;

  for (const metodo of METODOS_AUTH_BLOQUEADOS_HOM) {
    if (typeof auth[metodo] !== "function") continue;
    auth[metodo] = async () => ({
      data: { user: null, session: null },
      error: new AuthEmailBloqueadoError(metodo),
    });
  }

  // Troca de e-mail também dispara mensagem real: bloqueia só esse caso.
  const updateUser = auth.updateUser;
  if (typeof updateUser === "function") {
    const original = (updateUser as (...a: unknown[]) => Promise<Resposta>).bind(auth);
    auth.updateUser = async (atributos: unknown, ...resto: unknown[]) => {
      if ((atributos as { email?: unknown } | undefined)?.email) {
        return { data: { user: null }, error: new AuthEmailBloqueadoError("updateUser({ email })") };
      }
      return original(atributos, ...resto);
    };
  }

  auth.__homGuard = true;
}

/**
 * Guarda complementar nos métodos do Auth do cliente (propriedade estável,
 * criada no construtor do SDK). Idempotente.
 *
 * ATENÇÃO: o bloqueio de FUNÇÕES não é feito aqui. `cliente.functions` é um
 * getter que devolve uma instância nova a cada acesso no SDK real, então
 * qualquer substituição ali seria descartada. Esse bloqueio vive na guarda de
 * transporte (`homologacaoFetchGuard.ts`), instalada no `fetch` antes do
 * cliente existir.
 */
export function instalarGuardasHomologacao(
  cliente: ClienteComAuth,
  ativo = isHomologacao(),
): boolean {
  if (!ativo) return false;
  instalarGuardaAuth(cliente);
  return true;
}

