import { describe, it, expect } from "vitest";
import { parseCsv, rowsFromMatrix, parseContactType } from "@/lib/contacts/importSheet";
import { classifyImportRows } from "@/lib/contacts/importDedupe";

const header = ["Nome", "Tipo", "CPF/CNPJ", "E-mail", "Telefone", "Endereço", "Observações"];

describe("importSheet", () => {
  it("reconhece cabeçalhos com acento e maiúsculas", () => {
    const rows = rowsFromMatrix([header, ["Padaria Della", "cliente", "", "a@b.com", "62999", "Rua 1", "obs"]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Padaria Della");
    expect(rows[0].contact_type).toBe("cliente");
    expect(rows[0].email).toBe("a@b.com");
    expect(rows[0].errors).toEqual([]);
  });

  it("assume fornecedor quando o tipo está vazio ou desconhecido", () => {
    expect(parseContactType("")).toBe("fornecedor");
    expect(parseContactType("xyz")).toBe("fornecedor");
    expect(parseContactType("Ambos")).toBe("ambos");
  });

  it("marca documento inválido e nome vazio como erro", () => {
    const rows = rowsFromMatrix([
      header,
      ["Fulano", "cliente", "111.111.111-11", "", "", "", ""],
      ["", "cliente", "", "", "", "", ""],
    ]);
    expect(rows[0].errors).toContain("CPF/CNPJ inválido");
    expect(rows[1].errors).toContain("Nome é obrigatório");
  });

  it("formata CNPJ válido com máscara", () => {
    const rows = rowsFromMatrix([header, ["Empresa", "fornecedor", "12345678000195", "", "", "", ""]]);
    expect(rows[0].document).toBe("12.345.678/0001-95");
    expect(rows[0].errors).toEqual([]);
  });

  it("lê CSV com ponto e vírgula", () => {
    const matrix = parseCsv("nome;tipo;cpf_cnpj\n\"Casa, Boa\";fornecedor;\n");
    const rows = rowsFromMatrix(matrix);
    expect(rows[0].name).toBe("Casa, Boa");
  });
});

describe("classifyImportRows", () => {
  const existing = [
    { id: "1", name: "Distribuidora ABC", document: "12.345.678/0001-95" },
    { id: "2", name: "Padaria Della", document: null },
  ];

  it("detecta existente por documento e por nome", () => {
    const rows = rowsFromMatrix([
      header,
      ["Outro Nome", "fornecedor", "12345678000195", "", "", "", ""],
      ["padaria della", "cliente", "", "", "", "", ""],
      ["Novo Forn", "fornecedor", "", "", "", "", ""],
    ]);
    const out = classifyImportRows(rows, existing);
    expect(out[0].status).toBe("existente");
    expect(out[0].matchName).toBe("Distribuidora ABC");
    expect(out[1].status).toBe("existente");
    expect(out[2].status).toBe("novo");
  });

  it("detecta duplicado dentro da planilha", () => {
    const rows = rowsFromMatrix([
      header,
      ["Novo Forn", "fornecedor", "", "", "", "", ""],
      ["NOVO FORN", "fornecedor", "", "", "", "", ""],
    ]);
    const out = classifyImportRows(rows, existing);
    expect(out[0].status).toBe("novo");
    expect(out[1].status).toBe("duplicado_planilha");
  });

  it("linhas com erro ficam com status erro", () => {
    const rows = rowsFromMatrix([header, ["", "fornecedor", "", "", "", "", ""]]);
    expect(classifyImportRows(rows, existing)[0].status).toBe("erro");
  });
});
