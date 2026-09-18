/**
 * Impressão de documentos HTML gerados pelo app, compatível com CSP restrita.
 *
 * Por que existe: abrir uma janela em branco e gravar o HTML nela depende de
 * pop-up liberado e herda a política da página; e scripts embutidos no HTML
 * gerado (tag de script com window.print, ou handler no atributo) são
 * bloqueados por `script-src` sem `'unsafe-inline'`. Aqui o HTML vai para um
 * quadro interno (iframe) servido por `blob:` — coberto por `child-src`/
 * `frame-src blob:` — e a impressão é disparada pelo próprio app, sem nenhum
 * executável embutido no documento.
 */

/** Escapa texto para interpolação segura em HTML (valores vindos do usuário). */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renderiza o HTML em um quadro oculto e abre a caixa de impressão
 * ("Salvar como PDF"). Retorna false só quando não há DOM disponível.
 */
export function imprimirHtmlEmQuadro(html: string, aoFalhar?: (erro: unknown) => void): boolean {
  if (typeof document === "undefined") return false;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch (e) {
      aoFalhar?.(e);
    }
    window.setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  document.body.appendChild(frame);
  return true;
}
