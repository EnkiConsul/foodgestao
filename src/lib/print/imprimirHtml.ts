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

/** Aviso padrão quando a impressão não pôde ser aberta. */
export const FALHA_IMPRESSAO =
  "Não foi possível abrir a impressão. Tente novamente ou use Imprimir no menu do navegador.";

/** Tempo máximo de espera pelo carregamento do quadro antes de desistir. */
const LIMITE_CARREGAMENTO_MS = 10_000;

/**
 * Renderiza o HTML em um quadro oculto e pede ao navegador a caixa de
 * impressão ("Salvar como PDF").
 *
 * O retorno indica apenas que a SOLICITAÇÃO foi iniciada — não confirma que a
 * caixa de impressão apareceu nem que o PDF foi gerado, o que o navegador não
 * informa. Qualquer falha detectável (criação do endereço temporário, inserção
 * do quadro, erro ou demora no carregamento, quadro sem janela acessível, erro
 * ao chamar imprimir) dispara `aoFalhar`; sem `aoFalhar`, mostra um aviso na
 * tela. A limpeza (remover o quadro e liberar o endereço) é idempotente e
 * acontece em todos os caminhos.
 */
export function imprimirHtmlEmQuadro(html: string, aoFalhar?: (erro: unknown) => void): boolean {
  const avisar = (erro: unknown) => {
    if (aoFalhar) {
      aoFalhar(erro);
      return;
    }
    if (import.meta.env?.DEV) console.error("[impressão]", erro);
    void import("sonner")
      .then(({ toast }) => toast.error(FALHA_IMPRESSAO))
      .catch(() => {
        /* sem UI de aviso disponível */
      });
  };

  if (typeof document === "undefined" || !document.body) {
    avisar(new Error("Sem DOM disponível para imprimir."));
    return false;
  }

  let url: string | null = null;
  let frame: HTMLIFrameElement | null = null;
  let limpo = false;
  let cronometro: number | undefined;

  const limpar = () => {
    if (limpo) return;
    limpo = true;
    if (cronometro !== undefined) {
      window.clearTimeout(cronometro);
      cronometro = undefined;
    }
    try {
      frame?.remove();
    } catch {
      /* quadro já removido */
    }
    try {
      if (url) URL.revokeObjectURL(url);
    } catch {
      /* endereço já liberado */
    }
    frame = null;
  };

  const falhar = (erro: unknown) => {
    limpar();
    avisar(erro);
  };

  try {
    url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("title", "Documento para impressão");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.onerror = () => falhar(new Error("O quadro de impressão não carregou."));
    frame.onload = () => {
      if (limpo) return;
      if (cronometro !== undefined) {
        window.clearTimeout(cronometro);
        cronometro = undefined;
      }
      const janela = frame?.contentWindow;
      if (!janela || typeof janela.print !== "function") {
        falhar(new Error("O quadro de impressão ficou sem janela acessível."));
        return;
      }
      try {
        janela.focus();
        janela.print();
      } catch (e) {
        falhar(e);
        return;
      }
      // Mantém o quadro por um tempo: alguns navegadores só leem o conteúdo
      // enquanto a caixa de impressão está aberta.
      cronometro = window.setTimeout(limpar, 60_000);
    };
    frame.src = url;
    document.body.appendChild(frame);
    cronometro = window.setTimeout(
      () => falhar(new Error("O documento demorou demais para ficar pronto.")),
      LIMITE_CARREGAMENTO_MS,
    );
    return true;
  } catch (e) {
    falhar(e);
    return false;
  }
}
