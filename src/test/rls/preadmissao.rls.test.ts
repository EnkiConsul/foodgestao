/**
 * Pré-Admissão — negação real na borda pública (sem sessão) e evidência
 * obrigatória dos cenários com sessão.
 *
 * Regras deste arquivo:
 *  · NUNCA aprovar em silêncio. Sem backend alcançável o teste FALHA por
 *    infraestrutura, a menos que a execução declare `PREADMISSAO_RLS_SKIP=1`;
 *    nesse caso a suíte é marcada como pulada e o motivo é impresso para
 *    constar no relatório da fase.
 *  · Toda recusa é conferida nominalmente (código/estado do erro ou status
 *    HTTP), nunca por "objeto verdadeiro".
 *  · Os cenários que exigem sessão real — gestor A × gestor B, autenticado sem
 *    permissão, candidato A × candidato B e concorrência de duas operações —
 *    rodam em banco isolado (supabase/tests/dp_preadmissao_isolated.test.sql e
 *    dp_preadmissao_conc_*.sql). Aqui a evidência dessa execução é conferida
 *    arquivo por arquivo: se faltar ou tiver reprovado, o teste falha.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY!;

const FORGED_JWT = [
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  "eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiZXhwIjo0MDcwOTA4ODAwfQ",
  "ZmFrZS1zaWduYXR1cmU",
].join(".");

const ID_FICTICIO = "00000000-0000-4000-8000-00000000aaaa";
const TABELAS = [
  "dp_preadmissoes",
  "dp_preadmissao_convites",
  "dp_preadmissao_pessoas",
  "dp_preadmissao_documentos",
  "dp_preadmissao_eventos",
  "dp_requisito_cargos",
  "dp_requisito_unidades",
];

/** Pular exige declaração explícita da execução (fica registrado no relatório). */
const SKIP_DECLARADO = process.env.PREADMISSAO_RLS_SKIP === "1";
const MOTIVO_SKIP =
  "PULADO POR DECLARAÇÃO EXPLÍCITA (PREADMISSAO_RLS_SKIP=1): backend remoto indisponível nesta execução. " +
  "Registrar em docs/preadmissao-relatorio.md — esta suíte NÃO foi executada.";

let falhaInfra: string | null = null;

beforeAll(async () => {
  if (SKIP_DECLARADO) {
    console.warn(`[preadmissao.rls] ${MOTIVO_SKIP}`);
    return;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } });
    if (!res.ok) falhaInfra = `backend respondeu ${res.status} em /auth/v1/health`;
  } catch (e) {
    falhaInfra = `backend inalcançável: ${(e as Error).message}`;
  }
});

/** Falha explícita de infraestrutura — nunca aprovação silenciosa. */
function exigirBackend() {
  if (falhaInfra) {
    throw new Error(
      `INFRAESTRUTURA: ${falhaInfra}. Este cenário NÃO foi validado. ` +
        "Para pular conscientemente, rode com PREADMISSAO_RLS_SKIP=1 e registre no relatório.",
    );
  }
}

const anon = () => createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

async function chamar(fn: string, body: unknown, jwt?: string) {
  return await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      authorization: `Bearer ${jwt ?? ANON_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/** Negação de privilégio de verdade: 42501 / permission denied / RLS. */
function ehNegacao(error: PostgrestError | null): boolean {
  if (!error) return false;
  const alvo = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    alvo.includes("42501") ||
    alvo.includes("permission denied") ||
    alvo.includes("row-level security") ||
    alvo.includes("violates row-level security policy")
  );
}

const suite = SKIP_DECLARADO ? describe.skip : describe;

suite("visitante recebe negação real na Pré-Admissão", () => {
  for (const t of TABELAS) {
    it(`nega leitura de ${t} (privilégio, não lista vazia)`, async () => {
      exigirBackend();
      const { data, error } = await anon().from(t).select("*").limit(1);
      // Sem grant para anon a leitura precisa FALHAR; lista vazia não serve de prova.
      expect(
        ehNegacao(error),
        `esperava negação de privilégio em ${t}; recebido erro=${JSON.stringify(error)} dados=${JSON.stringify(data)}`,
      ).toBe(true);
      expect(data ?? []).toEqual([]);
    });
  }

  it("nega gravação de pré-admissão", async () => {
    exigirBackend();
    const { error } = await anon().from("dp_preadmissoes").insert({
      company_id: ID_FICTICIO,
      candidato_nome: "TESTE VISITANTE",
      whatsapp: "5500000000000",
      trabalho_apos_22h: false,
    });
    expect(ehNegacao(error), `esperava 42501; recebido ${JSON.stringify(error)}`).toBe(true);
  });

  it("nega execução da promoção (privilégio de EXECUTE, não 'não encontrado')", async () => {
    exigirBackend();
    const { error } = await anon().rpc("dp_preadmissao_efetivar", {
      p_preadmissao_id: ID_FICTICIO,
      p_colaborador_id: ID_FICTICIO,
    });
    expect(error, "esperava erro na chamada anônima").toBeTruthy();
    const alvo = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
    // Não pode ser "linha inexistente": a recusa é de privilégio/rota inexistente para anon.
    expect(
      alvo.includes("42501") ||
        alvo.includes("permission denied") ||
        alvo.includes("could not find the function") ||
        alvo.includes("pgrst202"),
      `recusa inesperada: ${JSON.stringify(error)}`,
    ).toBe(true);
  });
});

suite("funções recusam quem não tem sessão válida", () => {
  for (const fn of ["dp-preadmissao-convite", "dp-preadmissao-gestor"]) {
    it(`${fn} recusa sem sessão`, async () => {
      exigirBackend();
      const res = await chamar(fn, { action: "ler", preadmissao_id: ID_FICTICIO, company_id: ID_FICTICIO });
      expect([401, 403]).toContain(res.status);
    });
    it(`${fn} recusa token forjado`, async () => {
      exigirBackend();
      const res = await chamar(fn, { action: "ler", preadmissao_id: ID_FICTICIO }, FORGED_JWT);
      expect([401, 403]).toContain(res.status);
    });
  }

  it("acesso público recusa convite inválido sem revelar detalhes", async () => {
    exigirBackend();
    const res = await chamar("dp-preadmissao-publica", { t: ID_FICTICIO, c: "token-invalido", action: "ler" });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(String(body.error)).toMatch(/link/i);
    expect(JSON.stringify(body)).not.toMatch(/company_id|uuid|sql|policy/i);
  });

  it("envio de documento recusa convite inválido", async () => {
    exigirBackend();
    const res = await chamar("dp-preadmissao-arquivo", {
      action: "upload",
      t: ID_FICTICIO,
      c: "token-invalido",
      requisito_codigo: "identidade",
      mime_type: "image/jpeg",
      content_base64: "AAAA",
    });
    expect(res.status).toBe(403);
  });

  it("link de documento recusa quem não está autenticado", async () => {
    exigirBackend();
    const res = await chamar("dp-preadmissao-arquivo", { action: "url", documento_id: ID_FICTICIO });
    expect([401, 403]).toContain(res.status);
  });
});

/**
 * Evidência dos cenários com sessão real. Não roda a HTTP: confere o relatório
 * da execução em banco isolado, exigindo cada cenário aprovado nominalmente.
 */
describe("evidência dos cenários com sessão (banco isolado)", () => {
  const CAMINHO = resolve(process.cwd(), "docs/security/preadmissao-isolamento.report.json");
  type Relatorio = {
    status_geral?: string;
    testes?: { status?: string; grupos_de_assercoes?: string[]; falhas?: unknown[] }[];
    etapas?: { etapa?: string; status?: string }[];
  };

  const ler = (): Relatorio => {
    try {
      return JSON.parse(readFileSync(CAMINHO, "utf8")) as Relatorio;
    } catch (e) {
      throw new Error(
        `EVIDÊNCIA AUSENTE: ${CAMINHO} não pôde ser lido (${(e as Error).message}). ` +
          "Rode: node scripts/test-p04-isolated.mjs --suite=preadmissao-isolamento " +
          "--tests=supabase/tests/dp_preadmissao_isolated.test.sql " +
          "--conc-setup=supabase/tests/dp_preadmissao_conc_setup.sql " +
          "--conc-call=supabase/tests/dp_preadmissao_conc_call.sql " +
          "--conc-verify=supabase/tests/dp_preadmissao_conc_verify.sql --conc-n=4",
      );
    }
  };

  const CENARIOS: [string, RegExp][] = [
    ["gestor A × gestor B isolados", /^OK P1:/m],
    ["autenticado sem permissão", /^OK P2:/m],
    ["cliente somente leitura", /^OK P3:/m],
    ["exclusão física bloqueada", /^OK P4:/m],
    ["visitante sem acesso", /^OK P5:/m],
    ["candidato A × candidato B", /^OK P6:/m],
    ["promoção negada a quem não pode", /^OK P7:/m],
    ["ficha oficial e CPF exigidos", /^OK P8:/m],
    ["promoção legítima rastreável", /^OK P9:/m],
    ["conclusão idempotente", /^OK P10:/m],
  ];

  it("o relatório da execução isolada existe e foi aprovado", () => {
    const r = ler();
    expect(r.status_geral, "execução isolada não aprovada").toBe("passed");
    expect((r.testes ?? []).every((t) => t.status === "passed")).toBe(true);
    expect((r.testes ?? []).flatMap((t) => t.falhas ?? [])).toEqual([]);
  });

  for (const [nome, marca] of CENARIOS) {
    it(`cenário coberto: ${nome}`, () => {
      const r = ler();
      const grupos = (r.testes ?? []).flatMap((t) => t.grupos_de_assercoes ?? []).join("\n");
      expect(marca.test(grupos), `cenário "${nome}" ausente da evidência`).toBe(true);
    });
  }

  it("concorrência de operações simultâneas comprovada", () => {
    const r = ler();
    const etapas = r.etapas ?? [];
    for (const nome of [
      "concorrencia_preparo",
      "concorrencia_chamadas_simultaneas",
      "concorrencia_verificacao",
    ]) {
      const e = etapas.find((x) => x.etapa === nome);
      expect(e?.status, `etapa ${nome} sem aprovação`).toBe("passed");
    }
  });
});
