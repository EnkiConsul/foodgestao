// Sessão única por usuário: cada navegador/aparelho tem um identificador estável.
// Ao entrar, o aparelho assume a sessão ativa e os demais são desconectados.
const CHAVE_ID = "auth_device_session_id";
export const CHAVE_MOTIVO_SAIDA = "auth_session_takeover";

function gerarId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* ignora */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function obterSessionIdLocal(): string {
  try {
    const atual = localStorage.getItem(CHAVE_ID);
    if (atual && atual.length >= 8) return atual;
    const novo = gerarId();
    localStorage.setItem(CHAVE_ID, novo);
    return novo;
  } catch {
    return gerarId();
  }
}

export function descreverAparelho(): string {
  try {
    const ua = navigator.userAgent ?? "";
    const plataforma = /iPhone|iPad|Android|Mobile/i.test(ua) ? "Celular" : "Computador";
    const navegador = /Edg\//.test(ua)
      ? "Edge"
      : /OPR\//.test(ua)
        ? "Opera"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : /Firefox\//.test(ua)
              ? "Firefox"
              : "Navegador";
    return `${plataforma} · ${navegador}`;
  } catch {
    return "Aparelho";
  }
}
