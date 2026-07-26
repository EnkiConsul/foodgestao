import { describe, expect, it } from "vitest";
import {
  extractPeriodo,
  extractPeriodoFromFilename,
} from "../../../../supabase/functions/_shared/competencia";

// Trecho real do OCR do cartão de ponto (competência 06/2026, admissão 07/05/2026)
const OCR_PONTO = `LS PRODUTOS ALIMENTICIOS LTDA
SETOR GARAVELO
KARINE COSTA DA SILVA
06.002.178/0001-58
703.363.591-52
07/05/2026
16:30 18:30
01/06/2026 à 30/06/2026
03/07/2026 - 15:48
Página 7 de 11
Data
01/06 Seg
02/06 Ter
03/06 Qua`;

// Trecho real do OCR do contracheque (competência 06/2026)
const OCR_CONTRACHEQUE = `LS PRODUTOS ALIMENTICIOS LTDA ME
CNPJ: 06.002.178/0001-58
Mensalista
Folha Mensal
Junho de 2026
Nome do Funcionário KARINE COSTA DA SILVA
Admissão: 07/05/2026
8781 SALARIO EMPREGADO`;

describe("extractPeriodo", () => {
  it("usa o período de referência do cartão de ponto e não a data de admissão", () => {
    expect(extractPeriodo(OCR_PONTO)).toBe("2026-06");
  });

  it("detecta competência do contracheque pelo nome do mês", () => {
    expect(extractPeriodo(OCR_CONTRACHEQUE)).toBe("2026-06");
  });

  it("prioriza a linha explícita COMPETENCIA emitida pelo OCR", () => {
    const t = `Admissão: 07/05/2026\nEmissão: 03/07/2026\nCOMPETENCIA: 06/2026`;
    expect(extractPeriodo(t)).toBe("2026-06");
  });

  it("aceita competência explícita por extenso", () => {
    expect(extractPeriodo("COMPETENCIA: junho de 2026")).toBe("2026-06");
  });

  it("lê adiantamento com rótulo referente a MM/AAAA", () => {
    const t = `RECIBO DE ADIANTAMENTO SALARIAL
Emissão: 12/08/2026
Referente a 07/2026
Valor 700,00`;
    expect(extractPeriodo(t)).toBe("2026-07");
  });

  it("lê décimo terceiro com rótulo", () => {
    const t = `RECIBO DE DECIMO TERCEIRO 12/2026\nAdmissão: 07/05/2026`;
    expect(extractPeriodo(t)).toBe("2026-12");
  });

  it("ignora MM/AAAA que faz parte de uma data completa", () => {
    expect(extractPeriodo("Admissão: 07/05/2026")).toBeNull();
  });

  it("ignora datas rotuladas como emissão/impressão", () => {
    expect(extractPeriodo("Impressão: 03/07/2026")).toBeNull();
  });

  it("usa intervalo com meses diferentes pelo mês inicial", () => {
    expect(extractPeriodo("Período: 21/05/2026 a 20/06/2026")).toBe("2026-05");
  });

  it("desempata por frequência quando não há rótulo", () => {
    const t = `Espelho
10/09/2026 08:00
11/09/2026 08:00
12/09/2026 08:00
13/09/2026 08:00`;
    expect(extractPeriodo(t)).toBe("2026-09");
  });

  it("retorna null para texto vazio", () => {
    expect(extractPeriodo("")).toBeNull();
  });
});

describe("extractPeriodoFromFilename", () => {
  it("extrai competência do nome do arquivo", () => {
    expect(extractPeriodoFromFilename("Recibo 06.2026.pdf")).toBe("2026-06");
    expect(extractPeriodoFromFilename("contracheque-junho-2026.pdf")).toBe("2026-06");
  });

  it("retorna null quando não há competência", () => {
    expect(extractPeriodoFromFilename("documento.pdf")).toBeNull();
  });
});
