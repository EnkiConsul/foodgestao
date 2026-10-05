import { describe, expect, it } from "vitest";
import { termoTrocaHtml, termoTrocaPdf } from "@/lib/dp/troca-certificado";
import type { DpTrocaRow } from "@/hooks/useDpTrocas";

const troca = {
  id: "t1",
  status: "aprovada",
  data_original: "2026-10-10",
  data_proposta: "2026-10-17",
  motivo: null,
  created_at: "2026-10-01T10:00:00Z",
  colega_respondido_em: "2026-10-01T12:00:00Z",
  gestor_respondido_em: null,
  solicitante: { nome: "Ana", cpf: "12345678901", matricula: null, cargo: { nome: "Atendente" }, unidade: { nome: "Loja 1" } },
  destino: { nome: "Bia", cpf: null, matricula: "7", cargo: { nome: "Caixa" }, unidade: { nome: "Loja 1" } },
} as unknown as DpTrocaRow;

const empresa = { nome: "Pakerê", cnpj: "00.000.000/0001-00" };

describe("logo no termo de troca", () => {
  it("HTML usa a logo embutida (data URL), sem depender de rede", () => {
    const html = termoTrocaHtml(troca, empresa);
    expect(html).toContain('src="data:image/png;base64,');
    expect(html).not.toContain("/__l5e/");
  });

  it("PDF é gerado com a logo embutida", async () => {
    const bytes = await termoTrocaPdf(troca, empresa);
    expect(bytes.length).toBeGreaterThan(30_000); // logo embutida aumenta o arquivo
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
