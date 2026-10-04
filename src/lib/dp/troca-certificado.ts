import { escapeHtml as e, imprimirHtmlEmQuadro } from "@/lib/print/imprimirHtml";
import type { DpTrocaRow } from "@/hooks/useDpTrocas";
import { dataComDiaSemana } from "@/lib/dp/troca-apresentacao";
import { TEXTO_CIENCIA_FALTA_TROCA } from "@/components/dp/CienciaFaltaTrocaBox";

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
    <div class="ass">${png ? img(png) : `<div style="height:60px;color:#b00;font-size:10px;padding-top:24px">${papel} sem assinatura digital registrada</div>`}<div class="linha"></div><b>${e(p?.nome ?? "—")}</b><br/>
    <small>${png ? `Assinado digitalmente em ${e(dh(quando))}` : "—"}</small></div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Termo de Troca de Folga</title>
<style>
body{font-family:Arial,sans-serif;color:#0F1B3D;margin:28px;font-size:12px;line-height:1.45}
h1{font-size:18px;margin:0;color:#EB6119}.sub{color:#555;margin-bottom:16px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.box{border:1px solid #ccc;border-radius:8px;padding:10px}
.lbl{font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#777;margin-bottom:4px}
table{width:100%;border-collapse:collapse;margin-top:6px}td{border:1px solid #ddd;padding:6px;vertical-align:top}
.aviso{border:1px solid #EB6119;background:#fff4ee;padding:10px;border-radius:8px;margin-top:12px}
.asss{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:50px}.ass{text-align:center}
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
<div class="asss">${assinatura(s, x.solicitante_assinatura, x.solicitante_assinado_em, "Pedido")}${assinatura(d, x.destino_assinatura, x.destino_assinado_em, "Aceite")}</div>
<div class="rod">Documento emitido em ${e(dh(new Date().toISOString()))} pelo AVETO 360. As assinaturas acima foram feitas digitalmente pelos próprios colaboradores, logados no portal, no momento do pedido e do aceite (MP 2.200-2/2001, art. 10, §2º, e Lei 14.063/2020). Data, hora e identificador do registro ficam guardados no sistema como lastro.</div>
</body></html>`;
}

export function imprimirTermoTroca(t: DpTrocaRow, empresa: { nome: string; cnpj?: string | null }) {
  return imprimirHtmlEmQuadro(termoTrocaHtml(t, empresa));
}
