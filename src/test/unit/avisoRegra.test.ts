import { describe, expect, it } from "vitest";
import { avisoDeRegra } from "@/lib/avisoRegra";
import { erroTroca } from "@/lib/dp/trocas-erros";
import { ehRegraNegada } from "@/lib/dp/regraAviso";

describe("avisos de regra fora da auditoria de erros", () => {
  it("trava de franquia vira aviso para o gestor", () => {
    expect(avisoDeRegra(new Error("EXCEDENTE_CONFIRMACAO_NECESSARIA"))).toMatch(/franquia de colaboradores/);
    expect(avisoDeRegra({ message: "EXCEDENTE_SEM_PERMISSAO" })).toMatch(/Só o dono ou um administrador/);
  });

  it("troca duplicada do servidor vira aviso de regra", () => {
    const e = erroTroca("DUPLICATE_REQUEST: já existe");
    expect(ehRegraNegada(e)).toBe(true);
    expect(e.message).toBe("Já existe uma troca pendente ou aprovada envolvendo essas pessoas e datas. Confira o histórico.");
    expect(avisoDeRegra(e)).toBe(e.message);
  });

  it("falha sem token continua sendo falha do sistema", () => {
    expect(ehRegraNegada(erroTroca("relation dp_trocas does not exist"))).toBe(false);
    expect(avisoDeRegra(new Error("record new has no field \"x\""))).toBeNull();
    expect(avisoDeRegra(new Error("A chave Pix aceita é CPF ou celular do próprio colaborador."))).toBeNull();
  });
});
