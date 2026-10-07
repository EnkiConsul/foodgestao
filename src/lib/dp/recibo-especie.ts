/**
 * Recibo de pagamento em dinheiro (espécie).
 *
 * Dois caminhos, ambos no servidor (`dp-recibo-especie`):
 *   • baixar o recibo para imprimir e assinar à mão;
 *   • guardar no acervo do colaborador pedindo assinatura no portal.
 */
import { supabase } from "@/integrations/supabase/client";

async function fraseDoErro(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === "function") {
    const corpo = (await ctx.json().catch(() => null)) as { error?: string } | null;
    if (corpo?.error) return corpo.error;
  }
  return fallback;
}

/** PDF do recibo para leitura/impressão. Devolve endereço temporário. */
export async function reciboEspeciePdf(
  documentoId: string,
): Promise<{ url: string; revogar: () => void }> {
  const { data, error } = await supabase.functions.invoke("dp-recibo-especie", {
    body: { documento_id: documentoId, registrar: false },
  });
  if (error) throw new Error(await fraseDoErro(error, "Não foi possível emitir o recibo agora."));
  const blob = data instanceof Blob
    ? data
    : new Blob([data as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  return { url, revogar: () => URL.revokeObjectURL(url) };
}

/** Guarda o recibo no acervo do colaborador exigindo assinatura no portal. */
export async function emitirReciboEspecieParaAssinatura(documentoId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("dp-recibo-especie", {
    body: { documento_id: documentoId, registrar: true },
  });
  if (error) throw new Error(await fraseDoErro(error, "Não foi possível emitir o recibo agora."));
  const corpo = data as { recibo_documento_id?: string } | null;
  if (!corpo?.recibo_documento_id) throw new Error("O recibo não pôde ser registrado.");
  return corpo.recibo_documento_id;
}

/**
 * Registro interno do pagamento em dinheiro, usado como arquivo do comprovante
 * quando não há comprovante bancário. Não substitui o recibo assinado.
 */
export async function registroPagamentoEspecieArquivo(dados: {
  colaborador: string;
  competencia: string;
  pagoEm: string;
  valorCents: number;
}): Promise<File> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 420]);
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const b = await pdf.embedFont(StandardFonts.HelveticaBold);
  const valor = (dados.valorCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  const [a, m, d] = dados.pagoEm.split("-");
  page.drawText("Registro de Pagamento em Dinheiro", { x: 48, y: 360, size: 16, font: b });
  const linhas = [
    `Colaborador: ${dados.colaborador}`,
    `Competência: ${dados.competencia}`,
    `Data do pagamento: ${d}/${m}/${a}`,
    `Valor pago em dinheiro: R$ ${valor}`,
    "",
    "Registro interno do pagamento informado pelo gestor.",
    "A quitação depende do recibo assinado pelo colaborador (CLT, art. 464).",
  ];
  linhas.forEach((t, i) =>
    page.drawText(t, { x: 48, y: 320 - i * 20, size: 11, font: f, color: rgb(0.1, 0.1, 0.1) }),
  );
  const bytes = await pdf.save();
  return new File([bytes as BlobPart], `pagamento-especie-${dados.pagoEm}.pdf`, {
    type: "application/pdf",
  });
}
