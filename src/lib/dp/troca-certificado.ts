import { escapeHtml as e, imprimirHtmlEmQuadro } from "@/lib/print/imprimirHtml";
import type { DpTrocaRow } from "@/hooks/useDpTrocas";
import { dataComDiaSemana } from "@/lib/dp/troca-apresentacao";
import { TEXTO_CIENCIA_FALTA_TROCA } from "@/components/dp/CienciaFaltaTrocaBox";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const TEXTO_CIENCIA_DSR_TROCA =
  "Os colaboradores declaram que esta troca foi pedida e aceita por livre e espontânea vontade, no interesse pessoal de cada um, e não por determinação da empresa. Estão cientes de que, em razão da troca, poderá haver mais de 6 (seis) dias consecutivos de trabalho antes do descanso, situação que concordam por sua própria conveniência (Art. 67 da CLT e Lei 605/1949).";

function dh(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Termo de Permuta de Folga: lastro eletrônico + assinaturas digitais dos dois colaboradores. */
export function termoTrocaHtml(t: DpTrocaRow, empresa: { nome: string; cnpj?: string | null }): string {
  const s = t.solicitante;
  const d = t.destino;
  const pessoa = (papel: string, p: DpTrocaRow["solicitante"]) => `
    <div class="box"><div class="lbl">${papel}</div>
    <b>${e(p?.nome ?? "—")}</b><br/>Cargo: ${e(p?.cargo?.nome ?? "—")}<br/>
    Unidade: ${e(p?.unidade?.nome ?? "—")}<br/>Matrícula: ${e(p?.matricula ?? "—")}</div>`;
  const x = t as unknown as Record<string, string | null>;
  const img = (v: string | null) =>
    v && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v) ? `<img src="${v}" alt="Assinatura" style="max-height:60px;max-width:220px"/>` : "";
  const assinatura = (p: DpTrocaRow["solicitante"], png: string | null, quando: string | null, papel: string) => `
    <div class="ass">${png ? img(png) : `<div style="height:60px;display:flex;align-items:flex-end;justify-content:center;color:#b00;font-size:10px;padding-bottom:4px">Aguardando assinatura digital (${papel.toLowerCase()})</div>`}<div class="linha"></div><b>${e(p?.nome ?? "—")}</b><br/>
    <small>${png ? `Assinado digitalmente em ${e(dh(quando))}` : "—"}</small></div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Termo de Troca de Folga</title>
<style>
body{font-family:Arial,sans-serif;color:#0F1B3D;margin:28px;font-size:12px;line-height:1.45}
h1{font-size:18px;margin:0;color:#EB6119}.sub{color:#555;margin-bottom:16px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.box{border:1px solid #ccc;border-radius:8px;padding:10px}
.lbl{font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#777;margin-bottom:4px}
table{width:100%;border-collapse:collapse;margin-top:6px}td{border:1px solid #ddd;padding:6px;vertical-align:top}
.aviso{border:1px solid #EB6119;background:#fff4ee;padding:10px;border-radius:8px;margin-top:12px}
.asss{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:40px}.ass{text-align:center;min-width:0;word-break:normal;overflow-wrap:anywhere}.ass img{max-width:100%}
@media (max-width:520px){body{margin:14px}.grid,.asss{grid-template-columns:1fr;gap:24px}}
.linha{border-top:1px solid #0F1B3D;margin-bottom:4px}.rod{margin-top:30px;font-size:9px;color:#777}
</style></head><body>
<h1>Termo de Troca de Folga</h1>
<div class="sub">${e(empresa.nome)}${empresa.cnpj ? ` — CNPJ ${e(empresa.cnpj)}` : ""}</div>
<div class="grid">${pessoa("Solicitante", s)}${pessoa("Colega", d)}</div>
<div class="box" style="margin-top:10px"><div class="lbl">Folgas permutadas</div>
<p><b>${e(dataComDiaSemana(t.data_original, true))}</b>: era folga de ${e(s?.nome ?? "—")}; passa a ser folga de ${e(d?.nome ?? "—")} e dia de trabalho de ${e(s?.nome ?? "—")}.</p>
<p><b>${e(dataComDiaSemana(t.data_proposta, true))}</b>: era folga de ${e(d?.nome ?? "—")}; passa a ser folga de ${e(s?.nome ?? "—")} e dia de trabalho de ${e(d?.nome ?? "—")}.</p>
${t.motivo ? `<p>Motivo: ${e(t.motivo)}</p>` : ""}</div>
<div class="lbl" style="margin-top:12px">Registro eletrônico</div>
<table>
<tr><td>Pedido enviado pelo solicitante</td><td>${e(dh(t.created_at))}</td></tr>
<tr><td>Aceite do colega</td><td>${e(dh(t.colega_respondido_em))}</td></tr>
<tr><td>Decisão do gestor</td><td>${t.gestor_respondido_em ? e(dh(t.gestor_respondido_em)) : "Não exigida (troca direta pela regra da unidade)"}</td></tr>
<tr><td>Identificador do registro</td><td>${e(t.id)}</td></tr>
</table>
<div class="aviso"><b>Ciência dos colaboradores:</b> ${e(TEXTO_CIENCIA_FALTA_TROCA)}</div>
<div class="aviso"><b>Livre solicitação e descanso semanal:</b> ${e(TEXTO_CIENCIA_DSR_TROCA)}</div>
<div class="asss">${assinatura(s, x.solicitante_assinatura, x.solicitante_assinado_em, "Pedido")}${assinatura(d, x.destino_assinatura, x.destino_assinado_em, "Aceite")}</div>
<div class="rod">Documento emitido em ${e(dh(new Date().toISOString()))} pelo AVETO 360. As assinaturas acima foram feitas digitalmente pelos próprios colaboradores, logados no portal, no momento do pedido e do aceite (MP 2.200-2/2001, art. 10, §2º, e Lei 14.063/2020). Data, hora e identificador do registro ficam guardados no sistema como lastro.</div>
</body></html>`;
}

/** pdf-lib usa WinAnsi: troca caracteres fora da tabela. */
function w(t: string) {
  return t.replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/⇄/g, "<->").replace(/[^\x20-\xFF]/g, "");
}

/** Gera o Termo de Troca em PDF (assinaturas lado a lado, sem quebra vertical). */
export async function termoTrocaPdf(t: DpTrocaRow, empresa: { nome: string; cnpj?: string | null }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const b = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 48, L = W - M * 2;
  const azul = rgb(0.06, 0.1, 0.24), laranja = rgb(0.92, 0.38, 0.1), cinza = rgb(0.45, 0.45, 0.45);
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const novaSe = (h: number) => { if (y - h < M) { page = pdf.addPage([W, H]); y = H - M; } };
  const quebrar = (txt: string, fonte = f, s = 10, larg = L) => {
    const out: string[] = []; let atual = "";
    for (const p of w(txt).split(/\s+/)) {
      const tent = atual ? `${atual} ${p}` : p;
      if (fonte.widthOfTextAtSize(tent, s) > larg && atual) { out.push(atual); atual = p; } else atual = tent;
    }
    if (atual) out.push(atual);
    return out;
  };
  const par = (txt: string, fonte = f, s = 10, cor = azul) => {
    for (const l of quebrar(txt, fonte, s)) { novaSe(s + 4); page.drawText(l, { x: M, y, size: s, font: fonte, color: cor }); y -= s + 4; }
    y -= 4;
  };
  const s = t.solicitante, d = t.destino;
  const x = t as unknown as Record<string, string | null>;
  par("Termo de Troca de Folga", b, 17, laranja);
  par(`${empresa.nome}${empresa.cnpj ? ` - CNPJ ${empresa.cnpj}` : ""}`, f, 10, cinza);
  const pessoa = (r: string, p: DpTrocaRow["solicitante"]) =>
    par(`${r}: ${p?.nome ?? "-"} | Cargo: ${p?.cargo?.nome ?? "-"} | Unidade: ${p?.unidade?.nome ?? "-"} | Matrícula: ${p?.matricula ?? "-"}`);
  pessoa("Solicitante", s); pessoa("Colega", d);
  par("Folgas permutadas", b, 11);
  par(`${dataComDiaSemana(t.data_original, true)}: era folga de ${s?.nome ?? "-"}; passa a ser folga de ${d?.nome ?? "-"} e dia de trabalho de ${s?.nome ?? "-"}.`);
  par(`${dataComDiaSemana(t.data_proposta, true)}: era folga de ${d?.nome ?? "-"}; passa a ser folga de ${s?.nome ?? "-"} e dia de trabalho de ${d?.nome ?? "-"}.`);
  if (t.motivo) par(`Motivo: ${t.motivo}`);
  par("Registro eletrônico", b, 11);
  par(`Pedido enviado: ${dh(t.created_at)}`);
  par(`Aceite do colega: ${dh(t.colega_respondido_em)}`);
  par(`Decisão do gestor: ${t.gestor_respondido_em ? dh(t.gestor_respondido_em) : "Não exigida (troca direta pela regra da unidade)"}`);
  par(`Identificador do registro: ${t.id}`);
  par("Ciência dos colaboradores", b, 11); par(TEXTO_CIENCIA_FALTA_TROCA);
  par("Livre solicitação e descanso semanal", b, 11); par(TEXTO_CIENCIA_DSR_TROCA);

  novaSe(130); y -= 50;
  const col = (L - 30) / 2;
  const bloco = async (i: number, p: DpTrocaRow["solicitante"], png: string | null, quando: string | null, papel: string) => {
    const x0 = M + i * (col + 30);
    if (png && /^data:image\/png;base64,/.test(png)) {
      try {
        const bin = atob(png.split(",")[1]); const u = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
        const img = await pdf.embedPng(u);
        const e2 = Math.min(col / img.width, 50 / img.height);
        page.drawImage(img, { x: x0 + (col - img.width * e2) / 2, y: y + 4, width: img.width * e2, height: img.height * e2 });
      } catch { /* imagem inválida */ }
    } else {
      const tx = w(`Aguardando assinatura digital (${papel})`);
      page.drawText(tx, { x: x0 + (col - f.widthOfTextAtSize(tx, 8)) / 2, y: y + 8, size: 8, font: f, color: rgb(0.7, 0.1, 0.1) });
    }
    page.drawLine({ start: { x: x0, y }, end: { x: x0 + col, y }, thickness: 0.8, color: azul });
    let yy = y - 12;
    for (const l of quebrar(p?.nome ?? "-", b, 9, col)) { page.drawText(l, { x: x0 + (col - b.widthOfTextAtSize(l, 9)) / 2, y: yy, size: 9, font: b, color: azul }); yy -= 11; }
    const sub = w(png ? `Assinado digitalmente em ${dh(quando)}` : "-");
    page.drawText(sub, { x: x0 + (col - f.widthOfTextAtSize(sub, 7.5)) / 2, y: yy, size: 7.5, font: f, color: cinza });
  };
  await bloco(0, s, x.solicitante_assinatura, x.solicitante_assinado_em, "pedido");
  await bloco(1, d, x.destino_assinatura, x.destino_assinado_em, "aceite");
  y -= 60;
  par(`Documento emitido em ${dh(new Date().toISOString())} pelo AVETO 360. Assinaturas feitas digitalmente pelos próprios colaboradores, logados no portal (MP 2.200-2/2001, art. 10, §2º, e Lei 14.063/2020).`, f, 7.5, cinza);
  return pdf.save();
}

/** Gera o PDF e abre na própria tela (visualizador do navegador); a impressão fica a cargo da pessoa. */
export async function emitirTermoTrocaPdf(t: DpTrocaRow, empresa: { nome: string; cnpj?: string | null }, janela?: Window | null) {
  const bytes = await termoTrocaPdf(t, empresa);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const nome = `Termo de Troca - ${t.solicitante?.nome ?? ""} x ${t.destino?.nome ?? ""}.pdf`;
  if (janela && !janela.closed) janela.location.href = url;
  else {
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener"; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export function imprimirTermoTroca(t: DpTrocaRow, empresa: { nome: string; cnpj?: string | null }) {
  return imprimirHtmlEmQuadro(termoTrocaHtml(t, empresa));
}
