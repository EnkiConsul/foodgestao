/**
 * Regras puras para orientar a instalação do app (atalho na tela inicial)
 * conforme o celular e o navegador em que a pessoa está.
 *
 * Por que existe: colaboradores abrem o link pelo WhatsApp, cuja janela
 * interna não permite instalar. No Android dá para sair dela automaticamente
 * (endereço "intent" do Chrome); no iPhone a Apple não permite, então a
 * orientação mostra exatamente onde tocar.
 */

export type SistemaAparelho = "ios" | "android" | "computador";
export type NavegadorAparelho = "safari" | "chrome" | "samsung" | "firefox" | "edge" | "outro";

export interface Aparelho {
  sistema: SistemaAparelho;
  navegador: NavegadorAparelho;
  /** Está dentro da janela interna de outro aplicativo (WhatsApp, Instagram...). */
  dentroDeApp: boolean;
  /** Nome do aplicativo hospedeiro, quando reconhecido. */
  appHospedeiro: string | null;
}

export type EstrategiaInstalacao =
  | "instalado"
  | "computador"
  /** Android com o instalador do navegador disponível: um toque instala. */
  | "android_instalar"
  /** Android dentro de outro app: botão abre o Chrome automaticamente. */
  | "android_sair_app"
  /** Android em navegador comum sem instalador liberado: menu ⋮. */
  | "android_menu"
  /** iPhone no Safari: Compartilhar → Adicionar à Tela de Início. */
  | "ios_safari"
  /** iPhone no Chrome/Edge/Firefox: Compartilhar da barra de endereço. */
  | "ios_outro_navegador"
  /** iPhone dentro de outro app: sair para o Safari pelo ícone Compartilhar. */
  | "ios_sair_app";

const HOSPEDEIROS: Array<[RegExp, string]> = [
  [/whatsapp/i, "WhatsApp"],
  [/instagram/i, "Instagram"],
  [/fban|fbav|fbios|fb_iab|fb4a/i, "Facebook"],
  [/tiktok|musical_ly|bytedance/i, "TikTok"],
  [/linkedinapp/i, "LinkedIn"],
  [/telegram/i, "Telegram"],
  [/micromessenger/i, "WeChat"],
  [/\bline\//i, "LINE"],
  [/gsa\//i, "Google"],
];

export function detectarAparelho(
  ua: string,
  extra: { platform?: string; maxTouchPoints?: number } = {},
): Aparelho {
  const texto = ua || "";
  const ipadOs = extra.platform === "MacIntel" && (extra.maxTouchPoints ?? 0) > 1;
  const ios = /iphone|ipad|ipod/i.test(texto) || ipadOs;
  const android = !ios && /android/i.test(texto);
  const sistema: SistemaAparelho = ios ? "ios" : android ? "android" : "computador";

  const hospedeiro = HOSPEDEIROS.find(([re]) => re.test(texto))?.[1] ?? null;

  let navegador: NavegadorAparelho = "outro";
  if (ios) {
    if (/crios/i.test(texto)) navegador = "chrome";
    else if (/fxios/i.test(texto)) navegador = "firefox";
    else if (/edgios/i.test(texto)) navegador = "edge";
    else if (/safari\//i.test(texto) && !hospedeiro) navegador = "safari";
  } else {
    if (/samsungbrowser/i.test(texto)) navegador = "samsung";
    else if (/firefox/i.test(texto)) navegador = "firefox";
    else if (/edga?\//i.test(texto)) navegador = "edge";
    else if (/chrome\//i.test(texto)) navegador = "chrome";
    else if (/safari\//i.test(texto)) navegador = "safari";
  }

  let dentroDeApp = Boolean(hospedeiro);
  if (ios && !dentroDeApp) {
    // Janela interna do iOS (WKWebView) não traz "Safari/" nem marca de outro navegador.
    dentroDeApp = navegador === "outro";
  }
  if (android && !dentroDeApp) {
    // WebView do Android se identifica com "; wv)".
    dentroDeApp = /;\s*wv\)/i.test(texto);
  }
  if (dentroDeApp && navegador === "safari") navegador = "outro";

  return { sistema, navegador, dentroDeApp, appHospedeiro: hospedeiro ?? (dentroDeApp ? "outro" : null) };
}

export function escolherEstrategia(
  aparelho: Aparelho,
  estado: { standalone: boolean; temPromptNativo: boolean },
): EstrategiaInstalacao {
  if (estado.standalone) return "instalado";
  if (aparelho.sistema === "computador") return "computador";
  if (aparelho.sistema === "android") {
    if (aparelho.dentroDeApp) return "android_sair_app";
    if (estado.temPromptNativo) return "android_instalar";
    return "android_menu";
  }
  if (aparelho.dentroDeApp) return "ios_sair_app";
  if (aparelho.navegador === "safari") return "ios_safari";
  return "ios_outro_navegador";
}

/** Acrescenta `instalar=1` para a próxima tela abrir a orientação sozinha. */
export function comMarcaInstalar(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("instalar", "1");
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Endereço que, no Android, tira a pessoa da janela do WhatsApp e abre o
 * mesmo endereço no Chrome. Sem Chrome, o próprio sistema usa o endereço normal.
 */
export function urlAbrirNoChromeAndroid(url: string): string {
  const u = new URL(url);
  const esquema = u.protocol.replace(":", "");
  const destino = `${u.origin}${u.pathname}${u.search}`;
  return (
    `intent://${u.host}${u.pathname}${u.search}` +
    `#Intent;scheme=${esquema};package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(destino)};end`
  );
}

/** No iPhone, abre o endereço no Chrome (quando instalado). */
export function urlAbrirNoChromeIos(url: string): string {
  const u = new URL(url);
  const esquema = u.protocol === "http:" ? "googlechrome" : "googlechromes";
  return `${esquema}://${u.host}${u.pathname}${u.search}`;
}

const CHAVE_INSTALADO = "aveto-app-instalado";

/** Registra que o app já foi aberto pelo ícone neste aparelho. */
export function marcarAppInstalado(armazenamento: Pick<Storage, "setItem"> | null = seguroLocalStorage()) {
  try {
    armazenamento?.setItem(CHAVE_INSTALADO, new Date().toISOString());
  } catch {
    // sem armazenamento: segue sem marcar
  }
}

export function appMarcadoComoInstalado(armazenamento: Pick<Storage, "getItem"> | null = seguroLocalStorage()): boolean {
  try {
    return Boolean(armazenamento?.getItem(CHAVE_INSTALADO));
  } catch {
    return false;
  }
}

/**
 * Se o convite deve aparecer. No Android o navegador e o app instalado
 * compartilham a memória, então a marca de "instalado" esconde o convite;
 * no iPhone essa memória é separada e a marca não chega ao Safari.
 */
export function deveOferecerInstalacao(estrategia: EstrategiaInstalacao, jaMarcado: boolean): boolean {
  if (estrategia === "instalado" || estrategia === "computador") return false;
  if (jaMarcado && estrategia.startsWith("android")) return false;
  return true;
}

function seguroLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}
