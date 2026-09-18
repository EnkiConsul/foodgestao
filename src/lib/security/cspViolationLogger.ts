/**
 * Observação de violações de CSP sem coletor e sem dados sensíveis.
 *
 * Nada é enviado pela rede: as violações são apenas escritas no console do
 * navegador, já reduzidas a origem + diretiva. Query strings, caminhos de
 * arquivo, trechos de script (`sample`), CPF, senhas e tokens nunca são lidos
 * nem registrados, porque só o `origin` da URL é aproveitado.
 */

/** Reduz qualquer URL a `esquema://host` (descarta caminho, query e fragmento). */
function apenasOrigem(valor: string | null | undefined): string {
  if (!valor) return "(desconhecido)";
  if (valor === "inline" || valor === "eval" || valor === "self" || valor === "data") return valor;
  try {
    const u = new URL(valor, window.location.origin);
    if (u.protocol === "blob:" || u.protocol === "data:") return u.protocol;
    return u.origin;
  } catch {
    return "(nao-analisavel)";
  }
}

export type ViolacaoCspSanitizada = {
  diretiva: string;
  bloqueado: string;
  paginaOrigem: string;
  modo: "report-only" | "enforce";
};

/** Monta o registro sanitizado de uma violação (exportado para teste). */
export function sanitizarViolacaoCsp(e: {
  effectiveDirective?: string;
  violatedDirective?: string;
  blockedURI?: string;
  documentURI?: string;
  disposition?: string;
}): ViolacaoCspSanitizada {
  return {
    diretiva: e.effectiveDirective || e.violatedDirective || "(sem-diretiva)",
    bloqueado: apenasOrigem(e.blockedURI),
    paginaOrigem: apenasOrigem(e.documentURI),
    modo: e.disposition === "enforce" ? "enforce" : "report-only",
  };
}

let instalado = false;

/** Instala o ouvinte de violações (idempotente). */
export function installCspViolationLogger(): void {
  if (instalado || typeof document === "undefined") return;
  instalado = true;
  document.addEventListener("securitypolicyviolation", (event) => {
    const registro = sanitizarViolacaoCsp(event as unknown as SecurityPolicyViolationEvent);
    console.warn("[CSP]", registro.modo, registro.diretiva, "bloquearia", registro.bloqueado, "em", registro.paginaOrigem);
  });
}
