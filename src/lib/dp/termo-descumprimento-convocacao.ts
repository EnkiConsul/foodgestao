// Notificação de descumprimento de convocação aceita (intermitente, CLT art. 452-A, § 4º).
// Só informa o percentual legal da multa; a apuração do valor fica com a contabilidade.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { registrarDocumento } from "@/lib/dp/documentos-oficial";
import { AVETO_LOGO_DATA_URL } from "@/lib/dp/aveto-logo-data";

export const PERCENTUAL_MULTA_CONVOCACAO = 50;

export type DadosDescumprimento = {
  empresa: string; cnpj?: string | null;
  nome: string; cpf?: string | null; cargo?: string | null; unidade?: string | null; matricula?: string | null;
  data: string; entrada?: string | null; saida?: string | null; aceitaEm?: string | null;
  observacao?: string | null; emitidoPor?: string | null;
};

const br = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
const dh = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const hm = (t?: string | null) => (t ? t.slice(0, 5) : "-");
const cpfFmt = (c?: string | null) => {
  const n = (c ?? "").replace(/\D/g, "");
  return n.length === 11 ? `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}` : "Não informado";
};
const w = (t: string) => t.replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\xFF]/g, "");

export function descumprimentoParagrafos(d: DadosDescumprimento): string[] {
  const p = [
    `1. Do fato. O(A) empregado(a) aceitou a convocação para trabalhar em ${br(d.data)}, das ${hm(d.entrada)} às ${hm(d.saida)}${d.aceitaEm ? `, com aceite registrado em ${dh(new Date(d.aceitaEm))}` : ""}, e não compareceu ao trabalho, sem apresentar justo motivo até a emissão desta notificação.`,
    "2. Do registro. A ausência foi registrada como falta na data da convocação aceita.",
    `3. Da multa legal. Nos termos do art. 452-A, § 4º, da CLT, a parte que descumprir, sem justo motivo, a convocação aceita pagará à outra parte, no prazo de 30 (trinta) dias, multa de ${PERCENTUAL_MULTA_CONVOCACAO}% (cinquenta por cento) da remuneração que seria devida, permitida a compensação em igual prazo.`,
    "4. Da apuração. O valor da multa será apurado pela contabilidade da empresa, com base na remuneração prevista para a convocação, e informado ao(à) empregado(a).",
    "5. Da justificativa. O(A) empregado(a) poderá apresentar, em até 48 (quarenta e oito) horas do recebimento desta notificação, justificativa ou documento que comprove justo motivo (ex.: atestado médico da data), que será analisado pela empresa.",
  ];
  if (d.observacao) p.push(`6. Observação da empresa: ${d.observacao}.`);
  return p;
}

export async function descumprimentoPdf(p: DadosDescumprimento, manual: boolean, emitidoEm = new Date()): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const b = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 48, L = W - M * 2;
  const azul = rgb(0.06, 0.1, 0.24), vermelho = rgb(0.7, 0.12, 0.1), cinza = rgb(0.45, 0.45, 0.45), verde = rgb(0.08, 0.5, 0.24);
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
  } catch { /* sem logo */ }
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 2, color: vermelho });
  y -= 20;
  par("Notificação de Descumprimento de Convocação Aceita", b, 15, vermelho);
  par("Contrato de trabalho intermitente - CLT, art. 452-A, § 4º", f, 9, cinza);
  par(`EMPREGADOR: ${p.empresa}${p.cnpj ? ` - CNPJ ${p.cnpj}` : ""}`, f, 10, cinza);
  par("Dados do(a) empregado(a)", b, 11);
  par(`Nome: ${p.nome} | CPF: ${cpfFmt(p.cpf)} | Cargo: ${p.cargo ?? "-"} | Unidade: ${p.unidade ?? "-"}${p.matricula ? ` | Matrícula: ${p.matricula}` : ""}`);
  par("Convocação aceita", b, 11);
  par(`Data: ${br(p.data)} | Horário: ${hm(p.entrada)} às ${hm(p.saida)}${p.aceitaEm ? ` | Aceite em: ${dh(new Date(p.aceitaEm))}` : ""}`);
  par("Termos da notificação", b, 11);
  for (const t of descumprimentoParagrafos(p)) par(t);
  par("Registro", b, 11);
  par(`Notificação emitida em ${dh(emitidoEm)}${p.emitidoPor ? ` por ${p.emitidoPor}` : ""}. ${manual ? "Via impressa para ciência." : "Ciência do(a) empregado(a) pendente, pelo Portal do Colaborador."}`);

  novaSe(160); y -= 60;
  const col = (L - 30) / 2;
  if (manual) {
    page.drawLine({ start: { x: M, y }, end: { x: M + col, y }, thickness: 0.8, color: azul });
  } else {
    const by = y - 4, bh = 62;
    page.drawRectangle({ x: M, y: by, width: col, height: bh, borderColor: verde, borderWidth: 1.2, color: rgb(0.94, 0.99, 0.95) });
    const linhas = [
      ["VALIDADO DIGITALMENTE", b, 9, verde],
      [w(p.empresa), b, 8, azul],
      [w(p.cnpj ? `CNPJ ${p.cnpj}` : "Empregador"), f, 7.5, cinza],
      [w(`Em ${dh(emitidoEm)}`), f, 7, cinza],
    ] as const;
    let yy = by + bh - 14;
    for (const [t, fo, s, c] of linhas) {
      const tt = quebrar(t, fo, s, col - 10)[0] ?? "";
      page.drawText(tt, { x: M + (col - fo.widthOfTextAtSize(tt, s)) / 2, y: yy, size: s, font: fo, color: c }); yy -= s + 5;
    }
  }
  const x1 = M + col + 30;
  if (!manual) {
    const tx = "Aguardando ciência digital";
    page.drawText(tx, { x: x1 + (col - f.widthOfTextAtSize(tx, 8)) / 2, y: y + 8, size: 8, font: f, color: vermelho });
  }
  page.drawLine({ start: { x: x1, y }, end: { x: x1 + col, y }, thickness: 0.8, color: azul });
  const rot = (x0: number, nome: string, sub: string[], dy: number) => {
    let yy = y - dy;
    for (const l of quebrar(nome, b, 9, col)) { page.drawText(l, { x: x0 + (col - b.widthOfTextAtSize(l, 9)) / 2, y: yy, size: 9, font: b, color: azul }); yy -= 11; }
    for (const s of sub) { const t = w(s); page.drawText(t, { x: x0 + (col - f.widthOfTextAtSize(t, 7.5)) / 2, y: yy, size: 7.5, font: f, color: cinza }); yy -= 11; }
  };
  if (manual) rot(M, "Empregador", [w(p.empresa), "Data: ____ / ____ / ________"], 12);
  rot(x1, p.nome, [`CPF: ${cpfFmt(p.cpf)}`, "Ciente em: ____ / ____ / ________"], 12);
  y -= manual ? 60 : 110;
  if (manual) {
    novaSe(90);
    par("Em caso de recusa do(a) empregado(a) em assinar, a ciência é atestada pelas testemunhas abaixo:", f, 8, cinza);
    y -= 30;
    page.drawLine({ start: { x: M, y }, end: { x: M + col, y }, thickness: 0.8, color: azul });
    page.drawLine({ start: { x: x1, y }, end: { x: x1 + col, y }, thickness: 0.8, color: azul });
    rot(M, "Testemunha 1", ["Nome / CPF"], 12);
    rot(x1, "Testemunha 2", ["Nome / CPF"], 12);
    y -= 40;
  } else {
    par(`Documento emitido em ${dh(emitidoEm)} pelo AVETO 360. Validação da empresa registrada eletronicamente; ciência do(a) empregado(a) pelo Portal, com acesso pessoal (MP 2.200-2/2001, art. 10, §2º, e Lei 14.063/2020).`, f, 7.5, cinza);
  }
  return pdf.save();
}

/** Gera a notificação, guarda na ficha e (digital) envia ao Portal para ciência. */
export async function emitirNotificacaoDescumprimento(input: {
  companyId: string; colaboradorId: string; nome: string; data: string;
  entrada?: string | null; saida?: string | null; aceitaEm?: string | null;
  observacao?: string | null; assinatura: "digital" | "manual";
}): Promise<Uint8Array> {
  const manual = input.assinatura === "manual";
  const extra: Partial<DadosDescumprimento> = { empresa: "" };
  try {
    const [{ data: col }, { data: emp }, { data: u }] = await Promise.all([
      (supabase as any).from("dp_colaboradores").select("matricula, cargo, cargo_ref:dp_cargos(nome), unidade:dp_unidades(nome)").eq("id", input.colaboradorId).maybeSingle(),
      (supabase as any).from("companies").select("name, cnpj").eq("id", input.companyId).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    extra.matricula = col?.matricula ?? null;
    extra.cargo = col?.cargo_ref?.nome ?? col?.cargo ?? null;
    extra.unidade = col?.unidade?.nome ?? null;
    extra.empresa = emp?.name ?? "";
    extra.cnpj = emp?.cnpj ?? null;
    extra.emitidoPor = (u?.user?.user_metadata as any)?.full_name ?? u?.user?.email ?? null;
    const { buscarConfidencial } = await import("@/lib/dp/confidencial");
    const c = (await buscarConfidencial(input.companyId, [input.colaboradorId])).get(input.colaboradorId);
    if (c?.liberado) extra.cpf = (c.cpf as string) ?? null;
  } catch { /* segue sem complementos */ }
  const bytes = await descumprimentoPdf({ ...input, ...extra, empresa: extra.empresa || "Empregador" }, manual);
  const nome = `notificacao-descumprimento-convocacao-${input.data}.pdf`;
  const path = `${input.companyId}/${input.colaboradorId}/${Date.now()}-${nome}`;
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const up = await supabase.storage.from("dp-documentos").upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error("A falta foi registrada, mas não foi possível guardar a notificação. Tente emitir novamente.");
  await registrarDocumento({
    company_id: input.companyId,
    colaborador_id: input.colaboradorId,
    tipo: "disciplinar",
    titulo: "Notificação de Descumprimento de Convocação",
    descricao: `Falta em convocação aceita (CLT art. 452-A, § 4º). Multa legal de ${PERCENTUAL_MULTA_CONVOCACAO}%, valor apurado pela contabilidade. ${manual ? "Via impressa para ciência." : "Ciência do colaborador pelo portal."}`,
    file_path: path, file_name: nome, file_size: blob.size, mime_type: "application/pdf",
    referencia_data: input.data,
    exige_aceite: !manual,
  } as never);
  return bytes;
}
