import { describe, it, expect } from "vitest";
import {
  cargaSemanalConfig, diasDeFolga, diasPadrao, normalizarDias, resumoConfigTexto,
  turnoDoDia, validarConfigTrabalho, configTemErro,
  type ConfigTrabalho, type TurnoResolvido,
} from "@/lib/dp/config-trabalho";

const jantar: TurnoResolvido = {
  id: "t1", nome: "Jantar", entrada: "17:00", saida: "23:00", intervalo_minutos: 60,
};
const almoco: TurnoResolvido = {
  id: "t2", nome: "Almoço", entrada: "10:00", saida: "16:00", intervalo_minutos: 60,
};
const turnos = [jantar, almoco];

function config(over: Partial<ConfigTrabalho> = {}): ConfigTrabalho {
  return { turno_padrao_id: "t1", folga_variavel: false, folga_fixa_dow: null, dias: diasPadrao(), ...over };
}

describe("config-trabalho", () => {
  it("normaliza sempre 7 dias e aplica a folga fixa", () => {
    const dias = normalizarDias([{ dow: 1, trabalha: true, turno_id: null }], 0);
    expect(dias).toHaveLength(7);
    expect(dias.find((d) => d.dow === 0)?.trabalha).toBe(false);
  });

  it("usa o turno padrão quando o dia não tem turno próprio", () => {
    const c = config();
    expect(turnoDoDia(c.dias[0], c.turno_padrao_id, turnos)?.id).toBe("t1");
  });

  it("respeita o turno específico do dia", () => {
    const c = config({ dias: normalizarDias([{ dow: 1, trabalha: true, turno_id: "t2" }]) });
    const dia = c.dias.find((d) => d.dow === 1)!;
    expect(turnoDoDia(dia, c.turno_padrao_id, turnos)?.id).toBe("t2");
  });

  it("não conta carga em dia de folga", () => {
    const c = config({ dias: normalizarDias(diasPadrao(), 0) });
    // 6 dias × 5h líquidas
    expect(cargaSemanalConfig(c, turnos)).toBe(30);
    expect(diasDeFolga(c)).toEqual([0]);
  });

  it("bloqueia carga semanal acima de 44h para CLT", () => {
    const pesado: TurnoResolvido = { id: "t3", nome: "Longo", entrada: "08:00", saida: "20:00", intervalo_minutos: 60 };
    const c = config({ turno_padrao_id: "t3" });
    const v = validarConfigTrabalho(c, [pesado], { regime: "clt" });
    expect(configTemErro(v)).toBe(true);
    expect(v.some((x) => x.campo === "carga")).toBe(true);
  });

  it("não aplica limite celetista para PJ", () => {
    const pesado: TurnoResolvido = { id: "t3", nome: "Longo", entrada: "08:00", saida: "20:00", intervalo_minutos: 60 };
    const v = validarConfigTrabalho(config({ turno_padrao_id: "t3" }), [pesado], { regime: "pj" });
    expect(v.some((x) => x.campo === "carga")).toBe(false);
  });

  it("exige folga semanal em contrato CLT sem folga variável", () => {
    const v = validarConfigTrabalho(config({ turno_padrao_id: "t2" }), turnos, { regime: "clt" });
    expect(v.some((x) => x.campo === "folga" && x.nivel === "erro")).toBe(true);
  });

  it("aceita folga variável conforme escala", () => {
    const v = validarConfigTrabalho(
      config({ turno_padrao_id: "t2", folga_variavel: true }),
      turnos,
      { regime: "clt" },
    );
    expect(v.some((x) => x.campo === "folga")).toBe(false);
  });

  it("não exige folga para intermitente", () => {
    const v = validarConfigTrabalho(config({ turno_padrao_id: "t2" }), turnos, { regime: "intermitente" });
    expect(v.some((x) => x.campo === "folga")).toBe(false);
  });

  it("acusa dia trabalhado sem turno definido", () => {
    const v = validarConfigTrabalho(config({ turno_padrao_id: null }), turnos, { regime: "clt" });
    expect(v.some((x) => x.campo === "turno" && x.nivel === "erro")).toBe(true);
  });

  it("resume a configuração em texto legível", () => {
    const c = config({ dias: normalizarDias(diasPadrao(), 0) });
    const texto = resumoConfigTexto(c, turnos);
    expect(texto).toContain("17:00 → 23:00");
    expect(texto).toContain("folga: Dom");
  });
});

describe("aviso de carga semanal", () => {
  /** 4 dias de trabalho; o turno define quanto cada dia soma. */
  function quatroDias(turno: TurnoResolvido) {
    const c: ConfigTrabalho = {
      turno_padrao_id: turno.id,
      folga_variavel: false,
      folga_fixa_dow: 0,
      dias: normalizarDias([1, 2, 3, 4].map((dow) => ({ dow, trabalha: true, turno_id: null })), 0),
    };
    return validarConfigTrabalho(c, [turno], { regime: "clt" }).find((v) => v.campo === "carga");
  }

  it("perto do teto mostra quanto falta, sem falar de folga", () => {
    const v = quatroDias({ id: "x", nome: "43h", entrada: "08:00", saida: "19:45", intervalo_minutos: 60 });
    expect(v?.nivel).toBe("aviso");
    expect(v?.mensagem).toContain("faltam 1h para o teto semanal da CLT (44h)");
    expect(v?.mensagem).not.toContain("folga");
  });

  it("exatamente no teto avisa que está no limite da CLT", () => {
    const v = quatroDias({ id: "x", nome: "44h", entrada: "08:00", saida: "20:00", intervalo_minutos: 60 });
    expect(v?.nivel).toBe("aviso");
    expect(v?.mensagem).toContain("é o teto da CLT");
    expect(v?.mensagem).not.toContain("faltam");
  });

  it("acima do teto bloqueia e mostra o excedente", () => {
    const v = quatroDias({ id: "x", nome: "46h", entrada: "08:00", saida: "20:30", intervalo_minutos: 60 });
    expect(v?.nivel).toBe("erro");
    expect(v?.mensagem).toContain("excede o teto da CLT (44h) em 2h");
  });
});
