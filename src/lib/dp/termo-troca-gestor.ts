// Termo de alteração de folga feita pelo gestor no calendário.
// Registra se a troca foi pedida pelo colaborador ou determinada pela empresa.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { registrarDocumento } from "@/lib/dp/documentos-oficial";

export type OrigemTrocaGestor = "colaborador" | "empresa";
export type AssinaturaTermo = "digital" | "manual";

export const ORIGEM_TROCA_LABEL: Record<OrigemTrocaGestor, string> = {
  colaborador: "Solicitação do colaborador",
  empresa: "Necessidade da empresa",
};

const br = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
};

export function termoTrocaGestorParagrafos(d: {
  empresa: string; nome: string; dataFixa: string; dataNova: string; origem: OrigemTrocaGestor; motivo?: string | null; folgaFixa: boolean;
}): string[] {
  const tipo = d.folgaFixa ? "folga fixa semanal" : "folga";
  const base = [
    `EMPREGADOR: ${d.empresa}.`,
    `EMPREGADO(A): ${d.nome}.`,
    `1. Alteração. A ${tipo} prevista para ${br(d.dataFixa)} passa a ser dia de trabalho, e a folga correspondente será gozada em ${br(d.dataNova)}.`,
    `2. Origem: ${ORIGEM_TROCA_LABEL[d.origem]}.`,
  ];
  if (d.motivo) base.push(`3. Motivo: ${d.motivo}.`);
  base.push(
    d.origem === "colaborador"
      ? "4. Declaração. O(A) empregado(a) declara que a troca foi pedida por livre e espontânea vontade, no seu interesse pessoal, e que está ciente de que poderá haver mais de 6 (seis) dias consecutivos de trabalho antes do descanso (Art. 67 da CLT e Lei 605/1949)."
      : "4. Compensação. A alteração decorre de necessidade operacional da empresa. O descanso semanal remunerado fica assegurado na nova data; caso o descanso não seja concedido, o dia trabalhado será pago em dobro (Lei 605/1949, art. 9º).",
    "5. Demais condições do contrato permanecem inalteradas.",
  );
  return base;
}

const w = (t: string) => t.replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\xFF]/g, "");

export async function termoTrocaGestorPdf(p: Parameters<typeof termoTrocaGestorParagrafos>[0], manual: boolean): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const b = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 56, L = W - M * 2;
  const verde = rgb(0.153, 0.682, 0.376), grafite = rgb(0.2, 0.2, 0.2);
  const page = pdf.addPage([W, H]);
  let y = H - M;
  page.drawText("AVETO 360", { x: M, y, size: 12, font: b, color: verde });
  y -= 28;
  page.drawText(w("Termo de Alteração de Folga"), { x: M, y, size: 16, font: b, color: grafite });
  y -= 26;
  for (const par of termoTrocaGestorParagrafos(p)) {
    let linha = "";
    for (const pal of w(par).split(/\s+/)) {
      const t = linha ? `${linha} ${pal}` : pal;
      if (f.widthOfTextAtSize(t, 10.5) > L && linha) { page.drawText(linha, { x: M, y, size: 10.5, font: f, color: grafite }); y -= 15; linha = pal; }
      else linha = t;
    }
    if (linha) { page.drawText(linha, { x: M, y, size: 10.5, font: f, color: grafite }); y -= 15; }
    y -= 8;
  }
  y -= 50;
  const col = (L - 40) / 2;
  for (const [i, rot] of [[0, "Empregador"], [1, w(p.nome)]] as const) {
    const x = M + i * (col + 40);
    page.drawLine({ start: { x, y }, end: { x: x + col, y }, thickness: 0.8, color: grafite });
    page.drawText(rot, { x, y: y - 14, size: 10, font: b, color: grafite });
    page.drawText(manual ? "Data: ____ / ____ / ________" : "Assinatura digital pelo Portal", { x, y: y - 28, size: 9, font: f, color: grafite });
  }
  page.drawText(w(manual ? "Via para assinatura à mão; anexe a via assinada na ficha do colaborador." : "Assinatura eletrônica (MP 2.200-2/2001, art. 10, §2º, e Lei 14.063/2020)."), { x: M, y: M, size: 8, font: f, color: grafite });
  return pdf.save();
}

/** Gera o termo, guarda na ficha e (digital) envia ao Portal para aceite. Manual: devolve o PDF para impressão. */
export async function emitirTermoTrocaGestor(input: {
  companyId: string; colaboradorId: string; empresa: string; nome: string;
  dataFixa: string; dataNova: string; origem: OrigemTrocaGestor; motivo?: string | null;
  folgaFixa: boolean; assinatura: AssinaturaTermo;
}): Promise<Uint8Array> {
  const manual = input.assinatura === "manual";
  const bytes = await termoTrocaGestorPdf(input, manual);
  const nome = `termo-alteracao-folga-${input.dataFixa}.pdf`;
  const path = `${input.companyId}/${input.colaboradorId}/${Date.now()}-${nome}`;
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const up = await supabase.storage.from("dp-documentos").upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error("A troca foi feita, mas não foi possível guardar o termo. Gere novamente pela ficha.");
  await registrarDocumento({
    company_id: input.companyId,
    colaborador_id: input.colaboradorId,
    tipo: "termos",
    titulo: "Termo de Alteração de Folga",
    descricao: `${ORIGEM_TROCA_LABEL[input.origem]}. ${manual ? "Via impressa para assinatura à mão." : "Assinatura digital pelo portal."}`,
    file_path: path, file_name: nome, file_size: blob.size, mime_type: "application/pdf",
    referencia_data: input.dataFixa,
    exige_aceite: !manual,
    assinatura_fisica: manual,
  } as never);
  return bytes;
}
