import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  avaliarSenha,
  medirForca,
  mensagemDoServidorDeContas,
  pedacosPessoais,
  tamanhoEmBytes,
  SENHA_MIN,
  SENHA_MAX_BYTES,
} from "@/lib/security/passwordPolicy";

// Senhas fictícias, nunca de pessoas reais.
const FORTE = "Trilha#Verde42x";

describe("regra única de senha (S3)", () => {
  it("exige 12 caracteres", () => {
    expect(SENHA_MIN).toBe(12);
    const r = avaliarSenha("Ale!2026aB1"); // 11 caracteres, quatro classes
    expect(r.valida).toBe(false);
    expect(r.problemas).toContain("curta");
    expect(r.mensagem).toBe("Use pelo menos 12 caracteres");
  });

  it("aprova senha com 12+ e quatro classes", () => {
    const r = avaliarSenha(FORTE);
    expect(r.valida).toBe(true);
    expect(r.mensagem).toBeNull();
    expect(r.pontuacao).toBeGreaterThanOrEqual(3);
  });

  it("mantém as quatro classes obrigatórias", () => {
    expect(avaliarSenha("trilhaverde42x!").problemas).toContain("sem_maiuscula");
    expect(avaliarSenha("TRILHAVERDE42X!").problemas).toContain("sem_minuscula");
    expect(avaliarSenha("TrilhaVerdeXyz!").problemas).toContain("sem_numero");
    expect(avaliarSenha("TrilhaVerde42x").problemas).toContain("sem_simbolo");
  });

  it("recusa acima do limite do servidor de contas sem truncar", () => {
    expect(SENHA_MAX_BYTES).toBe(72);
    const longa = "Aa1!" + "ç".repeat(40); // 4 + 80 bytes
    expect(tamanhoEmBytes(longa)).toBeGreaterThan(72);
    const r = avaliarSenha(longa);
    expect(r.valida).toBe(false);
    expect(r.problemas).toContain("longa");
    expect(r.mensagem).toContain("72");
  });

  it("bloqueia senhas comuns e padrões óbvios, mesmo com trocas de caractere", () => {
    expect(avaliarSenha("Senha123456!aA").problemas).toContain("comum");
    expect(avaliarSenha("P@ssw0rd!2026X").problemas).toContain("comum");
    expect(avaliarSenha("Aveto360!Forte1").problemas).toContain("comum");
    expect(avaliarSenha("Qwertyuiop!1Az").problemas).toContain("comum");
    expect(avaliarSenha("Abcdefgh!1Zxy").problemas).toContain("sequencial");
    expect(avaliarSenha("Traaaaaz!1Bcz").problemas).toContain("repetida");
  });

  it("bloqueia nome, e-mail e CPF na senha", () => {
    const dados = { nome: "Fulano Ficticio", email: "fulaninho@exemplo.test", cpf: "123.456.789-09" };
    expect(avaliarSenha("Fulano#Verde42", dados).problemas).toContain("dado_pessoal");
    expect(avaliarSenha("Fulaninho#42Vz", dados).problemas).toContain("dado_pessoal");
    expect(avaliarSenha("Verde#12345678909", dados).problemas).toContain("dado_pessoal");
    expect(avaliarSenha(FORTE, dados).valida).toBe(true);
  });

  it("ignora pedaços curtos de dados pessoais", () => {
    expect(pedacosPessoais({ nome: "Ana Li" })).toEqual([]);
  });

  it("medidor dá nota baixa para senha previsível e alta para senha forte", () => {
    expect(medirForca("senha", avaliarSenha("senha").problemas).pontuacao).toBeLessThanOrEqual(1);
    expect(medirForca("", []).rotulo).toBe("Muito fraca");
    const forte = avaliarSenha("Corredor#Azul7291x");
    expect(forte.valida).toBe(true);
    expect(forte.rotulo === "Forte" || forte.rotulo === "Muito forte").toBe(true);
  });

  it("pega sequência numérica mesmo em senha longa e complexa", () => {
    const r = avaliarSenha("Trilha123456#Vx");
    expect(r.problemas).toContain("sequencial");
    expect(r.valida).toBe(false);
    expect(avaliarSenha("Verde#98765Trz").problemas).toContain("sequencial");
  });

  it("espaço ou letra acentuada não contam como símbolo", () => {
    expect(avaliarSenha("Trilha Verde42x").problemas).toContain("sem_simbolo");
    expect(avaliarSenha("TrilhaVerdeçã42").problemas).toContain("sem_simbolo");
    expect(avaliarSenha("Trilha Verde42x#").valida).toBe(true);
  });

  it("mensagem do limite fala em bytes", () => {
    const r = avaliarSenha("Aa1!" + "ç".repeat(40));
    expect(r.mensagem).toContain("72 bytes");
  });

  it("weak genérico não é tratado como vazamento", () => {
    const generico = mensagemDoServidorDeContas("Password is too weak");
    expect(generico).not.toContain("vazamentos");
    expect(generico).toContain("fraca");
    expect(mensagemDoServidorDeContas("password is known to be pwned")).toContain("vazamentos");
  });

  it("mensagem de senha nova fala em 12 caracteres", () => {
    const auth = readFileSync("src/pages/Auth.tsx", "utf8");
    const traducao = auth.slice(auth.indexOf("function translateAuthError"), auth.indexOf("function classifySignupError"));
    expect(traducao).toContain("${SENHA_MIN} caracteres");
    expect(traducao).not.toContain("mínimo 6 caracteres");
  });

  it("os textos das telas falam em 12 e não trazem senha de exemplo", () => {
    for (const arq of [
      "src/pages/Auth.tsx",
      "src/pages/ResetPassword.tsx",
      "src/pages/PrimeiroAcesso.tsx",
      "src/pages/AtivarAcesso.tsx",
      "src/pages/EsqueciSenha.tsx",
    ]) {
      const src = readFileSync(arq, "utf8");
      expect(src).not.toMatch(/Pelo menos 8 caracteres|Mín\. 8 caracteres/);
      expect(src).not.toContain("Ale!2026");
    }
  });

  it("a redefinição por link traduz só erro de senha, sem mascarar link expirado", () => {
    const src = readFileSync("src/pages/ResetPassword.tsx", "utf8");
    expect(src).toContain("ehErroDeSenha");
    expect(src).toContain("mensagemDoServidorDeContas(bruto)");
    expect(src).toMatch(/ehErroDeSenha \? mensagemDoServidorDeContas\(bruto\) : bruto/);
  });

  it("traduz as recusas do serviço de contas", () => {
    expect(mensagemDoServidorDeContas("Password is known to be weak and easy to guess (pwned)")).toContain("vazamentos");
    expect(mensagemDoServidorDeContas("Password should be at least 12 characters")).toContain("12 caracteres");
    expect(mensagemDoServidorDeContas("New password should be different from the old password")).toContain("diferente");
  });

  it("servidor e navegador usam exatamente a mesma regra", () => {
    const front = readFileSync("src/lib/security/passwordPolicy.ts", "utf8");
    const edge = readFileSync("supabase/functions/_shared/password-policy.ts", "utf8");
    expect(edge).toBe(front);
  });

  it("o login não usa esta regra (senha antiga continua válida)", () => {
    const auth = readFileSync("src/pages/Auth.tsx", "utf8");
    const login = auth.slice(auth.indexOf("const loginSchema"), auth.indexOf("const signupSchema"));
    expect(login).toContain('min(6, "Mínimo 6 caracteres")');
    expect(login).not.toContain("avaliarSenha");
    const edgeLogin = readFileSync("supabase/functions/auth-login/index.ts", "utf8");
    expect(edgeLogin).not.toContain("password-policy");
  });

  it("todos os caminhos de definir senha usam a regra compartilhada", () => {
    for (const arq of [
      "src/pages/Auth.tsx",
      "src/pages/ResetPassword.tsx",
      "src/pages/PrimeiroAcesso.tsx",
      "src/pages/AtivarAcesso.tsx",
      "src/pages/EsqueciSenha.tsx",
    ]) {
      expect(readFileSync(arq, "utf8")).toContain("avaliarSenha");
    }
    for (const arq of [
      "supabase/functions/dp-alterar-senha-colaborador/index.ts",
      "supabase/functions/auth-recovery-reset/index.ts",
    ]) {
      const src = readFileSync(arq, "utf8");
      expect(src).toContain('from "../_shared/password-policy.ts"');
      expect(src).not.toMatch(/length >= 8|pw\.length < 12/);
    }
  });
});
