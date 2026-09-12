import { describe, expect, it } from "vitest";
import {
  diffDiasISO,
  montarProgramacao,
  programacaoParaCsv,
  programacaoDocumento,
  type MontarProgramacaoOpts,
} from "../ferias-programacao";

const BASE: MontarProgramacaoOpts = {
  razaoSocial: "L S PRODUTOS ALIMENTICIOS LTDA ME",
  cnpj: "06.002.178/0001-58",
  dataBase: "2026-06-25",
  emitidoEm: new Date("2026-06-25T14:36:33"),
  colaboradores: [
    {
      id: "c1",
      nome: "ALESSANDRA MOREIRA DIAS DA COSTA",
      matricula: "138",
      data_admissao: "2025-02-28",
      unidade_id: "u1",
      socio: false,
      desligado: false,
    },
    {
      id: "c2",
      nome: "ERILDSON SOUSA SILVA JUNIOR",
      matricula: "129",
      data_admissao: "2024-10-01",
      unidade_id: "u2",
      socio: false,
      desligado: false,
    },
    {
      id: "c3",
      nome: "SOCIO EXEMPLO",
      matricula: "1",
      data_admissao: "2020-01-01",
      unidade_id: "u1",
      socio: true,
      desligado: false,
    },
    {
      id: "c4",
      nome: "DESLIGADO EXEMPLO",
      matricula: "2",
      data_admissao: "2021-01-01",
      unidade_id: "u1",
      socio: false,
      desligado: true,
    },
  ],
  periodos: [
    {
      id: "p1", colaborador_id: "c1",
      inicio_aquisitivo: "2025-02-28", fim_aquisitivo: "2026-02-27",
      limite_concessivo: "2027-01-29", dias_direito: 30, dias_gozados: 0, dias_saldo: 30,
      dias_vendidos: 0, faltas_injustificadas: 0, status: "disponivel", controle_externo: false,
    },
    {
      id: "p2", colaborador_id: "c1",
      inicio_aquisitivo: "2026-02-28", fim_aquisitivo: "2027-02-27",
      limite_concessivo: "2028-01-29", dias_direito: 30, dias_gozados: 0, dias_saldo: 30,
      dias_vendidos: 0, faltas_injustificadas: null, status: "em_aquisicao", controle_externo: false,
    },
    {
      id: "p3", colaborador_id: "c2",
      inicio_aquisitivo: "2024-10-01", fim_aquisitivo: "2025-09-30",
      limite_concessivo: "2026-09-11", dias_direito: 30, dias_gozados: 10, dias_saldo: 20,
      dias_vendidos: 0, faltas_injustificadas: 0, status: "parcial", controle_externo: false,
    },
    {
      id: "p4", colaborador_id: "c2",
      inicio_aquisitivo: "2025-10-01", fim_aquisitivo: "2026-09-30",
      limite_concessivo: "2027-09-01", dias_direito: 30, dias_gozados: 0, dias_saldo: 30,
      dias_vendidos: 0, faltas_injustificadas: null, status: "em_aquisicao", controle_externo: false,
    },
    {
      id: "p5", colaborador_id: "c3",
      inicio_aquisitivo: "2025-01-01", fim_aquisitivo: "2025-12-31",
      limite_concessivo: "2026-12-01", dias_direito: 30, dias_gozados: 0, dias_saldo: 30,
      dias_vendidos: 0, faltas_injustificadas: null, status: "disponivel", controle_externo: false,
    },
    {
      id: "p6", colaborador_id: "c4",
      inicio_aquisitivo: "2025-01-01", fim_aquisitivo: "2025-12-31",
      limite_concessivo: "2026-12-01", dias_direito: 30, dias_gozados: 0, dias_saldo: 30,
      dias_vendidos: 0, faltas_injustificadas: null, status: "disponivel", controle_externo: false,
    },
  ],
  gozos: [
    {
      colaborador_id: "c2", periodo_id: "p3", data_inicio: "2026-07-01",
      dias: 10, dias_abono: 0, adiantar_13: false, status: "aprovado",
    },
  ],
};

describe("diffDiasISO", () => {
  it("calcula diferença em dias sem fuso", () => {
    expect(diffDiasISO("2026-06-25", "2026-06-25")).toBe(0);
    expect(diffDiasISO("2026-07-25", "2026-06-25")).toBe(30);
    expect(diffDiasISO("2026-05-25", "2026-06-25")).toBe(-31);
  });
});

describe("montarProgramacao", () => {
  it("exclui sócios e desligados por padrão", () => {
    const r = montarProgramacao(BASE);
    const ids = new Set(r.linhas.map((l) => l.colaboradorId));
    expect(ids.has("c3")).toBe(false);
    expect(ids.has("c4")).toBe(false);
    expect(r.totalEmpregados).toBe(2);
  });

  it("inclui desligados quando pedido", () => {
    const r = montarProgramacao({ ...BASE, incluirDesligados: true });
    expect(new Set(r.linhas.map((l) => l.colaboradorId)).has("c4")).toBe(true);
    expect(r.totalEmpregados).toBe(3);
  });

  it("filtra por unidade", () => {
    const r = montarProgramacao({ ...BASE, unidadeId: "u2" });
    expect(new Set(r.linhas.map((l) => l.colaboradorId))).toEqual(new Set(["c2"]));
  });

  it("repete os dados do colaborador em cada período", () => {
    const r = montarProgramacao(BASE);
    const linhasC1 = r.linhas.filter((l) => l.colaboradorId === "c1");
    expect(linhasC1).toHaveLength(2);
    for (const l of linhasC1) {
      expect(l.nome).toBe("ALESSANDRA MOREIRA DIAS DA COSTA");
      expect(l.codigo).toBe("138");
      expect(l.feriasVencidas).toBe(1);
    }
  });

  it("usa a unidade filtrada no cabeçalho e a empresa quando são todas", () => {
    const unidades = [
      { id: "u1", nome: "PAKERÊ GARAVELO", cnpj: "11.111.111/0001-11" },
      { id: "u2", nome: "PAKERÊ T-63", cnpj: "22.222.222/0001-22" },
    ];
    const filtrada = montarProgramacao({ ...BASE, unidades, unidadeId: "u2" });
    expect(filtrada.razaoSocial).toBe("PAKERÊ T-63");
    expect(filtrada.cnpj).toBe("22.222.222/0001-22");
    expect(filtrada.consolidado).toBe(false);

    const todas = montarProgramacao({ ...BASE, unidades, incluirDesligados: true });
    expect(todas.razaoSocial).toBe(BASE.razaoSocial);
    expect(todas.cnpj).toBe(BASE.cnpj);
    expect(todas.consolidado).toBe(true);
  });

  it("mostra gozo programado na linha do período", () => {
    const r = montarProgramacao(BASE);
    const p3 = r.linhas.find((l) => l.colaboradorId === "c2" && l.inicioAquisitivo === "2024-10-01");
    expect(p3?.gozoInicio).toBe("2026-07-01");
    expect(p3?.gozoDias).toBe(10);
    expect(p3?.gozoAdianta13).toBe(false);
  });

  it("sinaliza marcação atrasada quando o prazo não comporta o saldo", () => {
    // p3: limite 11/09/2026, base 25/06/2026 → 78 dias; saldo 20 → cabe.
    // Com saldo 20 e limite em 15 dias, fica atrasado.
    const periodos = BASE.periodos.map((p) =>
      p.id === "p3" ? { ...p, limite_concessivo: "2026-07-10" } : p,
    );
    const r = montarProgramacao({ ...BASE, periodos });
    const p3 = r.linhas.find((l) => l.inicioAquisitivo === "2024-10-01");
    expect(p3?.situacao).toBe("marcacao_atrasada");
  });

  it("sinaliza pagamento em dobro após o prazo legal", () => {
    const periodos = BASE.periodos.map((p) =>
      p.id === "p3" ? { ...p, limite_concessivo: "2026-06-20" } : p,
    );
    const r = montarProgramacao({ ...BASE, periodos });
    const p3 = r.linhas.find((l) => l.inicioAquisitivo === "2024-10-01");
    expect(p3?.situacao).toBe("vencido");
    expect(p3?.diasParaLimite).toBe(-5);
  });

  it("calcula dias de afastamento sobrepostos ao período", () => {
    const r = montarProgramacao({
      ...BASE,
      afastamentos: [
        { colaborador_id: "c2", data_inicio: "2025-03-01", data_fim: "2025-03-10" },
        { colaborador_id: "c2", data_inicio: "2026-01-01", data_fim: "2026-01-05" },
      ],
    });
    const p3 = r.linhas.find((l) => l.inicioAquisitivo === "2024-10-01");
    const p4 = r.linhas.find((l) => l.inicioAquisitivo === "2025-10-01");
    expect(p3?.diasAfastamento).toBe(10);
    expect(p4?.diasAfastamento).toBe(5);
  });
});

describe("saídas", () => {
  it("gera CSV com cabeçalho e total", () => {
    const csv = programacaoParaCsv(montarProgramacao(BASE));
    expect(csv).toContain("Programação de férias");
    expect(csv).toContain("Total de empregados: 2");
    expect(csv).toContain("ALESSANDRA MOREIRA DIAS DA COSTA");
    expect(csv).toContain("Situação");
    expect(csv.split("\n").length).toBeGreaterThan(4);
  });

  it("gera HTML com título, CNPJ e selo de situação", () => {
    const html = programacaoDocumento(montarProgramacao(BASE));
    expect(html).toContain("PROGRAMAÇÃO DE FÉRIAS");
    expect(html).toContain("06.002.178/0001-58");
    expect(html).toContain("Página: 1/1");
    expect(html).toContain("Total de empregados: 2");
    expect(html).toContain("selo");
  });
});
