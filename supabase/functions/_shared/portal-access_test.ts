import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  confirmarToken,
  gerarCodigo,
  hashCodigo,
  liberarToken,
  linkDeAcesso,
  reservarToken,
} from "./portal-access.ts";

Deno.test("código não usa caracteres ambíguos e não repete", () => {
  const a = gerarCodigo();
  const b = gerarCodigo();
  assertEquals(a.length, 24);
  assert(/^[A-HJ-NP-Z2-9]+$/.test(a), a);
  assertNotEquals(a, b);
});

Deno.test("hash é determinístico por usuário e não contém o código", async () => {
  const h1 = await hashCodigo("u1", "ABCD2345");
  const h2 = await hashCodigo("u1", "ABCD2345");
  const h3 = await hashCodigo("u2", "ABCD2345");
  assertEquals(h1, h2);
  assertNotEquals(h1, h3);
  assertEquals(h1.length, 64);
  assert(!h1.includes("ABCD2345"));
});

Deno.test("link sempre usa o endereço oficial (exceto máquina local)", () => {
  assertEquals(
    linkDeAcesso("https://aveto360.com", "activation", "11111111-1111-4111-8111-111111111111", "AB"),
    "https://aveto360.com/ativar-acesso?t=11111111-1111-4111-8111-111111111111&c=AB",
  );
  assertEquals(
    linkDeAcesso("https://evil.example.com", "reset", "11111111-1111-4111-8111-111111111111", "AB"),
    "https://aveto360.com/redefinir-acesso?t=11111111-1111-4111-8111-111111111111&c=AB",
  );
  // Preview do Lovable não vira link do colaborador.
  assertEquals(
    linkDeAcesso(
      "https://id-preview--abc.lovable.app",
      "activation",
      "11111111-1111-4111-8111-111111111111",
      "AB",
    ),
    "https://aveto360.com/ativar-acesso?t=11111111-1111-4111-8111-111111111111&c=AB",
  );
  assertEquals(
    linkDeAcesso("http://localhost:8080", "reset", "11111111-1111-4111-8111-111111111111", "AB"),
    "http://localhost:8080/redefinir-acesso?t=11111111-1111-4111-8111-111111111111&c=AB",
  );
});

/* ------------------------------------------------------------------------- */
/* Banco de mentira: só o suficiente para exercitar reserva/confirmação      */
/* ------------------------------------------------------------------------- */

const TOKEN_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

interface Linha {
  id: string;
  user_id: string;
  colaborador_id: string;
  company_id: string;
  purpose: string;
  token_hash: string;
  expires_at: string;
  consumed_at: string | null;
  claim_expires_at: string | null;
}

function fakeAdmin(linha: Linha) {
  const chamadas: string[] = [];
  const client = {
    chamadas,
    linha,
    from(_tabela: string) {
      return {
        select(_cols: string) {
          return {
            eq(_c: string, valor: string) {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: valor === linha.id ? { user_id: linha.user_id } : null,
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
    rpc(nome: string, args: Record<string, unknown>) {
      chamadas.push(nome);
      const agora = new Date();
      if (nome === "dp_portal_token_claim") {
        const reservado = linha.claim_expires_at !== null &&
          new Date(linha.claim_expires_at) > agora;
        const ok = args.p_token_id === linha.id &&
          args.p_token_hash === linha.token_hash &&
          args.p_purpose === linha.purpose &&
          linha.consumed_at === null &&
          new Date(linha.expires_at) > agora &&
          !reservado;
        if (!ok) return Promise.resolve({ data: [], error: null });
        linha.claim_expires_at = new Date(agora.getTime() + 120_000).toISOString();
        return Promise.resolve({
          data: [{
            user_id: linha.user_id,
            colaborador_id: linha.colaborador_id,
            company_id: linha.company_id,
            purpose: linha.purpose,
          }],
          error: null,
        });
      }
      if (nome === "dp_portal_token_confirm") {
        linha.consumed_at = agora.toISOString();
        return Promise.resolve({ data: true, error: null });
      }
      if (nome === "dp_portal_token_release") {
        linha.claim_expires_at = null;
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  // deno-lint-ignore no-explicit-any
  return client as any;
}

async function linhaValida(purpose: "activation" | "reset", codigo: string): Promise<Linha> {
  return {
    id: TOKEN_ID,
    user_id: USER_ID,
    colaborador_id: "44444444-4444-4444-8444-444444444444",
    company_id: "55555555-5555-4555-8555-555555555555",
    purpose,
    token_hash: await hashCodigo(USER_ID, codigo),
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    consumed_at: null,
    claim_expires_at: null,
  };
}

Deno.test("reserva devolve a identidade do próprio registro do código", async () => {
  const admin = fakeAdmin(await linhaValida("activation", "ABCD2345"));
  const token = await reservarToken(admin, TOKEN_ID, "ABCD2345", "activation");
  assertEquals(token?.user_id, USER_ID);
  assertEquals(token?.purpose, "activation");
});

Deno.test("código de ativação não vale como redefinição (e vice-versa)", async () => {
  const a = fakeAdmin(await linhaValida("activation", "ABCD2345"));
  assertEquals(await reservarToken(a, TOKEN_ID, "ABCD2345", "reset"), null);
  const r = fakeAdmin(await linhaValida("reset", "ABCD2345"));
  assertEquals(await reservarToken(r, TOKEN_ID, "ABCD2345", "activation"), null);
});

Deno.test("código errado, expirado ou já usado não reserva", async () => {
  const errado = fakeAdmin(await linhaValida("activation", "ABCD2345"));
  assertEquals(await reservarToken(errado, TOKEN_ID, "ZZZZ9999", "activation"), null);

  const expirado = fakeAdmin(await linhaValida("activation", "ABCD2345"));
  expirado.linha.expires_at = new Date(Date.now() - 1_000).toISOString();
  assertEquals(await reservarToken(expirado, TOKEN_ID, "ABCD2345", "activation"), null);

  const usado = fakeAdmin(await linhaValida("activation", "ABCD2345"));
  usado.linha.consumed_at = new Date().toISOString();
  assertEquals(await reservarToken(usado, TOKEN_ID, "ABCD2345", "activation"), null);
});

Deno.test("dois pedidos simultâneos não usam o mesmo código", async () => {
  const admin = fakeAdmin(await linhaValida("activation", "ABCD2345"));
  const [a, b] = await Promise.all([
    reservarToken(admin, TOKEN_ID, "ABCD2345", "activation"),
    reservarToken(admin, TOKEN_ID, "ABCD2345", "activation"),
  ]);
  assertEquals([a, b].filter(Boolean).length, 1);
});

Deno.test("falha na troca de senha não inutiliza o código", async () => {
  const admin = fakeAdmin(await linhaValida("activation", "ABCD2345"));
  const primeiro = await reservarToken(admin, TOKEN_ID, "ABCD2345", "activation");
  assert(primeiro);
  // Simula falha ao salvar a senha: a reserva é liberada.
  await liberarToken(admin, primeiro!.id);
  const segundo = await reservarToken(admin, TOKEN_ID, "ABCD2345", "activation");
  assert(segundo, "o colaborador deve conseguir tentar de novo com o mesmo link");
  // Depois do sucesso, o código morre.
  await confirmarToken(admin, segundo!.id);
  assertEquals(await reservarToken(admin, TOKEN_ID, "ABCD2345", "activation"), null);
});

Deno.test("identificador de código inválido nem consulta o banco", async () => {
  const admin = fakeAdmin(await linhaValida("activation", "ABCD2345"));
  assertEquals(await reservarToken(admin, "nao-e-uuid", "ABCD2345", "activation"), null);
  assertEquals(admin.chamadas.length, 0);
});
