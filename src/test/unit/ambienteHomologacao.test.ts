/**
 * Guard de ambiente (fail-closed) + consultas simuladas de homologação.
 *
 * Cobre: produção preservada, flag ausente/inválida, banco trocado, recusa de
 * chave secreta/service_role, allowlist com negação padrão, bloqueio de e-mails
 * nativos do Auth, mocks sem rede e trava dos E2E pelo marcador do build.
 */
import { describe, it, expect, vi } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolverAmbiente,
  validarChavePublica,
  REF_PRODUCAO,
  REF_HOMOLOGACAO,
  URL_PRODUCAO,
  URL_HOMOLOGACAO,
} from "@/lib/env/appEnv";
import {
  funcaoBloqueadaEmHomologacao,
  funcaoPermitidaEmHomologacao,
  respostaMockada,
  instalarGuardasHomologacao,
  FuncaoBloqueadaError,
  AuthEmailBloqueadoError,
  CNPJ_FIXTURE_REGISTRADO,
} from "@/lib/env/homologacaoRuntime";
import {
  instalarFetchGuardHomologacao,
  nomeFuncaoDaUrl,
} from "@/lib/env/homologacaoFetchGuard";


import { cnpjFixture, cepFixture } from "@/lib/env/homologacaoFixtures";

/** Monta um JWT de teste (sem assinatura real — só conteúdo legível). */
function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.assinatura_de_teste`;
}

const CHAVE_PROD = jwt({ iss: "supabase", ref: REF_PRODUCAO, role: "anon" });
const CHAVE_HOM = jwt({ iss: "supabase", ref: REF_HOMOLOGACAO, role: "anon" });

const prod = {
  VITE_APP_ENV: "",
  VITE_SUPABASE_URL: URL_PRODUCAO,
  VITE_SUPABASE_PUBLISHABLE_KEY: CHAVE_PROD,
  VITE_SUPABASE_PROJECT_ID: REF_PRODUCAO,
};
const hom = {
  VITE_APP_ENV: "homologacao",
  VITE_SUPABASE_URL: URL_HOMOLOGACAO,
  VITE_SUPABASE_PUBLISHABLE_KEY: CHAVE_HOM,
  VITE_SUPABASE_PROJECT_ID: REF_HOMOLOGACAO,
};

describe("resolverAmbiente — fail-closed", () => {
  it("preserva produção quando a flag está ausente", () => {
    expect(resolverAmbiente(prod)).toEqual({ ok: true, ambiente: "producao" });
  });

  it("aceita homologação só com a URL exata do banco de homologação", () => {
    expect(resolverAmbiente(hom)).toEqual({ ok: true, ambiente: "homologacao" });
  });

  it("recusa build de homologação apontando para produção (sem fallback)", () => {
    const r = resolverAmbiente({
      ...hom,
      VITE_SUPABASE_URL: URL_PRODUCAO,
      VITE_SUPABASE_PUBLISHABLE_KEY: CHAVE_PROD,
      VITE_SUPABASE_PROJECT_ID: REF_PRODUCAO,
    });
    expect(r).toMatchObject({ ok: false, motivo: "homologacao_com_banco_errado" });
  });

  it("recusa banco de homologação sem a flag (flag ausente)", () => {
    const r = resolverAmbiente({
      ...prod,
      VITE_SUPABASE_URL: URL_HOMOLOGACAO,
      VITE_SUPABASE_PUBLISHABLE_KEY: CHAVE_HOM,
      VITE_SUPABASE_PROJECT_ID: REF_HOMOLOGACAO,
    });
    expect(r).toMatchObject({ ok: false, motivo: "producao_com_banco_homologacao" });
  });

  it("recusa flag inválida", () => {
    expect(resolverAmbiente({ ...hom, VITE_APP_ENV: "staging" })).toMatchObject({
      ok: false,
      motivo: "flag_invalida",
    });
  });

  it("recusa URL ausente, URL fora de padrão e chave inválida", () => {
    expect(resolverAmbiente({ ...hom, VITE_SUPABASE_URL: "" })).toMatchObject({ motivo: "url_ausente" });
    expect(resolverAmbiente({ ...hom, VITE_SUPABASE_URL: "http://localhost:54321" })).toMatchObject({
      motivo: "url_invalida",
    });
    expect(resolverAmbiente({ ...hom, VITE_SUPABASE_PUBLISHABLE_KEY: "chave-curta" })).toMatchObject({
      motivo: "chave_publica_invalida",
    });
  });

  it("recusa project id divergente da URL e banco desconhecido", () => {
    expect(resolverAmbiente({ ...hom, VITE_SUPABASE_PROJECT_ID: REF_PRODUCAO })).toMatchObject({
      motivo: "project_id_divergente",
    });
    const refFalso = "z".repeat(20);
    expect(
      resolverAmbiente({
        ...prod,
        VITE_SUPABASE_URL: `https://${refFalso}.supabase.co`,
        VITE_SUPABASE_PUBLISHABLE_KEY: jwt({ ref: refFalso, role: "anon" }),
        VITE_SUPABASE_PROJECT_ID: refFalso,
      }),
    ).toMatchObject({ motivo: "banco_desconhecido" });
  });
});

describe("validação da chave publicável", () => {
  it("recusa chave secreta moderna (sb_secret_)", () => {
    const r = validarChavePublica(`sb_secret_${"x".repeat(40)}`, REF_HOMOLOGACAO);
    expect(r).toMatchObject({ ok: false, motivo: "chave_nao_publicavel" });
    expect(resolverAmbiente({ ...hom, VITE_SUPABASE_PUBLISHABLE_KEY: `sb_secret_${"x".repeat(40)}` })).toMatchObject({
      ok: false,
      motivo: "chave_nao_publicavel",
    });
  });

  it("recusa qualquer sb_ que não seja sb_publishable_ e aceita a publicável", () => {
    expect(validarChavePublica(`sb_anon_${"x".repeat(40)}`, REF_HOMOLOGACAO)).toMatchObject({
      ok: false,
      motivo: "chave_nao_publicavel",
    });
    expect(validarChavePublica(`sb_publishable_${"x".repeat(40)}`, REF_HOMOLOGACAO)).toEqual({ ok: true });
  });

  it("recusa JWT de service_role mesmo com ref correto", () => {
    const chave = jwt({ ref: REF_HOMOLOGACAO, role: "service_role" });
    expect(validarChavePublica(chave, REF_HOMOLOGACAO)).toMatchObject({
      ok: false,
      motivo: "chave_nao_publicavel",
    });
    expect(resolverAmbiente({ ...hom, VITE_SUPABASE_PUBLISHABLE_KEY: chave })).toMatchObject({
      ok: false,
      motivo: "chave_nao_publicavel",
    });
  });

  it("recusa JWT anon de outro projeto (ref diferente da URL)", () => {
    expect(validarChavePublica(CHAVE_PROD, REF_HOMOLOGACAO)).toMatchObject({
      ok: false,
      motivo: "chave_de_outro_projeto",
    });
    expect(resolverAmbiente({ ...hom, VITE_SUPABASE_PUBLISHABLE_KEY: CHAVE_PROD })).toMatchObject({
      ok: false,
      motivo: "chave_de_outro_projeto",
    });
  });

  it("recusa JWT malformado ou com conteúdo ilegível", () => {
    expect(validarChavePublica("eyJabc", REF_HOMOLOGACAO)).toMatchObject({ ok: false });
    expect(validarChavePublica("eyJa.@@@.z", REF_HOMOLOGACAO)).toMatchObject({ ok: false });
  });
});

describe("guardas de homologação", () => {
  it("bloqueia pagamentos, Open Finance, e-mail/mensagens, IA e convites", () => {
    for (const nome of [
      "asaas-create-checkout",
      "asaas-refresh-pix",
      "pluggy-sync-item",
      "pluggy-webhook-config",
      "dp-send-broadcast",
      "admin-resend-confirmation",
      "auth-recovery-request",
      "ai-categorize-transactions",
      "inspect-search-console",
      "generate-category-ai-description",
      "dp-preadmissao-convite",
      "send-company-invite",
      "dp-criar-acesso-colaborador",
    ]) {
      expect(funcaoBloqueadaEmHomologacao(nome)).toBe(true);
    }
  });

  it("nega por padrão nomes desconhecidos, inclusive vazio", () => {
    expect(funcaoBloqueadaEmHomologacao("funcao-que-ninguem-aprovou")).toBe(true);
    expect(funcaoBloqueadaEmHomologacao("")).toBe(true);
    expect(funcaoPermitidaEmHomologacao("funcao-que-ninguem-aprovou")).toBe(false);
  });

  it("libera apenas as funções internas aprovadas", () => {
    for (const nome of ["dp-refresh-pendencias", "dp-sorteio-folgas", "auth-config"]) {
      expect(funcaoBloqueadaEmHomologacao(nome)).toBe(false);
      expect(funcaoPermitidaEmHomologacao(nome)).toBe(true);
    }
  });

  it("responde CNPJ e disponibilidade por fixture determinística, sem rede", () => {
    const a = respostaMockada("lookup-cnpj", { cnpj: "58.241.366/0001-32" });
    const b = respostaMockada("lookup-cnpj", { cnpj: "58241366000132" });
    expect(a?.error).toBeNull();
    expect(a?.data).toEqual(b?.data);
    expect((a?.data as { razao_social: string }).razao_social).toContain("HOMOLOGACAO");

    expect(respostaMockada("check-onboarding-cnpj", { cnpj: "58241366000132" })?.data).toEqual({
      status: "available",
    });
    expect(respostaMockada("check-onboarding-cnpj", { cnpj: CNPJ_FIXTURE_REGISTRADO })?.data).toEqual({
      status: "registered",
    });
  });

  it("CEP simulado é estável e não consulta provedor", () => {
    const fetchSpy = vi.fn();
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      expect(cepFixture("74000000")).toEqual(cepFixture("74000000"));
      expect(cepFixture("00099999")).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });

  it("identifica a função pela URL do endpoint e classifica o erro de bloqueio", () => {
    expect(nomeFuncaoDaUrl(`${URL_HOMOLOGACAO}/functions/v1/lookup-cnpj`)).toBe("lookup-cnpj");
    expect(nomeFuncaoDaUrl(`${URL_HOMOLOGACAO}/rest/v1/categories?select=*`)).toBeNull();
    expect(new FuncaoBloqueadaError("asaas-create-checkout")).toBeInstanceOf(Error);
  });


  it("bloqueia no TRANSPORTE com o cliente real do SDK: zero rede em duas chamadas separadas", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));

    // Escopo isolado: a guarda embrulha o fetch entregue ao SDK, antes do cliente existir.
    const escopo: { fetch: typeof fetch } = { fetch: fetchSpy as unknown as typeof fetch };
    expect(instalarFetchGuardHomologacao(escopo, true)).toBe(true);
    expect(instalarFetchGuardHomologacao(escopo, true)).toBe(true); // idempotente

    const cliente = createClient(URL_HOMOLOGACAO, CHAVE_HOM, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: escopo.fetch },
    });

    // Cada acesso a `cliente.functions` cria um FunctionsClient NOVO no SDK real:
    // por isso as duas chamadas abaixo são acessos separados ao getter.
    const mock = await cliente.functions.invoke("lookup-cnpj", {
      body: { cnpj: CNPJ_FIXTURE_REGISTRADO },
    });
    expect(mock.error).toBeNull();
    expect((mock.data as { cnpj: string }).cnpj).toBe(CNPJ_FIXTURE_REGISTRADO);

    const desconhecida = await cliente.functions.invoke("funcao-que-ninguem-aprovou", { body: {} });
    expect(desconhecida.error).toBeTruthy();
    expect(desconhecida.data).toBeNull();

    // Prova central: nenhuma das duas operações chegou à rede.
    expect(fetchSpy).not.toHaveBeenCalled();

    // Função aprovada segue para o transporte (uma única chamada de rede).
    await cliente.functions.invoke("dp-refresh-pendencias", { body: {} });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("não toca no fetch quando o build é de produção", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    const escopo: { fetch: typeof fetch } = { fetch: fetchSpy as unknown as typeof fetch };
    expect(instalarFetchGuardHomologacao(escopo, false)).toBe(false);
    expect(escopo.fetch).toBe(fetchSpy);

    const { createClient } = await import("@supabase/supabase-js");
    const cliente = createClient(URL_PRODUCAO, CHAVE_PROD, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: escopo.fetch },
    });
    await cliente.functions.invoke("asaas-create-checkout", { body: {} });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("nega endpoints nativos de e-mail do Auth no transporte, mantendo login por senha", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    const escopo: { fetch: typeof fetch } = { fetch: fetchSpy as unknown as typeof fetch };
    instalarFetchGuardHomologacao(escopo, true);

    for (const rota of ["/auth/v1/signup", "/auth/v1/recover", "/auth/v1/resend", "/auth/v1/otp"]) {
      const r = await escopo.fetch(`${URL_HOMOLOGACAO}${rota}`, { method: "POST", body: "{}" });
      expect(r.status).toBe(403);
    }
    const troca = await escopo.fetch(`${URL_HOMOLOGACAO}/auth/v1/user`, {
      method: "PUT",
      body: JSON.stringify({ email: "novo@exemplo-homologacao.test" }),
    });
    expect(troca.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();

    await escopo.fetch(`${URL_HOMOLOGACAO}/auth/v1/token?grant_type=password`, {
      method: "POST",
      body: "{}",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });


  it("bloqueia envio nativo de e-mail do Auth e mantém login por senha", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ data: { session: {} }, error: null });
    const updateUserReal = vi.fn().mockResolvedValue({ data: { user: {} }, error: null });
    const cliente = {
      functions: { invoke: vi.fn() },
      auth: {
        signUp: vi.fn(),
        resend: vi.fn(),
        resetPasswordForEmail: vi.fn(),
        signInWithOtp: vi.fn(),
        signInWithPassword,
        updateUser: updateUserReal,
      },
    };
    instalarGuardasHomologacao(cliente, true);

    for (const metodo of ["signUp", "resend", "resetPasswordForEmail", "signInWithOtp"] as const) {
      const r = await (cliente.auth[metodo] as () => Promise<{ error: unknown }>)();
      expect(r.error).toBeInstanceOf(AuthEmailBloqueadoError);
    }

    const trocaEmail = await cliente.auth.updateUser({ email: "novo@exemplo-homologacao.test" });
    expect(trocaEmail.error).toBeInstanceOf(AuthEmailBloqueadoError);

    const trocaSenha = await cliente.auth.updateUser({ password: "Senha-De-Teste-123456" });
    expect(trocaSenha.error).toBeNull();

    const login = await cliente.auth.signInWithPassword();
    expect(login.error).toBeNull();
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it("fixture de CNPJ nunca devolve dado real e é derivada dos dígitos", () => {
    const f = cnpjFixture("11222333000181");
    expect(f.email).toMatch(/exemplo-homologacao\.test$/);
    expect(f.razao_social).toBe("EMPRESA HOMOLOGACAO 0181 LTDA");
  });
});

describe("trava de destino dos E2E (marcador lido do servidor alvo por HTTP)", () => {
  /**
   * Sobe um servidor HTTP real em OUTRO PROCESSO e serve /build-env.json.
   * Outro processo é obrigatório: o runner é executado com `spawnSync`, que
   * bloqueia o event loop — um servidor no processo de teste não atenderia.
   * A trava tem de julgar o que o SERVIDOR ALVO declara; arquivo local não prova
   * destino nenhum.
   */
  const servir = async (corpo: string | null) => {
    const dir = mkdtempSync(join(tmpdir(), "alvo-e2e-"));
    if (corpo !== null) writeFileSync(join(dir, "build-env.json"), corpo);
    const porta = 31000 + Math.floor(Math.random() * 3000);
    const proc = spawn(process.env.PYTHON || "python3", ["-m", "http.server", String(porta), "--directory", dir, "--bind", "127.0.0.1"], {
      stdio: "ignore",
    });
    const base = `http://127.0.0.1:${porta}`;
    for (let i = 0; i < 60; i++) {
      const r = spawnSync("curl", ["-sS", "-o", process.platform === "win32" ? "NUL" : "/dev/null", "-m", "2", `${base}/`], { encoding: "utf8" });
      if (r.status === 0) break;
      await new Promise((ok) => setTimeout(ok, 100));
    }
    return { base, fechar: () => proc.kill("SIGKILL") };
  };


  const rodar = (base: string, manifestoLocal?: string) =>
    spawnSync("node", ["scripts/run-e2e.mjs"], {
      encoding: "utf8",
      env: {
        ...process.env,
        CI: "",
        E2E_BASE_URL: base,
        ...(manifestoLocal ? { E2E_BUILD_MANIFEST: manifestoLocal } : { E2E_BUILD_MANIFEST: "" }),
      },
    });

  const escrever = (conteudo: unknown) => {
    const dir = mkdtempSync(join(tmpdir(), "marcador-"));
    const arq = join(dir, "build-env.json");
    writeFileSync(arq, JSON.stringify(conteudo));
    return arq;
  };

  const MARCADOR_HOM = {
    app_env: "homologacao",
    supabase_ref: REF_HOMOLOGACAO,
    build_id: "build-hom-1",
    built_at: "2026-01-01T00:00:00.000Z",
  };

  it("recusa host de produção mesmo com marcador local de homologação", () => {
    const r = rodar("https://aveto360.com", escrever(MARCADOR_HOM));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("host de produção recusado");
  });

  it("aborta quando o servidor alvo não expõe o marcador", async () => {
    const s = await servir(null);
    try {
      const r = rodar(s.base);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("não obtido por HTTP");
    } finally {
      s.fechar();
    }
  });

  it("aborta quando o servidor alvo declara outro banco (ref errado)", async () => {
    const s = await servir(
      JSON.stringify({ app_env: "homologacao", supabase_ref: REF_PRODUCAO, build_id: "x" }),
    );
    try {
      const r = rodar(s.base);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("exigido o de homologação");
    } finally {
      s.fechar();
    }
  });

  it("aborta quando o servidor alvo é de produção", async () => {
    const s = await servir(
      JSON.stringify({ app_env: "producao", supabase_ref: REF_PRODUCAO, build_id: "x" }),
    );
    try {
      const r = rodar(s.base);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('app_env="producao"');
    } finally {
      s.fechar();
    }
  });

  it("aborta quando o marcador servido não tem build_id", async () => {
    const s = await servir(
      JSON.stringify({ app_env: "homologacao", supabase_ref: REF_HOMOLOGACAO }),
    );
    try {
      const r = rodar(s.base);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("sem build_id");
    } finally {
      s.fechar();
    }
  });

  it("aborta quando o build servido no alvo não é o build local informado", async () => {
    const s = await servir(JSON.stringify(MARCADOR_HOM));
    try {
      const r = rodar(s.base, escrever({ ...MARCADOR_HOM, build_id: "build-hom-2" }));
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("diferente do servido");
    } finally {
      s.fechar();
    }
  });
});

