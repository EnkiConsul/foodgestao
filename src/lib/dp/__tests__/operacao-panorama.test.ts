import { describe, it, expect } from "vitest";
import {
  avaliarDia,
  baselinePorDow,
  contarDia,
  diasDaCompetencia,
  blocosPorFuncionamento,
  horarioMaisUsado,
  type ColaboradorPanorama,
  type PessoaPanorama,
  type PessoaAvulsaPanorama,
} from "@/lib/dp/operacao-panorama";
import type { TurnoResolvido } from "@/lib/dp/config-trabalho";

const turnos: TurnoResolvido[] = [
  { id: "t1", nome: "Manhã", entrada: "08:00", saida: "16:00", intervalo_minutos: 60 },
];

const dias = (trabalhaDows: number[]) =>
  [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, trabalha: trabalhaDows.includes(dow), turno_id: null }));

const fixo = (id: string): ColaboradorPanorama => ({
  id,
  nome: `Fixo ${id}`,
  regime: "clt",
  intermitente: false,
  config: { turno_padrao_id: "t1", folga_variavel: false, folga_fixa_dow: 0, dias: dias([1, 2, 3, 4, 5, 6]) },
});

const intermitente = (id: string): ColaboradorPanorama => ({
  id,
  nome: `Int ${id}`,
  regime: "intermitente",
  intermitente: true,
  config: null,
});

// 2026-08-24 é uma segunda-feira.
const SEGUNDA = "2026-08-24";
const DOMINGO = "2026-08-23";

describe("contarDia", () => {
  const vazio = { convocacoes: [], folgas: [], ausencias: [] };

  it("conta fixo com jornada prevista e folga padrão no domingo", () => {
    const colaboradores = [fixo("a"), fixo("b")];
    const seg = contarDia({ data: SEGUNDA, colaboradores, turnos, ...vazio });
    expect(seg.contagens.fixo).toBe(2);
    expect(seg.trabalhando).toBe(2);
    expect(seg.pessoas[0].entrada).toBe("08:00");
    expect(seg.pessoas[0].carga_prevista_horas).toBe(7);

    const dom = contarDia({ data: DOMINGO, colaboradores, turnos, ...vazio });
    expect(dom.contagens.folga_padrao).toBe(2);
    expect(dom.trabalhando).toBe(0);
  });

  it("separa convocados aceitos de pendentes e ignora intermitente sem convocação", () => {
    const colaboradores = [intermitente("i1"), intermitente("i2"), intermitente("i3")];
    const r = contarDia({
      data: SEGUNDA,
      colaboradores,
      turnos,
      folgas: [],
      ausencias: [],
      convocacoes: [
        { colaborador_id: "i1", data: SEGUNDA, status: "aceita", turno_id: "t1", entrada: "18:00", saida: "23:00" },
        { colaborador_id: "i2", data: SEGUNDA, status: "pendente", turno_id: "t1", entrada: "18:00", saida: "23:00" },
      ],
    });
    expect(r.contagens.convocado_aceito).toBe(1);
    expect(r.contagens.convocado_pendente).toBe(1);
    // Pendente nunca conta como trabalhando: fica apenas em "aguardando".
    expect(r.trabalhando).toBe(1);
    expect(r.aguardando).toBe(1);
    expect(r.pessoas).toHaveLength(2);

  });

  it("prioriza férias, atestado e folga extra sem dupla contagem", () => {
    const colaboradores = [fixo("a"), fixo("b"), fixo("c")];
    const r = contarDia({
      data: SEGUNDA,
      colaboradores,
      turnos,
      convocacoes: [],
      folgas: [{ colaborador_id: "b", data: SEGUNDA, tipo: "extra", extra: true }],
      ausencias: [
        { colaborador_id: "a", inicio: "2026-08-20", fim: "2026-08-30", tipo: "ferias" },
        { colaborador_id: "c", inicio: SEGUNDA, fim: SEGUNDA, tipo: "atestado" },
      ],
    });
    expect(r.contagens).toMatchObject({ ferias: 1, folga_extra: 1, atestado: 1, fixo: 0 });
    expect(r.pessoas).toHaveLength(3);
  });

  it("usa a escala publicada quando existir item para o dia", () => {
    const r = contarDia({
      data: SEGUNDA,
      colaboradores: [fixo("a")],
      turnos,
      convocacoes: [],
      folgas: [],
      ausencias: [],
      itensPublicados: [
        { colaborador_id: "a", data: SEGUNDA, tipo: "folga", turno_id: null, entrada: null, saida: null },
      ],
    });
    expect(r.contagens.folga_padrao).toBe(1);
    expect(r.contagens.fixo).toBe(0);
  });
});

describe("baselinePorDow e avaliarDia", () => {
  it("aprende a mediana por dia da semana ignorando dias sem operação", () => {
    const historico = [
      { data: "2026-08-03", trabalhando: 5 }, // segunda
      { data: "2026-08-10", trabalhando: 6 },
      { data: "2026-08-17", trabalhando: 5 },
      { data: "2026-08-02", trabalhando: 0 }, // domingo fechado
    ];
    const padrao = baselinePorDow(historico, { limite: "2026-08-24" });
    expect(padrao.get(1)).toBe(5);
    expect(padrao.has(0)).toBe(false);
  });

  it("sinaliza abaixo, acima e dentro do padrão com tolerância", () => {
    expect(avaliarDia(5, 5).situacao).toBe("ok");
    expect(avaliarDia(2, 6).situacao).toBe("abaixo");
    expect(avaliarDia(9, 6).situacao).toBe("acima");
    expect(avaliarDia(4, null).situacao).toBe("sem_padrao");
  });
});

describe("diasDaCompetencia", () => {
  it("gera todos os dias do mês", () => {
    expect(diasDaCompetencia("2026-02")).toHaveLength(28);
    expect(diasDaCompetencia("2026-08")[0]).toBe("2026-08-01");
  });
});

describe("sócio na operação", () => {
  const vazio = { convocacoes: [], folgas: [], ausencias: [] };

  const socioComUnidade = (id: string): ColaboradorPanorama => ({
    id,
    nome: `Sócio ${id}`,
    regime: "socio",
    socio: true,
    unidade_id: "u1",
    intermitente: false,
    config: { turno_padrao_id: "t1", folga_variavel: false, folga_fixa_dow: 0, dias: dias([1, 2, 3, 4, 5, 6]) },
  });

  const socioGeral = (id: string): ColaboradorPanorama => ({
    id,
    nome: `Sócio geral ${id}`,
    regime: "socio",
    socio: true,
    unidade_id: null,
    intermitente: false,
    config: null,
  });

  it("sócio com unidade e jornada conta como fixo e como folga padrão no domingo", () => {
    const colaboradores = [socioComUnidade("s1")];
    const seg = contarDia({ data: SEGUNDA, colaboradores, turnos, ...vazio });
    expect(seg.contagens.fixo).toBe(1);
    expect(seg.pessoas[0].socio_integrado).toBe(true);

    const dom = contarDia({ data: DOMINGO, colaboradores, turnos, ...vazio });
    expect(dom.contagens.folga_padrao).toBe(1);
  });

  it("sócio em Geral não entra nas contagens CLT, mas segue listado", () => {
    const colaboradores = [socioGeral("s2")];
    const dom = contarDia({
      data: DOMINGO,
      colaboradores,
      turnos,
      convocacoes: [],
      ausencias: [],
      folgas: [{ colaborador_id: "s2", data: DOMINGO, tipo: "extra", extra: true }],
    });
    expect(dom.contagens.folga_extra).toBe(0);
    expect(dom.pessoas).toHaveLength(1);
    expect(dom.pessoas[0].socio_integrado).toBe(false);
  });

  it("folga extra de sócio com unidade continua fora da contagem de folga extra", () => {
    const r = contarDia({
      data: SEGUNDA,
      colaboradores: [socioComUnidade("s3")],
      turnos,
      convocacoes: [],
      ausencias: [],
      folgas: [{ colaborador_id: "s3", data: SEGUNDA, tipo: "extra", extra: true }],
    });
    expect(r.contagens.folga_extra).toBe(0);
    expect(r.pessoas[0].categoria).toBe("folga_extra");
  });
});

// ---------------------------------------------------------------------------
// Blocos por funcionamento: cada pessoa aparece em um único período do dia.
// ---------------------------------------------------------------------------

const pessoa = (
  id: string,
  entrada: string | null,
  saida: string | null,
  extra: Partial<PessoaPanorama> = {},
): PessoaPanorama => ({
  colaborador_id: id,
  nome: `Pessoa ${id}`,
  categoria: "fixo",
  turno_id: null,
  turno_nome: null,
  entrada,
  saida,
  termina_no_dia_seguinte: false,
  carga_prevista_horas: 8,
  unidade_id: "u1",
  cargo_id: "c1",
  cargo_nome: "Garçom",
  socio: false,
  origem: "jornada",
  ...extra,
});

// 2026-09-07 é uma segunda-feira (dow 1).
const SEGUNDA_BLOCOS = "2026-09-07";

const funcionamentoDoisPeriodos = () =>
  new Map([
    [
      "u1",
      [
        {
          dia_semana: 1,
          aberto: true,
          periodos: [
            { nome: "Dia", hora_abertura: "08:00", hora_fechamento: "17:00" },
            { nome: "Noite", hora_abertura: "17:00", hora_fechamento: "23:00" },
          ],
        },
      ],
    ],
  ]);

describe("blocosPorFuncionamento", () => {
  it("coloca a pessoa apenas no período em que a entrada dela cai", () => {
    const blocos = blocosPorFuncionamento({
      data: SEGUNDA_BLOCOS,
      pessoas: [pessoa("a", "10:00", "19:00")],
      funcionamentoPorUnidade: funcionamentoDoisPeriodos(),
      unidades: [{ id: "u1", nome: "Loja" }],
      unidadeId: "u1",
    });
    const comA = blocos.filter((b) => b.pessoas.some((p) => p.colaborador_id === "a"));
    expect(comA).toHaveLength(1);
    expect(comA[0].titulo).toBe("Dia");
  });

  it("usa a maior sobreposição quando a entrada não cai em nenhum período", () => {
    const blocos = blocosPorFuncionamento({
      data: SEGUNDA_BLOCOS,
      pessoas: [pessoa("b", "06:00", "12:00")],
      funcionamentoPorUnidade: funcionamentoDoisPeriodos(),
      unidades: [{ id: "u1", nome: "Loja" }],
      unidadeId: "u1",
    });
    const comB = blocos.filter((b) => b.pessoas.some((p) => p.colaborador_id === "b"));
    expect(comB).toHaveLength(1);
    expect(comB[0].titulo).toBe("Dia");
  });

  it("coloca quem entra às 17:00 e sai 00:35 no período da noite", () => {
    const blocos = blocosPorFuncionamento({
      data: SEGUNDA_BLOCOS,
      pessoas: [pessoa("n", "17:00", "00:35", { termina_no_dia_seguinte: true })],
      funcionamentoPorUnidade: new Map([
        [
          "u1",
          [
            {
              dia_semana: 1,
              aberto: true,
              periodos: [
                { nome: "Dia", hora_abertura: "08:30", hora_fechamento: "18:30" },
                { nome: "Noite", hora_abertura: "17:00", hora_fechamento: "00:35" },
              ],
            },
          ],
        ],
      ]),
      unidades: [{ id: "u1", nome: "Loja" }],
      unidadeId: "u1",
    });
    const comN = blocos.filter((b) => b.pessoas.some((p) => p.colaborador_id === "n"));
    expect(comN).toHaveLength(1);
    expect(comN[0].titulo).toBe("Noite");
  });


  it("manda para 'Fora do Horário' quem não tem sobreposição alguma", () => {
    const blocos = blocosPorFuncionamento({
      data: SEGUNDA_BLOCOS,
      pessoas: [pessoa("c", "23:30", "23:50")],
      funcionamentoPorUnidade: funcionamentoDoisPeriodos(),
      unidades: [{ id: "u1", nome: "Loja" }],
      unidadeId: "u1",
    });
    const comC = blocos.filter((b) => b.pessoas.some((p) => p.colaborador_id === "c"));
    expect(comC).toHaveLength(1);
    expect(comC[0].titulo).toBe("Fora do Horário de Funcionamento");
  });
});

describe("contarDia com pessoas avulsas", () => {
  const vazio = { convocacoes: [], folgas: [], ausencias: [] };
  const avulsa = (over: Partial<PessoaAvulsaPanorama> = {}): PessoaAvulsaPanorama => ({
    id: "av1",
    nome: "Maria Teste",
    tipo: "teste",
    unidade_id: "u1",
    cargo_id: "c1",
    cargo_nome: "Atendente",
    cobre_nome: null,
    data_inicio: SEGUNDA,
    data_fim: SEGUNDA,
    entrada: "17:00",
    saida: "23:00",
    termina_no_dia_seguinte: false,
    observacao: null,
    ...over,
  });

  it("soma a pessoa avulsa no quadro do dia como fixo", () => {
    const r = contarDia({ data: SEGUNDA, colaboradores: [], turnos, ...vazio, avulsos: [avulsa()] });
    expect(r.contagens.fixo).toBe(1);
    expect(r.trabalhando).toBe(1);
    const p = r.pessoas.find((x) => x.origem === "avulso");
    expect(p?.nome).toBe("Maria Teste");
    expect(p?.entrada).toBe("17:00");
    expect(p?.avulso_id).toBe("av1");
  });

  it("ignora dias fora do período informado", () => {
    const r = contarDia({ data: DOMINGO, colaboradores: [], turnos, ...vazio, avulsos: [avulsa()] });
    expect(r.contagens.fixo).toBe(0);
    expect(r.trabalhando).toBe(0);
  });

  it("mantém a pessoa avulsa em todo o período de vários dias", () => {
    const periodo = [avulsa({ data_inicio: DOMINGO, data_fim: SEGUNDA, tipo: "folguista", cobre_nome: "Sara" })];
    for (const d of [DOMINGO, SEGUNDA]) {
      const r = contarDia({ data: d, colaboradores: [], turnos, ...vazio, avulsos: periodo });
      expect(r.contagens.fixo).toBe(1);
      expect(r.pessoas.find((x) => x.origem === "avulso")?.cobre_nome).toBe("Sara");
    }
  });
});

describe("horarioMaisUsado", () => {
  const dias = (trabalhaDows: number[]) =>
    [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, trabalha: trabalhaDows.includes(dow), turno_id: null }));

  const fixo = (id: string, turno_id: string | null): ColaboradorPanorama => ({
    id,
    nome: `Fixo ${id}`,
    regime: "clt",
    intermitente: false,
    unidade_id: "u1",
    cargo_id: "c1",
    cargo_nome: "Atendente",
    config: { turno_padrao_id: turno_id, folga_variavel: false, folga_fixa_dow: 0, dias: dias([1, 2, 3, 4, 5, 6]) },
  });

  const turnos: TurnoResolvido[] = [
    { id: "t1", nome: "Manhã", entrada: "08:00", saida: "16:00", intervalo_minutos: 60 },
    { id: "t2", nome: "Noite", entrada: "17:00", saida: "23:00", intervalo_minutos: 60 },
  ];

  it("retorna null quando não há histórico", () => {
    const r = horarioMaisUsado({ dias: [], unidadeId: "u1", cargoId: "c1", dow: 1 });
    expect(r).toBeNull();
  });

  it("escolhe o par entrada/saída mais frequente para cargo/unidade/dow", () => {
    const diasHistoricos = [
      contarDia({
        data: "2026-09-07",
        colaboradores: [fixo("a", "t2"), fixo("b", "t2"), fixo("c", "t1")],
        turnos,
        convocacoes: [],
        folgas: [],
        ausencias: [],
      }),
      contarDia({
        data: "2026-09-14",
        colaboradores: [fixo("a", "t2"), fixo("b", "t2"), fixo("c", "t1")],
        turnos,
        convocacoes: [],
        folgas: [],
        ausencias: [],
      }),
    ];
    const r = horarioMaisUsado({ dias: diasHistoricos, unidadeId: "u1", cargoId: "c1", dow: 1 });
    expect(r).toEqual({ entrada: "17:00", saida: "23:00", termina_no_dia_seguinte: false });
  });

  it("desempata pelo dia mais recente", () => {
    const diasHistoricos = [
      contarDia({
        data: "2026-09-07",
        colaboradores: [fixo("a", "t1")],
        turnos,
        convocacoes: [],
        folgas: [],
        ausencias: [],
      }),
      contarDia({
        data: "2026-09-14",
        colaboradores: [fixo("a", "t2")],
        turnos,
        convocacoes: [],
        folgas: [],
        ausencias: [],
      }),
    ];
    const r = horarioMaisUsado({ dias: diasHistoricos, unidadeId: "u1", cargoId: "c1", dow: 1 });
    expect(r).toEqual({ entrada: "17:00", saida: "23:00", termina_no_dia_seguinte: false });
  });

  it("ignora registros de outra unidade e faz fallback por cargo dentro da mesma unidade", () => {
    const dia = contarDia({
      data: "2026-09-07",
      colaboradores: [fixo("a", "t2")],
      turnos,
      convocacoes: [],
      folgas: [],
      ausencias: [],
    });
    expect(horarioMaisUsado({ dias: [dia], unidadeId: "u2", cargoId: "c1", dow: 1 })).toBeNull();
    // Mesma unidade, cargo diferente: ainda encontra via fallback de unidade.
    expect(horarioMaisUsado({ dias: [dia], unidadeId: "u1", cargoId: "c2", dow: 1 })).toEqual({
      entrada: "17:00",
      saida: "23:00",
      termina_no_dia_seguinte: false,
    });
  });
});
