/**
 * Guarda de TRANSPORTE da homologação — instalada no `fetch` global ANTES de
 * qualquer criação de cliente do banco.
 *
 * Por que no transporte: no SDK real, `SupabaseClient.functions` é um GETTER que
 * devolve uma NOVA instância de `FunctionsClient` a cada acesso
 * (`node_modules/@supabase/supabase-js/src/SupabaseClient.ts`). Substituir
 * `cliente.functions.invoke` altera apenas um objeto descartável: o acesso
 * seguinte recria o cliente sem a guarda e a chamada iria para a rede. Por isso
 * o bloqueio vive no `fetch`, único ponto por onde toda requisição passa.
 *
 * Responsabilidades (somente quando o build é de homologação):
 *  1. Funções de servidor simuladas respondem localmente, sem rede.
 *  2. ALLOWLIST de funções internas aprovadas; qualquer outro nome é negado
 *     por padrão (default deny), inclusive nomes novos.
 *  3. Endpoints nativos do Auth que disparam e-mail real são negados.
 *
 * No build de produção nada disto é instalado e o `fetch` não é tocado.
 */
import { isHomologacao } from "./appEnv";
import {
  AuthEmailBloqueadoError,
  FuncaoBloqueadaError,
  funcaoBloqueadaEmHomologacao,
  funcaoMockadaEmHomologacao,
  respostaMockada,
} from "./homologacaoRuntime";

const MARCA = "__homFetchGuard";

type EscopoComFetch = {
  fetch?: typeof fetch;
  [MARCA]?: boolean;
};

/** Endpoints do Auth que enviam e-mail real (bloqueados em homologação). */
const ROTAS_AUTH_BLOQUEADAS = ["/auth/v1/signup", "/auth/v1/recover", "/auth/v1/resend", "/auth/v1/otp", "/auth/v1/invite", "/auth/v1/magiclink"];

function urlDe(entrada: RequestInfo | URL): string {
  if (typeof entrada === "string") return entrada;
  if (entrada instanceof URL) return entrada.toString();
  return String((entrada as Request)?.url ?? "");
}

function metodoDe(entrada: RequestInfo | URL, init?: RequestInit): string {
  const m = init?.method ?? (entrada as Request)?.method ?? "GET";
  return String(m).toUpperCase();
}

/** Extrai o nome da função a partir da URL `/functions/v1/<nome>`. */
export function nomeFuncaoDaUrl(url: string): string | null {
  const m = /\/functions\/v1\/([^/?#]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

function corpoJson(init?: RequestInit): unknown {
  const body = init?.body;
  if (typeof body !== "string") return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function json(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados ?? null), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Rota do Auth que troca o e-mail do usuário também dispara mensagem real. */
function trocaDeEmail(url: string, metodo: string, init?: RequestInit): boolean {
  if (!url.includes("/auth/v1/user") || metodo !== "PUT") return false;
  const corpo = corpoJson(init) as { email?: unknown } | undefined;
  return !!corpo?.email;
}

/**
 * Decide a resposta local de uma requisição em homologação.
 * Retorna `null` quando a requisição deve seguir para a rede.
 */
export function decidirRespostaHomologacao(
  url: string,
  metodo: string,
  init?: RequestInit,
): Response | null {
  if (ROTAS_AUTH_BLOQUEADAS.some((rota) => url.includes(rota)) || trocaDeEmail(url, metodo, init)) {
    const erro = new AuthEmailBloqueadoError(url);
    return json({ error: erro.name, message: erro.message }, 403);
  }

  const nome = nomeFuncaoDaUrl(url);
  if (!nome) return null;

  if (funcaoMockadaEmHomologacao(nome)) {
    const mock = respostaMockada(nome, corpoJson(init));
    if (mock?.error) {
      return json({ error: "FixtureInvalida", message: String((mock.error as Error).message) }, 400);
    }
    return json(mock?.data ?? null);
  }

  if (funcaoBloqueadaEmHomologacao(nome)) {
    const erro = new FuncaoBloqueadaError(nome);
    return json({ error: erro.name, message: erro.message }, 403);
  }

  return null;
}

/**
 * Instala a guarda no `fetch` do escopo informado. Idempotente.
 * Retorna `true` quando a guarda ficou ativa.
 */
export function instalarFetchGuardHomologacao(
  escopo: EscopoComFetch = globalThis as EscopoComFetch,
  ativo = isHomologacao(),
): boolean {
  if (!ativo) return false;
  if (escopo[MARCA]) return true;
  const original = escopo.fetch;
  if (typeof original !== "function") return false;

  const originalLigado = original.bind(escopo as unknown as typeof globalThis);

  escopo.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = urlDe(entrada);
    const local = decidirRespostaHomologacao(url, metodoDe(entrada, init), init);
    if (local) return local;
    return originalLigado(entrada as RequestInfo, init);
  }) as typeof fetch;

  escopo[MARCA] = true;
  return true;
}
