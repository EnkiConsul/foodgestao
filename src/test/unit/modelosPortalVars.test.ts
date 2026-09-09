import { describe, expect, it } from "vitest";
import { applyModeloVars } from "@/hooks/useDpModelosMensagem";

const ctx = {
  nome: "LUIZ",
  empresa: "PAKERÊ GARAVELO",
  link: "https://aveto360.com/dp/meu",
  usuario: "123.456.789-00",
  senha: "abc123",
};

describe("applyModeloVars", () => {
  it("resolve rótulos amigáveis com chave simples", () => {
    const out = applyModeloVars(
      "Oii {Nome do Colaborador}! Portal {Nome da Empresa}: {Link do Portal} — {Usuário} / {Senha}",
      ctx,
    );
    expect(out).toBe("Oii LUIZ! Portal PAKERÊ GARAVELO: https://aveto360.com/dp/meu — 123.456.789-00 / abc123");
  });

  it("mantém compatibilidade com chave dupla", () => {
    expect(applyModeloVars("Olá {{nome}}, senha {{senha}}", ctx)).toBe("Olá LUIZ, senha abc123");
  });

  it("aceita sinônimos e ignora acento/caixa", () => {
    expect(applyModeloVars("{SENHA PROVISORIA} {cpf} {portal}", ctx)).toBe(
      "abc123 123.456.789-00 https://aveto360.com/dp/meu",
    );
  });

  it("mantém variável desconhecida literal", () => {
    expect(applyModeloVars("{Data de Pagamento} {nome}", ctx)).toBe("{Data de Pagamento} LUIZ");
  });
});
