import { describe, it, expect } from "vitest";
import {
  criarResultado,
  idsRemanescentes,
  resumoConfirmacao,
  totalFalhas,
} from "@/lib/conciliacao/confirmResultado";

describe("resultado da confirmação na conciliação", () => {
  it("sem itens não anuncia nada", () => {
    const r = criarResultado();
    expect(resumoConfirmacao([], r).tipo).toBe("vazio");
    expect(resumoConfirmacao([], r).ofereceExtrato).toBe(false);
  });

  it("sucesso apenas quando tudo o que foi pedido confirmou", () => {
    const r = criarResultado();
    r.confirmados.push("a", "b");
    const resumo = resumoConfirmacao(["a", "b"], r);
    expect(resumo.tipo).toBe("sucesso");
    expect(resumo.titulo).toBe("2 lançamentos confirmados");
    expect(resumo.ofereceExtrato).toBe(true);
    expect(idsRemanescentes(["a", "b"], r)).toEqual([]);
  });

  it("falha parcial nunca vira concluído e mantém o que sobrou", () => {
    const r = criarResultado();
    r.confirmados.push("a");
    r.falhas.push({ ids: ["b"], motivo: "erro_rpc", detalhe: "account_forbidden" });
    const resumo = resumoConfirmacao(["a", "b"], r);
    expect(resumo.tipo).toBe("parcial");
    expect(resumo.ofereceExtrato).toBe(false);
    expect(resumo.titulo).toContain("1 pendente");
    expect(resumo.descricao).toContain("account_forbidden");
    expect(idsRemanescentes(["a", "b"], r)).toEqual(["b"]);
    expect(totalFalhas(r)).toBe(1);
  });

  it("bloqueio de cartão não autorizado é erro, não sucesso", () => {
    const r = criarResultado();
    r.falhas.push({ ids: ["x", "y"], motivo: "cartao_nao_autorizado" });
    const resumo = resumoConfirmacao(["x", "y"], r);
    expect(resumo.tipo).toBe("erro");
    expect(resumo.descricao).toContain("Cartões de Crédito");
    expect(idsRemanescentes(["x", "y"], r)).toEqual(["x", "y"]);
  });

  it("item que a RPC não devolveu conta como pendente mesmo sem erro", () => {
    const r = criarResultado();
    r.confirmados.push("a");
    const resumo = resumoConfirmacao(["a", "b", "c"], r);
    expect(resumo.tipo).toBe("parcial");
    expect(resumo.titulo).toBe("1 confirmado(s), 2 pendente(s)");
  });

  it("espelho de transferência aparece na descrição do sucesso", () => {
    const r = criarResultado();
    r.confirmados.push("a");
    r.espelhos = 1;
    const resumo = resumoConfirmacao(["a"], r);
    expect(resumo.tipo).toBe("sucesso");
    expect(resumo.descricao).toContain("duplicada");
  });
});
