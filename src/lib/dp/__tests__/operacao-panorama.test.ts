import { describe, it, expect } from "vitest";
import {
  avaliarDia,
  baselinePorDow,
  contarDia,
  diasDaCompetencia,
  type ColaboradorPanorama,
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
