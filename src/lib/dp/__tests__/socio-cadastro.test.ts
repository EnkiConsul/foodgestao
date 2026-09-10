import { describe, expect, it } from "vitest";
import { generoPorNome } from "@/lib/dp/generoPorNome";
import { condicoesDoSocio, condicoesNaUnidade, proLaboreTotal } from "@/lib/dp/socio-unidades";
import { verificarAlertasClt } from "@/lib/dp/clt-alertas";
import { salarioSocioNaUnidade } from "@/lib/dp/cargoSalarios";

describe("generoPorNome", () => {
  it("sugere feminino e masculino por nomes comuns", () => {
    expect(generoPorNome("Rosangela Maria Silva")).toBe("F");
    expect(generoPorNome("Luiz Carlos Souza")).toBe("M");
  });
  it("não arrisca em nomes ambíguos ou desconhecidos", () => {
    expect(generoPorNome("")).toBeNull();
    expect(generoPorNome("Xyzk Qwrt")).toBeNull();
  });
});

describe("sócio em várias unidades", () => {
  const base = { unidade_id: "u1", setor_id: "s1", cargo_id: "c1", pro_labore: 5000 };
  const linhas = [
    { unidade_id: "u2", setor_id: "s2", pro_labore: 3000, ativo: true },
    { unidade_id: "u3", ativo: true },
    { unidade_id: "u4", pro_labore: 1000, ativo: false },
  ];

  it("usa condições próprias da unidade quando existem", () => {
    const c = condicoesNaUnidade("u2", base, linhas);
    expect(c.setor_id).toBe("s2");
    expect(c.pro_labore).toBe(3000);
    expect(c.herdado.setor).toBe(false);
  });

  it("herda da unidade principal quando a linha está em branco", () => {
    const c = condicoesNaUnidade("u3", base, linhas);
    expect(c.setor_id).toBe("s1");
    expect(c.pro_labore).toBe(5000);
    expect(c.herdado.pro_labore).toBe(true);
  });

  it("ignora participações encerradas e soma o pró-labore", () => {
    expect(condicoesDoSocio(base, linhas).map((c) => c.unidade_id)).toEqual(["u1", "u2", "u3"]);
    expect(proLaboreTotal(base, linhas)).toBe(13000);
  });
});

describe("sócio: horário e salário", () => {
  it("não gera pontos de atenção trabalhista para sócio", () => {
    const dias = [{ dow: 1, trabalha: true, entrada: "08:00", saida: "23:00" }] as never;
    expect(verificarAlertasClt({ dias, socio: true } as never)).toEqual([]);
  });

  it("usa a referência da empresa na unidade, sem piso patronal", () => {
    const r = salarioSocioNaUnidade(
      [
        {
          id: "1", cargo_id: "c1", unidade_id: "u1", sindicato_patronal_id: null,
          salario_base: 4200, vigencia_inicio: "2020-01-01", vigencia_fim: null,
        } as never,
      ],
      "u1",
      "2026-01-01",
    );
    expect(r.valor).toBe(4200);
    expect(r.origem).toBe("empresa");
    expect(r.faltaPisoPatronal).toBe(false);
  });
});
