// ------------------------------------------------------------------
// Domínio: DP → Certificado de validação de documento
//
// O certificado oficial é um PDF montado no servidor
// (`certificadoValidacaoPdf`): capa com os dados da aprovação, o documento
// assinado página por página, o comprovante de pagamento como anexo e o
// rodapé de lastro em todas as páginas.
//
// O HTML abaixo é a versão simples de leitura rápida, mantida como
// alternativa; a impressão fica isolada em `imprimirCertificadoValidacao`.
// ------------------------------------------------------------------
import { supabase } from "@/integrations/supabase/client";

/**
 * Pede ao servidor o certificado completo em PDF e devolve um endereço
 * temporário para abrir na própria tela (funciona no celular, onde abrir
 * outra aba é bloqueado). Lança erro com a frase pronta para a tela.
 */
export async function certificadoValidacaoPdf(
  documentoId: string,
): Promise<{ url: string; revogar: () => void }> {
  const { data, error } = await supabase.functions.invoke("dp-documento-certificado", {
    body: { documento_id: documentoId },
  });
  if (error) {
    let frase = "";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const corpo = (await ctx.json().catch(() => null)) as { error?: string } | null;
      frase = corpo?.error ?? "";
    }
    throw new Error(frase || "Não foi possível gerar o certificado agora.");
  }
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  return { url, revogar: () => URL.revokeObjectURL(url) };
}

export interface CertificadoValidacaoDados {
  empresa: string;
  colaborador: string;
  documentoTitulo: string;
  documentoTipo?: string | null;
  competencia?: string | null;
  arquivo?: string | null;
  /** ISO da aprovação */
  aceitoEm: string;
  aprovadoPor: string;
  ip?: string | null;
  dispositivo?: string | null;
  conteudoHash?: string | null;
  registroId?: string | null;
}

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function fmtDataHora(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

const ESTILO = `
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 0; padding: 16px; }
  .cert { border: 1px solid #ccc; border-radius: 6px; padding: 20px; }
  header { border-bottom: 2px solid #EB6119; padding-bottom: 8px; margin-bottom: 14px; }
  header h1 { margin: 0 0 4px; font-size: 17px; }
  header p { margin: 0; font-size: 11px; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  td { border: 1px solid #e5e5e5; padding: 6px 8px; vertical-align: top; width: 50%; }
  span.rot { display: block; font-size: 10px; color: #666; text-transform: uppercase; }
  .hash { font-family: "Courier New", monospace; font-size: 10px; word-break: break-all; }
  .texto { font-size: 11px; color: #333; line-height: 1.5; }
  .rodape { margin-top: 18px; font-size: 10px; color: #666; }
  @page { size: portrait; margin: 12mm; }
`;

/** HTML completo do certificado (uma página A4). */
export function certificadoValidacaoHtml(d: CertificadoValidacaoDados): string {
  const linha = (rot: string, valor: string, classe = "") =>
    `<td><span class="rot">${esc(rot)}</span><div class="${classe}">${esc(valor) || "—"}</div></td>`;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />
  <title>Certificado de validação — ${esc(d.documentoTitulo)}</title>
  <style>${ESTILO}</style></head>
  <body>
    <section class="cert">
      <header>
        <h1>Certificado de Validação de Documento</h1>
        <p>${esc(d.empresa)}</p>
      </header>

      <table>
        <tr>
          ${linha("Colaborador", d.colaborador)}
          ${linha("Documento", d.documentoTitulo)}
        </tr>
        <tr>
          ${linha("Tipo", d.documentoTipo ?? "—")}
          ${linha("Competência", d.competencia ?? "—")}
        </tr>
        <tr>
          ${linha("Data e hora da aprovação", fmtDataHora(d.aceitoEm))}
          ${linha("Aprovado por", d.aprovadoPor)}
        </tr>
        <tr>
          ${linha("Endereço IP", d.ip ?? "—")}
          ${linha("Arquivo", d.arquivo ?? "—")}
        </tr>
        <tr>
          ${linha("Dispositivo / navegador", d.dispositivo ?? "—", "texto")}
          ${linha("Código do registro", d.registroId ?? "—", "hash")}
        </tr>
        <tr>
          <td colspan="2"><span class="rot">Impressão digital do conteúdo</span>
            <div class="hash">${esc(d.conteudoHash) || "—"}</div></td>
        </tr>
      </table>

      <p class="texto">
        Este certificado comprova que o colaborador acima acessou e aprovou eletronicamente
        o documento identificado, declarando ter conferido e concordado com o seu conteúdo.
        A aprovação foi registrada pelo sistema com data, hora, endereço de internet e
        identificação do dispositivo utilizado, além da impressão digital do conteúdo
        aprovado, que permite verificar que o arquivo não foi alterado depois.
      </p>

      <p class="rodape">
        Emitido em ${esc(fmtDataHora(new Date().toISOString()))} · Documento gerado
        automaticamente pelo sistema a partir do registro eletrônico de aprovação.
      </p>
    </section>
  </body></html>`;
}

const BOTAO_IMPRIMIR = `
  <div style="text-align:center;margin-top:14px" class="acoes">
    <button type="button" onclick="window.print()"
      style="font:600 13px Arial,sans-serif;padding:10px 18px;border:0;border-radius:8px;background:#EB6119;color:#fff">
      Salvar em PDF / imprimir
    </button>
  </div>
  <style>@media print { .acoes { display:none } }</style>`;

/**
 * Abre o certificado em uma nova aba para leitura. A impressão (ou "salvar em
 * PDF", no celular) fica no botão dentro da página — nada é enviado direto
 * para a impressora. Retorna false se o navegador bloqueou a nova aba.
 */
export function imprimirCertificadoValidacao(d: CertificadoValidacaoDados): boolean {
  const html = certificadoValidacaoHtml(d).replace("</body>", `${BOTAO_IMPRIMIR}</body>`);
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    return false;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
