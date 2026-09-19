// Testes do servidor: a regra de senha nova recusa ANTES de qualquer mudança de
// credencial ou de token. Nenhuma senha real, nenhuma chamada externa.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { avaliarSenha, SENHA_MAX_BYTES, SENHA_MIN } from "./password-policy.ts";

Deno.test("mínimo de 12 e limite de 72 bytes", () => {
  assertEquals(SENHA_MIN, 12);
  assertEquals(SENHA_MAX_BYTES, 72);
  assert(!avaliarSenha("Ale!2026aB1").valida); // 11 caracteres
  assert(avaliarSenha("Trilha#Verde42x").valida);
  assert(!avaliarSenha("Aa1!" + "ç".repeat(40)).valida); // acima de 72 bytes
});

Deno.test("quatro classes continuam obrigatórias", () => {
  for (const senha of [
    "trilhaverde42x!",
    "TRILHAVERDE42X!",
    "TrilhaVerdeXyz!",
    "TrilhaVerde42x",
  ]) {
    assert(!avaliarSenha(senha).valida, senha);
  }
});

Deno.test("senhas comuns e padrões óbvios são recusados", () => {
  for (const senha of ["Senha123456!aA", "P@ssw0rd!2026X", "Abcdefgh!1Zxy", "Traaaaaz!1Bcz"]) {
    assert(!avaliarSenha(senha).valida, senha);
  }
});

Deno.test("as duas funções de senha recusam antes de mudar credencial ou token", async () => {
  const dp = await Deno.readTextFile(
    new URL("../dp-alterar-senha-colaborador/index.ts", import.meta.url),
  );
  const rec = await Deno.readTextFile(
    new URL("../auth-recovery-reset/index.ts", import.meta.url),
  );

  // A checagem da senha aparece antes de reservar token / atualizar a conta.
  assert(dp.indexOf("senhaForte(novaSenha)") < dp.indexOf("reservarToken"));
  assert(dp.indexOf("senhaForte(novaSenha)") < dp.indexOf("updateUserById"));
  assert(rec.indexOf("isStrongPassword(body.new_password)") < rec.indexOf("updateUserById"));

  // Nenhuma das duas guarda regra própria divergente.
  for (const src of [dp, rec]) {
    assert(src.includes('from "../_shared/password-policy.ts"'));
    assert(!/length >= 8|pw\.length < 12/.test(src));
  }

  // E nenhuma registra a senha em log.
  for (const src of [dp, rec]) {
    assert(!/console\.(log|error|warn)\([^)]*(nova_senha|novaSenha|new_password)/.test(src));
  }
});
