import { describe, expect, it } from "vitest";
import { avaliarFranquia, type PreviaFranquia } from "./franquia";

// Multiempresa: R$ 189,90 até 18; adicional R$ 19,90; Enterprise R$ 10,00 a partir de 19.
const multiCheio = (extra: Partial<PreviaFranquia> = {}): PreviaFranquia => ({
  modo: "v2",
  pode_gerir: true,
  atual: 18,
  limite: 18,
  isento: false,
  valor_unit_cents: 1990,
  plano: "pessoas-multiempresa",
  sugestao_upgrade: {
    plano: "pessoas-enterprise",
    nome: "Pessoas 360° Enterprise",
    unitario_cents: 1000,
    minimo: 19,
    valor_atual_cents: 18990 + 1990,
    valor_enterprise_cents: 19000,
  },
  ...extra,
});

describe("franquia de colaboradores", () => {
  it("19º colaborador no Multiempresa: avisa e mostra Enterprise R$ 190,00 contra R$ 209,80", () => {
    const e = avaliarFranquia(multiCheio(), 1);
    expect(e.tipo).toBe("excedente");
    if (e.tipo !== "excedente") return;
    expect(e.enterprise?.valorAtualCents).toBe(20980);
    expect(e.enterprise?.valorEnterpriseCents).toBe(19000);
    expect(e.enterprise?.compensa).toBe(true);
  });

  it("lote de 3 fichas com 17 ativos: só 2 passam da franquia de 18", () => {
    const e = avaliarFranquia(multiCheio({ atual: 17, sugestao_upgrade: null }), 3);
    expect(e.tipo === "excedente" && e.excedentes).toBe(2);
  });

  it("usuário sem ser dono/admin fica bloqueado antes de preencher", () => {
    const e = avaliarFranquia(multiCheio({ pode_gerir: false }), 1);
    expect(e.tipo === "bloqueado" && e.motivo).toBe("sem_permissao");
  });

  it("Enterprise não trava: cada colaborador ativo soma R$ 10,00", () => {
    const e = avaliarFranquia({ ...multiCheio(), limite: -1, atual: 44, por_colaborador_cents: 1000, sugestao_upgrade: null }, 1);
    expect(e).toEqual({ tipo: "por_colaborador", unitarioCents: 1000, atual: 44 });
  });

  it("com vaga na franquia informa quantas restam", () => {
    expect(avaliarFranquia(multiCheio({ atual: 15 }), 1)).toEqual({ tipo: "livre", vagas: 3 });
  });
});
