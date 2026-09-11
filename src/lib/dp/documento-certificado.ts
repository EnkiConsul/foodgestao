// ------------------------------------------------------------------
// Domínio: DP → Certificado de validação de documento
//
// Monta o HTML imprimível que comprova a aprovação eletrônica de um
// documento pelo colaborador. Função pura; a impressão fica isolada em
// `imprimirCertificadoValidacao` (único ponto que toca no browser).
// ------------------------------------------------------------------

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

/** Abre a janela de impressão do certificado. Retorna false se o popup foi bloqueado. */
export function imprimirCertificadoValidacao(d: CertificadoValidacaoDados): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(certificadoValidacaoHtml(d));
  win.document.close();
  setTimeout(() => win.print(), 300);
  return true;
}
