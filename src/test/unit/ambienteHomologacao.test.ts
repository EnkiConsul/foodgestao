/**
 * Guard de ambiente (fail-closed) + consultas simuladas de homologação.
 *
 * Cobre: produção preservada, flag ausente/inválida, banco trocado, mocks sem
 * rede e bloqueio das integrações externas.
 */
import { describe, it, expect, vi } from "vitest";
import {
  resolverAmbiente,
  REF_PRODUCAO,
  REF_HOMOLOGACAO,
  URL_PRODUCAO,
  URL_HOMOLOGACAO,
} from "@/lib/env/appEnv";
import {
  funcaoBloqueadaEmHomologacao,
  respostaMockada,
  instalarGuardasHomologacao,
  FuncaoBloqueadaError,
} from "@/lib/env/homologacaoRuntime";
import { cnpjFixture, cepFixture } from "@/lib/env/homologacaoFixtures";

const CHAVE = `eyJ${"a".repeat(60)}`;

const prod = {
  VITE_APP_ENV: "",
  VITE_SUPABASE_URL: URL_PRODUCAO,
  VITE_SUPABASE_PUBLISHABLE_KEY: CHAVE,
  VITE_SUPABASE_PROJECT_ID: REF_PRODUCAO,
};
const hom = {
  VITE_APP_ENV: "homologacao",
  VITE_SUPABASE_URL: URL_HOMOLOGACAO,
  VITE_SUPABASE_PUBLISHABLE_KEY: CHAVE,
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
    const r = resolverAmbiente({ ...hom, VITE_SUPABASE_URL: URL_PRODUCAO, VITE_SUPABASE_PROJECT_ID: REF_PRODUCAO });
    expect(r).toMatchObject({ ok: false, motivo: "homologacao_com_banco_errado" });
  });

  it("recusa banco de homologação sem a flag (flag ausente)", () => {
    const r = resolverAmbiente({ ...prod, VITE_SUPABASE_URL: URL_HOMOLOGACAO, VITE_SUPABASE_PROJECT_ID: REF_HOMOLOGACAO });
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
    expect(
      resolverAmbiente({
        ...prod,
        VITE_SUPABASE_URL: `https://${"z".repeat(20)}.supabase.co`,
        VITE_SUPABASE_PROJECT_ID: "z".repeat(20),
      }),
    ).toMatchObject({ motivo: "banco_desconhecido" });
  });
});

describe("guardas de homologação", () => {
  it("bloqueia pagamentos, Open Finance, e-mail/mensagens e IA", () => {
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
    ]) {
      expect(funcaoBloqueadaEmHomologacao(nome)).toBe(true);
    }
  });

  it("mantém liberadas as funções próprias do cadastro", () => {
    for (const nome of ["check-onboarding-cnpj", "auth-login", "accept-invite", "dp-refresh-pendencias"]) {
      expect(funcaoBloqueadaEmHomologacao(nome)).toBe(false);
    }
  });

  it("responde CNPJ por fixture determinística, sem rede", () => {
    const a = respostaMockada("lookup-cnpj", { cnpj: "58.241.366/0001-32" });
    const b = respostaMockada("lookup-cnpj", { cnpj: "58241366000132" });
    expect(a?.error).toBeNull();
    expect(a?.data).toEqual(b?.data);
    expect((a?.data as { razao_social: string }).razao_social).toContain("HOMOLOGACAO");
    expect(respostaMockada("check-onboarding-cnpj", { cnpj: "58241366000132" })).toBeNull();
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

  it("instala o interceptador só quando o ambiente é homologação", async () => {
    const invokeReal = vi.fn().mockResolvedValue({ data: "real", error: null });
    const clienteProd = { functions: { invoke: invokeReal } };
    expect(instalarGuardasHomologacao(clienteProd, false)).toBe(false);
    await clienteProd.functions.invoke("asaas-create-checkout");
    expect(invokeReal).toHaveBeenCalledTimes(1);

    const invokeHom = vi.fn().mockResolvedValue({ data: "real", error: null });
    const clienteHom = { functions: { invoke: invokeHom } };
    expect(instalarGuardasHomologacao(clienteHom, true)).toBe(true);
    expect(instalarGuardasHomologacao(clienteHom, true)).toBe(true); // idempotente

    const bloqueado = await clienteHom.functions.invoke("asaas-create-checkout");
    expect(bloqueado.error).toBeInstanceOf(FuncaoBloqueadaError);
    expect(bloqueado.data).toBeNull();

    const mock = await clienteHom.functions.invoke("lookup-cnpj", { body: { cnpj: "19131243000197" } });
    expect((mock.data as { cnpj: string }).cnpj).toBe("19131243000197");
    expect(invokeHom).not.toHaveBeenCalled();

    const liberado = await clienteHom.functions.invoke("check-onboarding-cnpj", { body: { cnpj: "1" } });
    expect(liberado.data).toBe("real");
    expect(invokeHom).toHaveBeenCalledTimes(1);
  });

  it("fixture de CNPJ nunca devolve dado real e é derivada dos dígitos", () => {
    const f = cnpjFixture("11222333000181");
    expect(f.email).toMatch(/exemplo-homologacao\.test$/);
    expect(f.razao_social).toBe("EMPRESA HOMOLOGACAO 0181 LTDA");
  });
});
