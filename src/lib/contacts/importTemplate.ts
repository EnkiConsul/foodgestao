/** Gera e baixa o modelo .xlsx de importação de clientes/fornecedores. */
export async function downloadContactsTemplate() {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Contatos");

  const headers = ["nome", "tipo", "cpf_cnpj", "email", "telefone", "endereco", "observacoes"];
  ws.addRow(headers);
  ws.addRow([
    "Distribuidora Exemplo LTDA",
    "fornecedor",
    "12.345.678/0001-95",
    "contato@exemplo.com.br",
    "(62) 99999-0000",
    "Rua Exemplo, 100 - Goiânia/GO",
    "Entrega semanal",
  ]);

  ws.getRow(1).font = { bold: true, name: "Arial" };
  ws.columns = headers.map((h, i) => ({ width: i === 0 ? 34 : i >= 5 ? 30 : 22 }));

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo-clientes-fornecedores.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
