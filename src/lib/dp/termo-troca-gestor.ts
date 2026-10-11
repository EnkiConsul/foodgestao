// Termo de alteração de folga feita pelo gestor no calendário.
// Registra se a troca foi pedida pelo colaborador ou determinada pela empresa.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { registrarDocumento } from "@/lib/dp/documentos-oficial";
import { AVETO_LOGO_DATA_URL } from "@/lib/dp/aveto-logo-data";

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
const dh = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const cpfFmt = (c?: string | null) => {
  const n = (c ?? "").replace(/\D/g, "");
  return n.length === 11 ? `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}` : "Não informado";
};

export type DadosTermoGestor = {
  empresa: string; nome: string; dataFixa: string; dataNova: string; origem: OrigemTrocaGestor; motivo?: string | null;
  folgaFixa: boolean; consomeVaga?: boolean;
  cnpj?: string | null; cpf?: string | null; cargo?: string | null; unidade?: string | null; matricula?: string | null;
  emitidoPor?: string | null;
};

export function termoTrocaGestorParagrafos(d: DadosTermoGestor): string[] {
  const tipo = d.folgaFixa ? "folga fixa semanal" : "folga";
  const base = [
    `1. Alteração. A ${tipo} prevista para ${br(d.dataFixa)} passa a ser dia normal de trabalho, e o descanso correspondente será gozado em ${br(d.dataNova)}, sem prejuízo da remuneração.`,
    `2. Origem da alteração: ${ORIGEM_TROCA_LABEL[d.origem]}.`,
  ];
  if (d.motivo) base.push(`3. Motivo informado: ${d.motivo}.`);
  base.push(
    d.origem === "colaborador"
      ? "4. Declaração do(a) empregado(a). Declaro que a troca foi pedida por minha livre e espontânea vontade, no meu interesse pessoal, e que estou ciente de que poderá haver mais de 6 (seis) dias consecutivos de trabalho antes do descanso (Art. 67 da CLT e Lei 605/1949), o que aceito expressamente."
      : "4. Compensação. A alteração decorre de necessidade operacional da empresa. O descanso semanal remunerado fica assegurado na nova data; caso não seja concedido, o dia trabalhado será pago em dobro (Lei 605/1949, art. 9º, e Súmula 146 do TST).",
    "5. Faltas. A ausência injustificada no dia que passou a ser de trabalho será tratada como falta, com os descontos e reflexos legais (DSR, férias e benefícios).",
    "6. Demais condições. Permanecem inalteradas todas as demais cláusulas do contrato de trabalho, inclusive jornada, salário e benefícios.",
  );
  if (d.consomeVaga === false) base.push("Registro interno: folga concedida como exceção autorizada pelo gestor, sem consumir vaga do limite do novo dia.");
  return base;
}

const w = (t: string) => t.replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\xFF]/g, "");

export async function termoTrocaGestorPdf(p: DadosTermoGestor, manual: boolean, emitidoEm = new Date()): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const b = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 48, L = W - M * 2;
  const azul = rgb(0.06, 0.1, 0.24), laranja = rgb(0.92, 0.38, 0.1), cinza = rgb(0.45, 0.45, 0.45), verde = rgb(0.08, 0.5, 0.24);
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const novaSe = (h: number) => { if (y - h < M) { page = pdf.addPage([W, H]); y = H - M; } };
  const quebrar = (txt: string, fonte = f, s = 10, larg = L) => {
    const out: string[] = []; let atual = "";
    for (const pal of w(txt).split(/\s+/)) {
      const t = atual ? `${atual} ${pal}` : pal;
      if (fonte.widthOfTextAtSize(t, s) > larg && atual) { out.push(atual); atual = pal; } else atual = t;
    }
    if (atual) out.push(atual);
    return out;
  };
  const par = (txt: string, fonte = f, s = 10, cor = azul) => {
    for (const l of quebrar(txt, fonte, s)) { novaSe(s + 4); page.drawText(l, { x: M, y, size: s, font: fonte, color: cor }); y -= s + 4; }
    y -= 4;
  };
  try {
    const bin = atob(AVETO_LOGO_DATA_URL.split(",")[1]);
    const bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    const logo = await pdf.embedPng(bytes);
    const esc = 34 / logo.height;
    page.drawImage(logo, { x: M, y: y - 34, width: logo.width * esc, height: 34 });
    y -= 44;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 2, color: laranja });
    y -= 20;
  } catch { /* sem logo, segue o documento */ }
  par("Termo de Alteração de Folga", b, 17, laranja);
  par(`EMPREGADOR: ${p.empresa}${p.cnpj ? ` - CNPJ ${p.cnpj}` : ""}`, f, 10, cinza);
  par("Dados do(a) empregado(a)", b, 11);
  par(`Nome: ${p.nome} | CPF: ${cpfFmt(p.cpf)} | Cargo: ${p.cargo ?? "-"} | Unidade: ${p.unidade ?? "-"}${p.matricula ? ` | Matrícula: ${p.matricula}` : ""}`);
  par("Folga alterada", b, 11);
  par(`Data original da folga: ${br(p.dataFixa)} (${p.folgaFixa ? "folga fixa semanal" : "folga agendada"}) - passa a ser dia de trabalho.`);
  par(`Nova data da folga: ${br(p.dataNova)}.`);
  par("Cláusulas", b, 11);
  for (const t of termoTrocaGestorParagrafos(p)) par(t);
  if (!manual) {
    par("Registro eletrônico", b, 11);
    par(`Alteração registrada em ${dh(emitidoEm)}${p.emitidoPor ? ` por ${p.emitidoPor}` : ""}.`);
    par("Aceite do(a) empregado(a): pendente, pelo Portal do Colaborador.");
  }

  novaSe(150); y -= 60;
  const col = (L - 30) / 2;
  // Empregador
  if (manual) {
    page.drawLine({ start: { x: M, y }, end: { x: M + col, y }, thickness: 0.8, color: azul });
  } else {
    const bx = M, by = y - 4, bh = 62;
    page.drawRectangle({ x: bx, y: by, width: col, height: bh, borderColor: verde, borderWidth: 1.2, color: rgb(0.94, 0.99, 0.95) });
    const linhas = [
      ["VALIDADO DIGITALMENTE", b, 9, verde],
      [w(p.empresa), b, 8, azul],
      [w(p.cnpj ? `CNPJ ${p.cnpj}` : "Empregador"), f, 7.5, cinza],
      [w(`Em ${dh(emitidoEm)}${p.emitidoPor ? ` - ${p.emitidoPor}` : ""}`), f, 7, cinza],
    ] as const;
    let yy = by + bh - 14;
    for (const [t, fo, s, c] of linhas) {
      const tt = quebrar(t, fo, s, col - 10)[0] ?? "";
      page.drawText(tt, { x: bx + (col - fo.widthOfTextAtSize(tt, s)) / 2, y: yy, size: s, font: fo, color: c }); yy -= s + 5;
    }
  }
  // Empregado
  const x1 = M + col + 30;
  if (!manual) {
    const tx = "Aguardando assinatura digital (aceite)";
    page.drawText(tx, { x: x1 + (col - f.widthOfTextAtSize(tx, 8)) / 2, y: y + 8, size: 8, font: f, color: rgb(0.7, 0.1, 0.1) });
  }
  page.drawLine({ start: { x: x1, y }, end: { x: x1 + col, y }, thickness: 0.8, color: azul });
  const rot = (x0: number, nome: string, sub: string[]) => {
    let yy = y - (manual || x0 !== M ? 12 : 78);
    for (const l of quebrar(nome, b, 9, col)) { page.drawText(l, { x: x0 + (col - b.widthOfTextAtSize(l, 9)) / 2, y: yy, size: 9, font: b, color: azul }); yy -= 11; }
    for (const s of sub) { const t = w(s); page.drawText(t, { x: x0 + (col - f.widthOfTextAtSize(t, 7.5)) / 2, y: yy, size: 7.5, font: f, color: cinza }); yy -= 11; }
  };
  if (manual) rot(M, "Empregador", [w(p.empresa), "Data: ____ / ____ / ________"]);
  rot(x1, p.nome, manual ? [`CPF: ${cpfFmt(p.cpf)}`, "Data: ____ / ____ / ________"] : ["Empregado(a)"]);
  y -= manual ? 60 : 110;
  if (manual) par("Via para assinatura à mão; anexe a via assinada na ficha do colaborador.", f, 7.5, cinza);
  else par(`Documento emitido em ${dh(emitidoEm)} pelo AVETO 360. Validação da empresa registrada eletronicamente; aceite do(a) empregado(a) pelo Portal, logado(a) com acesso pessoal (MP 2.200-2/2001, art. 10, §2º, e Lei 14.063/2020).`, f, 7.5, cinza);
  return pdf.save();
}

/** Gera o termo, guarda na ficha e (digital) envia ao Portal para aceite. Manual: devolve o PDF para impressão. */
export async function emitirTermoTrocaGestor(input: {
  companyId: string; colaboradorId: string; empresa: string; nome: string;
  dataFixa: string; dataNova: string; origem: OrigemTrocaGestor; motivo?: string | null;
  folgaFixa: boolean; consomeVaga?: boolean; assinatura: AssinaturaTermo;
}): Promise<Uint8Array> {
  const manual = input.assinatura === "manual";
  // Dados complementares (best-effort; o termo sai mesmo se algo faltar).
  const extra: Partial<DadosTermoGestor> = {};
  try {
    const [{ data: col }, { data: emp }, { data: u }] = await Promise.all([
      (supabase as any).from("dp_colaboradores").select("matricula, cargo, cargo_ref:dp_cargos(nome), unidade:dp_unidades(nome)").eq("id", input.colaboradorId).maybeSingle(),
      (supabase as any).from("companies").select("cnpj").eq("id", input.companyId).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    extra.matricula = col?.matricula ?? null;
    extra.cargo = col?.cargo_ref?.nome ?? col?.cargo ?? null;
    extra.unidade = col?.unidade?.nome ?? null;
    extra.cnpj = emp?.cnpj ?? null;
    extra.emitidoPor = (u?.user?.user_metadata as any)?.full_name ?? u?.user?.email ?? null;
    const { buscarConfidencial } = await import("@/lib/dp/confidencial");
    const c = (await buscarConfidencial(input.companyId, [input.colaboradorId])).get(input.colaboradorId);
    if (c?.liberado) extra.cpf = (c.cpf as string) ?? null;
  } catch { /* segue sem os complementos */ }
  const bytes = await termoTrocaGestorPdf({ ...input, ...extra }, manual);
  const nome = `termo-alteracao-folga-${input.dataFixa}.pdf`;
  const path = `${input.companyId}/${input.colaboradorId}/${Date.now()}-${nome}`;
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const up = await supabase.storage.from("dp-documentos").upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error("A troca foi feita, mas não foi possível guardar o termo. Gere novamente pela ficha.");
  await registrarDocumento({
    company_id: input.companyId,
    colaborador_id: input.colaboradorId,
    tipo: "ajuste_jornada",
    titulo: "Termo de Alteração de Folga",
    descricao: `${ORIGEM_TROCA_LABEL[input.origem]}. ${manual ? "Via impressa para assinatura à mão." : "Validado digitalmente pela empresa; aceite do colaborador pelo portal."} ${input.consomeVaga === false ? "Folga excepcional, sem consumir vaga do limite." : "Consumiu vaga do limite do novo dia."}`,
    file_path: path, file_name: nome, file_size: blob.size, mime_type: "application/pdf",
    referencia_data: input.dataFixa,
    exige_aceite: !manual,
  } as never);
  return bytes;
}
